-- SIGER4 - Distinguir HTTP 401 del gateway de Supabase Edge Functions (JWT
-- verification) del HTTP 401 propio del codigo de send-push-system
-- (x-cron-secret incorrecto)
--
-- Seguimiento del 401 persistente: el fix de 0090 (trim() en la comparacion
-- del secreto) no resolvio el problema -- el 401 sigue apareciendo incluso
-- despues de resetear CRON_SHARED_SECRET en ambos lados y redesplegar
-- send-push-system. Eso descarta un mismatch de VALOR del secreto como
-- causa unica: si el 401 viniera del codigo de la funcion (comparacion
-- providedSecret !== expectedSecret), un reset prolijo de ambos valores lo
-- habria resuelto.
--
-- Diagnostico de infraestructura confirmado por el reporte:
--   - project_url/cron_shared_secret: configurados
--   - pg_net: instalado y llamando (13 requests/7 dias, 11 con respuesta)
--   - ultima respuesta: HTTP 401
--   - test_push_dispatcher_auth() (0090): tampoco confirma autorizacion
--
-- Hipotesis mas fuerte, a partir de revisar el repo: NO EXISTE
-- supabase/config.toml en este proyecto, y ningun comando de deploy
-- documentado en DEPLOYMENT.md usa --no-verify-jwt. Toda Edge Function de
-- Supabase se despliega por default con verify_jwt=true -- el GATEWAY de
-- Supabase (no nuestro codigo) exige un JWT valido en el header
-- Authorization ANTES de que la request llegue siquiera a Deno.serve().
-- dispatch_notification_push() (0085/0089/0090) nunca mandaba ese header
-- -- solo Content-Type y x-cron-secret (ver net.http_post en esa funcion).
-- Si send-push-system quedo desplegada con verify_jwt=true en algun
-- momento (el valor por defecto, y no hay nada en el repo que lo
-- desactive), CADA llamada de pg_net es rechazada por el gateway con 401
-- "Missing authorization header" -- un 401 que ni siquiera ejecuta la
-- comparacion de x-cron-secret. Ningun trim()/reset de secretos en
-- system_settings o en el Edge Secret puede arreglar esto, porque el
-- codigo de la funcion nunca corre.
--
-- Esta migracion no puede en si misma desactivar verify_jwt (eso se
-- configura en el deploy, ver comando mas abajo / DEPLOYMENT.md) -- pero
-- SI puede dar la prueba definitiva: net._http_response.content trae el
-- BODY real de la respuesta HTTP. El gateway de Supabase y el codigo de
-- send-push-system devuelven bodies con forma completamente distinta:
--   - Gateway (JWT rechazado):    {"code":401,"message":"Missing authorization header"}
--     o similar ("Invalid JWT", "invalid claim: missing sub claim", etc)
--   - Nuestro codigo (0089/index.ts): {"sent":0,"error":"No autorizado."}
-- Antes de esta migracion, ni get_push_infra_diagnostics() ni
-- test_push_dispatcher_auth() leian esa columna -- el diagnostico solo
-- tenia status_code, insuficiente para distinguir ambas causas (las dos
-- dan 401).

-- ============================================================
-- 1. test_push_dispatcher_auth(): agrega el body real (truncado, nunca
--    puede contener el secreto porque ninguna de las dos respuestas
--    posibles lo incluye) y distingue gateway vs funcion.
-- ============================================================

drop function if exists test_push_dispatcher_auth();

create or replace function test_push_dispatcher_auth()
returns table (
  project_url_configured boolean,
  cron_shared_secret_configured boolean,
  pg_net_installed boolean,
  request_sent boolean,
  http_status_code integer,
  response_body text,
  diagnosis text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_pg_net_installed boolean;
  v_request_id bigint;
  v_status_code integer;
  v_error_msg text;
  v_content text;
  v_waited integer := 0;
  v_looks_like_gateway boolean;
begin
  if not is_super_admin() then
    raise exception 'Solo informatica_r4 puede ejecutar la prueba de autorización del dispatcher de push.';
  end if;

  v_project_url := nullif(trim(get_system_setting('project_url')), '');
  v_cron_secret := nullif(trim(get_system_setting('cron_shared_secret')), '');
  select exists(select 1 from pg_extension where extname = 'pg_net') into v_pg_net_installed;

  if v_project_url is null or v_cron_secret is null or not v_pg_net_installed then
    return query select
      v_project_url is not null,
      v_cron_secret is not null,
      v_pg_net_installed,
      false,
      null::integer,
      null::text,
      case
        when not v_pg_net_installed then 'La extensión pg_net no está instalada -- no se puede hacer la prueba.'
        when v_project_url is null and v_cron_secret is null then 'Faltan project_url y cron_shared_secret en Configuración del sistema.'
        when v_project_url is null then 'Falta project_url en Configuración del sistema.'
        else 'Falta cron_shared_secret en Configuración del sistema.'
      end;
    return;
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object('notificationId', '00000000-0000-0000-0000-000000000000')
  ) into v_request_id;

  while v_waited < 15 loop
    select r.status_code, r.error_msg, r.content into v_status_code, v_error_msg, v_content
    from net._http_response r
    where r.id = v_request_id;
    exit when v_status_code is not null or v_error_msg is not null;
    perform pg_sleep(0.2);
    v_waited := v_waited + 1;
  end loop;

  -- El gateway de Supabase (verify_jwt) devuelve un body con "message" y
  -- referencias a JWT/authorization; nuestro codigo (index.ts) siempre
  -- devuelve {"sent":..., "error": "..."} -- nunca "message", nunca menciona
  -- JWT. Chequeo por contenido, no solo por status_code, porque ambos casos
  -- dan 401.
  v_looks_like_gateway := v_content is not null and (
    v_content ilike '%missing authorization%'
    or v_content ilike '%invalid jwt%'
    or v_content ilike '%invalid claim%'
    or v_content ilike '%"message"%'
    or v_content ilike '%jwt expired%'
  );

  return query select
    true,
    true,
    v_pg_net_installed,
    true,
    v_status_code,
    left(v_content, 300),
    case
      when v_status_code is null and v_error_msg is not null then 'pg_net no pudo completar la llamada: ' || v_error_msg
      when v_status_code is null then 'pg_net todavía no registró respuesta (probá de nuevo en unos segundos).'
      when v_status_code = 401 and v_looks_like_gateway then 'HTTP 401 del GATEWAY de Supabase (no de nuestro código): la Edge Function send-push-system exige un JWT válido antes de ejecutar su lógica, y pg_net nunca manda ese header (solo x-cron-secret). Hay que redesplegar send-push-system con verificación de JWT desactivada -- ver "supabase functions deploy send-push-system --no-verify-jwt". Ningún cambio en cron_shared_secret puede arreglar esto.'
      when v_status_code = 401 then 'HTTP 401 de nuestro código (send-push-system): el secreto x-cron-secret NO coincide. Verificá que system_settings.cron_shared_secret y el Edge Secret CRON_SHARED_SECRET sean exactamente iguales (cuidado con espacios o saltos de línea al pegarlos), y que la función esté redesplegada tras el último cambio.'
      when v_status_code = 404 then 'HTTP 404 con notificación inexistente esperada -- ¡autorización correcta! El secreto está sincronizado y no hay problema de JWT.'
      when v_status_code = 500 then 'HTTP 500 -- la Edge Function está autorizando bien, pero falla internamente (revisar logs de send-push-system: probablemente faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/SUPABASE_SERVICE_ROLE_KEY).'
      when v_status_code between 200 and 299 then 'Respuesta 2xx inesperada para una notificación inexistente -- revisar manualmente.'
      else 'HTTP ' || v_status_code || ' -- respuesta inesperada, revisar logs de send-push-system.'
    end;
end;
$$;

comment on function test_push_dispatcher_auth() is 'Prueba directa de infraestructura del dispatcher de push -- SOLO informatica_r4 (is_super_admin()). Llama a send-push-system con un notificationId inexistente (nunca manda un push real). Revision 0092: ademas del status_code, lee el BODY real de la respuesta (net._http_response.content, truncado a 300 caracteres) para distinguir un 401 del GATEWAY de Supabase Edge Functions (verify_jwt=true, rechaza antes de ejecutar nuestro codigo -- el body menciona "Missing authorization header"/"Invalid JWT") de un 401 de NUESTRO CODIGO (x-cron-secret no coincide -- el body es {"sent":0,"error":"No autorizado."}). Un HTTP 404 significa autorizacion correcta. No expone el valor del secreto en ningun momento -- ninguno de los dos bodies posibles lo incluye.';

revoke all on function test_push_dispatcher_auth() from public;
grant execute on function test_push_dispatcher_auth() to authenticated;

-- ============================================================
-- 2. get_push_infra_diagnostics(): agrega el body de la ultima respuesta
--    para el mismo diagnostico pasivo (basado en las llamadas reales del
--    trigger, no en la prueba activa de arriba).
-- ============================================================

drop function if exists get_push_infra_diagnostics();

create or replace function get_push_infra_diagnostics()
returns table (
  project_url_configured boolean,
  cron_shared_secret_configured boolean,
  pg_net_installed boolean,
  recent_requests_count integer,
  recent_responses_count integer,
  last_response_status_code integer,
  last_response_error text,
  last_response_body text,
  last_response_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_pg_net_installed boolean;
  v_recent_requests integer := 0;
  v_recent_responses integer := 0;
  v_last_status integer;
  v_last_error text;
  v_last_content text;
  v_last_at timestamptz;
begin
  if not is_super_admin() then
    raise exception 'Solo informatica_r4 puede consultar el diagnóstico de infraestructura de push.';
  end if;

  select exists(select 1 from pg_extension where extname = 'pg_net') into v_pg_net_installed;

  if v_pg_net_installed then
    begin
      select count(*) into v_recent_requests
      from push_send_log
      where pg_net_request_id is not null and created_at >= now() - interval '7 days';

      select
        count(r.id),
        (array_agg(r.status_code order by r.created desc))[1],
        (array_agg(r.error_msg order by r.created desc))[1],
        (array_agg(left(r.content, 300) order by r.created desc))[1],
        max(r.created)
      into v_recent_responses, v_last_status, v_last_error, v_last_content, v_last_at
      from push_send_log psl
      join net._http_response r on r.id = psl.pg_net_request_id
      where psl.created_at >= now() - interval '7 days';
    exception
      when others then
        v_recent_responses := null;
    end;
  end if;

  return query select
    get_system_setting('project_url') is not null,
    get_system_setting('cron_shared_secret') is not null,
    v_pg_net_installed,
    v_recent_requests,
    v_recent_responses,
    v_last_status,
    v_last_error,
    v_last_content,
    v_last_at;
end;
$$;

comment on function get_push_infra_diagnostics() is 'Diagnostico consolidado de infraestructura de push -- SOLO informatica_r4 (is_super_admin()). Reporta si project_url/cron_shared_secret estan configurados (sin exponer el valor), si la extension pg_net esta instalada, cuantas llamadas a pg_net se registraron en los ultimos 7 dias, y la ultima respuesta HTTP real (status_code/error/body truncado a 300 caracteres, cruzando contra net._http_response) -- revision 0092: el body permite distinguir un 401 del gateway de Supabase (verify_jwt, "Missing authorization header"/"Invalid JWT") de un 401 de nuestro codigo (x-cron-secret incorrecto, {"sent":0,"error":"No autorizado."}). Ver test_push_dispatcher_auth() para una prueba activa con el mismo diagnostico.';

revoke all on function get_push_infra_diagnostics() from public;
grant execute on function get_push_infra_diagnostics() to authenticated;
