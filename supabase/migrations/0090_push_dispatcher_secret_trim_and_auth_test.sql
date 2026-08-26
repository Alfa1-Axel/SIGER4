-- SIGER4 - Fix HTTP 401 real en el dispatcher de push + diagnostico que
-- interpreta el status_code en vez de decir "sin resultado" cuando ya hay
-- una respuesta HTTP registrada.
--
-- Diagnostico de campo (get_push_infra_diagnostics, 0089) confirmo:
--   - project_url: configurado
--   - cron_shared_secret: configurado
--   - pg_net: instalado
--   - llamadas a pg_net (7 dias): 4, respuestas: 2, ultima: HTTP 401
-- No es un problema de suscripciones (existen y estan activas) ni de
-- pg_net (esta instalado y procesando). El contrato de header entre
-- dispatch_notification_push() (0085/0089) y send-push-system tampoco
-- cambio: ambos lados siempre usaron el mismo nombre de header
-- ("x-cron-secret") y el mismo nombre de secreto (CRON_SHARED_SECRET via
-- system_settings del lado SQL, Deno.env del lado Edge Function) -- no
-- hubo nunca un mismatch de contrato (Authorization vs x-cron-secret,
-- apikey, etc).
--
-- Causa real: ninguno de los dos lados aplicaba trim() al valor del
-- secreto antes de compararlo. SystemSettingsSection.tsx SI hace
-- `.trim()` al guardar en system_settings desde la UI, pero el Edge
-- Secret CRON_SHARED_SECRET se setea por fuera de esta app (`supabase
-- secrets set` o el Dashboard) -- un espacio, tab, o salto de linea
-- pegado por error ahi (por ejemplo copiando desde un archivo .env con
-- newline final, o desde una terminal que agrega CRLF) queda en el valor
-- que lee Deno.env.get('CRON_SHARED_SECRET') y la comparacion estricta
-- (!==) en send-push-system falla con 401 -- sin dejar ninguna pista de
-- que el problema es whitespace invisible, no un secreto "distinto".
--
-- Fix (ver tambien supabase/functions/send-push-system/index.ts, que
-- ahora aplica el mismo trim() del lado Edge Function):
--   1. dispatch_notification_push() aplica trim() a v_cron_secret antes
--      de mandarlo en el header -- si algun dia se vuelve a setear
--      cron_shared_secret con espacios via SQL directo (nunca deberia
--      pasar, pero set_system_setting no lo prohibe), el trigger igual
--      manda el valor limpio.
--   2. test_push_dispatcher_auth(): RPC solo para informatica_r4 que hace
--      una llamada real minima a send-push-system (notificationId
--      inexistente a proposito, la Edge Function responde 404 "La
--      notificación no existe" DESPUES de pasar la validacion de
--      autorizacion -- nunca intenta mandar un push real) para confirmar
--      en el momento si el secreto esta sincronizado, sin esperar al
--      proximo insert en notifications ni cruzar tablas de pg_net.
--   3. get_push_infra_diagnostics() no cambia su forma (ya devolvia
--      last_response_status_code), pero el diagnostico de Ajustes
--      (AjustesPage.tsx) ahora interpreta ese status_code en vez de
--      mostrar "sin resultado" para una llamada que ya tiene respuesta.

-- ============================================================
-- 1. dispatch_notification_push(): trim() sobre el secreto antes de
--    mandarlo en el header x-cron-secret.
-- ============================================================

create or replace function dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_missing text;
  v_request_id bigint;
begin
  v_project_url := nullif(trim(get_system_setting('project_url')), '');
  v_cron_secret := nullif(trim(get_system_setting('cron_shared_secret')), '');

  if v_project_url is null or v_cron_secret is null then
    v_missing := case
      when v_project_url is null and v_cron_secret is null then 'missing_project_url,missing_cron_shared_secret'
      when v_project_url is null then 'missing_project_url'
      else 'missing_cron_shared_secret'
    end;
    insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, error_message)
    values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'not_attempted', v_missing);
    return new;
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object('notificationId', new.id)
  ) into v_request_id;

  insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, pg_net_request_id)
  values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'dispatched', v_request_id);

  return new;
exception
  when others then
    insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, error_message)
    values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'not_attempted', 'pg_net_error: ' || sqlerrm);
    return new;
end;
$$;

comment on function dispatch_notification_push() is 'Trigger AFTER INSERT ON notifications: dispara el push real via pg_net -> send-push-system para CUALQUIER notificacion. Revision 0090: aplica trim() (y nullif de string vacio) a project_url/cron_shared_secret antes de usarlos -- ver supabase/functions/send-push-system/index.ts para el trim() correspondiente del lado Edge Function. Revision 0089: deja SIEMPRE una fila en push_send_log (status=not_attempted si falta config, status=dispatched con pg_net_request_id si SI llamo a net.http_post). Ver get_push_infra_diagnostics() para cruzar pg_net_request_id contra la respuesta HTTP real, y test_push_dispatcher_auth() (0090) para una prueba directa de autorizacion sin esperar al proximo insert.';

revoke all on function dispatch_notification_push() from public;

-- ============================================================
-- 2. test_push_dispatcher_auth(): prueba directa de infraestructura,
--    solo informatica_r4. Llama a send-push-system con un notificationId
--    que no existe a proposito -- la Edge Function valida el header
--    x-cron-secret PRIMERO (401 si no coincide) y recien despues busca la
--    notificacion (404 si no existe), asi que un 404 acá confirma que la
--    autorizacion paso y el secreto esta sincronizado, sin mandar ningun
--    push real. No expone el valor del secreto en ningun momento.
-- ============================================================

create or replace function test_push_dispatcher_auth()
returns table (
  project_url_configured boolean,
  cron_shared_secret_configured boolean,
  pg_net_installed boolean,
  request_sent boolean,
  http_status_code integer,
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
  v_waited integer := 0;
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
      case
        when not v_pg_net_installed then 'La extensión pg_net no está instalada -- no se puede hacer la prueba.'
        when v_project_url is null and v_cron_secret is null then 'Faltan project_url y cron_shared_secret en Configuración del sistema.'
        when v_project_url is null then 'Falta project_url en Configuración del sistema.'
        else 'Falta cron_shared_secret en Configuración del sistema.'
      end;
    return;
  end if;

  -- notificationId inexistente a proposito: nunca dispara un push real,
  -- solo prueba si la Edge Function acepta el secreto.
  select net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object('notificationId', '00000000-0000-0000-0000-000000000000')
  ) into v_request_id;

  -- net.http_post es async: la respuesta puede tardar hasta un par de
  -- segundos en aparecer en net._http_response. Se espera activamente
  -- (poll corto, maximo ~3s) en vez de devolver "sin resultado todavia"
  -- de entrada -- esta RPC es una prueba puntual bajo demanda, no un
  -- trigger fire-and-forget, así que el usuario espera un resultado.
  while v_waited < 15 loop
    select r.status_code, r.error_msg into v_status_code, v_error_msg
    from net._http_response r
    where r.id = v_request_id;
    exit when v_status_code is not null or v_error_msg is not null;
    perform pg_sleep(0.2);
    v_waited := v_waited + 1;
  end loop;

  return query select
    true,
    true,
    v_pg_net_installed,
    true,
    v_status_code,
    case
      when v_status_code is null and v_error_msg is not null then 'pg_net no pudo completar la llamada: ' || v_error_msg
      when v_status_code is null then 'pg_net todavía no registró respuesta (probá de nuevo en unos segundos).'
      when v_status_code = 401 then 'HTTP 401 -- el secreto NO está sincronizado. Verificá que system_settings.cron_shared_secret y el Edge Secret CRON_SHARED_SECRET de send-push-system sean exactamente iguales (cuidado con espacios o saltos de línea al pegarlos).'
      when v_status_code = 404 then 'HTTP 404 con notificación inexistente esperada -- ¡autorización correcta! El secreto está sincronizado.'
      when v_status_code = 500 then 'HTTP 500 -- la Edge Function está autorizando bien, pero falla internamente (revisar logs de send-push-system: probablemente faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/SUPABASE_SERVICE_ROLE_KEY).'
      when v_status_code between 200 and 299 then 'Respuesta 2xx inesperada para una notificación inexistente -- revisar manualmente.'
      else 'HTTP ' || v_status_code || ' -- respuesta inesperada, revisar logs de send-push-system.'
    end;
end;
$$;

comment on function test_push_dispatcher_auth() is 'Prueba directa de infraestructura del dispatcher de push -- SOLO informatica_r4 (is_super_admin()). Llama a send-push-system con un notificationId inexistente (nunca manda un push real) para confirmar en el momento si el header x-cron-secret está sincronizado entre system_settings.cron_shared_secret y el Edge Secret CRON_SHARED_SECRET, sin esperar al próximo insert en notifications ni cruzar tablas de pg_net a mano. Un HTTP 404 en la respuesta significa autorización correcta (la Edge Function llegó a buscar la notificación y no la encontró, como se esperaba); un 401 significa secreto desincronizado. No expone el valor del secreto en ningún momento.';

revoke all on function test_push_dispatcher_auth() from public;
grant execute on function test_push_dispatcher_auth() to authenticated;
