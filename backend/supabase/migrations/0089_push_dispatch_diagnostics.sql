-- SIGER4 - Diagnostico preciso de "push no intentado" + registro real de
-- cada intento de dispatch_notification_push (incluso cuando NO llama a
-- pg_net)
--
-- Problema reportado: el diagnostico de Ajustes mostraba "push no
-- intentado" para varias notificaciones (prueba, recordatorio semanal,
-- resumen semanal) con suscripciones activas confirmadas -- pero antes de
-- esta migracion, "no intentado" era indistinguible entre:
--   a) project_url/cron_shared_secret no configurados en system_settings;
--   b) net.http_post se llamo pero pg_net nunca proceso la request
--      (extension no habilitada, cola de pg_net atascada, timeout);
--   c) send-push-system respondio con error (401 si CRON_SHARED_SECRET del
--      Edge Function no coincide con system_settings.cron_shared_secret,
--      500 si a la Edge Function le faltan sus propios secretos VAPID/
--      SERVICE_ROLE, etc.);
--   d) nunca hubo notificaciones para ese tipo en el rango de fechas
--      (0 filas, no es un error).
-- Causa exacta: dispatch_notification_push() (0085) solo insertaba en
-- push_send_log DESPUES de que send-push-system respondiera (y eso lo hace
-- la propia Edge Function, no el trigger) -- si el trigger nunca llegaba a
-- disparar net.http_post (falta config) o la llamada quedaba sin respuesta
-- (pg_net caido/en cola), NO QUEDABA NINGUNA FILA en push_send_log. El
-- diagnostico (get_own_push_diagnostics, 0086) interpretaba "sin fila" como
-- "no intentado" sin poder decir POR QUE.
--
-- Fix: dispatch_notification_push() ahora deja rastro SIEMPRE, sin importar
-- si logra llamar a pg_net o no:
--   - Si falta project_url o cron_shared_secret: inserta una fila en
--     push_send_log con status='not_attempted' y error_message explicito
--     (distingue cual de los dos falta).
--   - Si llama a net.http_post: guarda el request_id que devuelve (columna
--     nueva pg_net_request_id) -- permite despues cruzar contra
--     net._http_response (tabla interna de pg_net que registra el
--     status_code/error real de cada request async) para saber si la
--     llamada quedo pendiente, si pg_net nunca la proceso, o que respondio
--     realmente send-push-system.
-- get_push_infra_diagnostics() (nueva) consolida en una sola llamada: si
-- project_url/cron_shared_secret estan configurados, si pg_net esta
-- instalado, y las ultimas respuestas HTTP reales que pg_net registro para
-- llamadas a send-push-system -- para que informatica pueda diagnosticar
-- sin tener que cruzar tablas a mano.

-- ============================================================
-- 1. push_send_log: nuevo status 'not_attempted' + columna para el
--    request_id de pg_net.
-- ============================================================

alter table push_send_log drop constraint if exists push_send_log_status_check;
alter table push_send_log
  add constraint push_send_log_status_check
  check (status in ('ok', 'error', 'rate_limited', 'duplicate', 'not_attempted', 'dispatched'));

comment on constraint push_send_log_status_check on push_send_log is 'Agrega dos status nuevos (0089), ambos escritos por el TRIGGER (dispatch_notification_push), no por las Edge Functions: not_attempted = no se pudo llamar a pg_net (falta project_url/cron_shared_secret, o pg_net no esta instalado -- ver error_message); dispatched = el trigger SI llamo a net.http_post (guarda el request_id en pg_net_request_id), pero esta fila no dice si send-push-system respondio bien -- eso lo determina la fila status=ok/error que la propia Edge Function inserta despues al procesar el pedido (indice unico parcial sobre notification_id where status=ok sigue siendo la fuente real de deduplicacion, estas dos filas nuevas nunca compiten con eso).';

alter table push_send_log
  add column if not exists pg_net_request_id bigint;

comment on column push_send_log.pg_net_request_id is 'request_id devuelto por net.http_post() al disparar send-push-system (0089) -- permite cruzar contra net._http_response (tabla interna de la extension pg_net) para ver el status_code/error real de esa llamada HTTP asincrona. Null si status=not_attempted (nunca se llego a llamar a pg_net) o si la fila la escribio la propia Edge Function (send-push/send-push-system escriben su resultado directo, no via este campo).';

-- ============================================================
-- 2. dispatch_notification_push(): deja rastro SIEMPRE, incluso sin poder
--    llamar a pg_net. Guarda el request_id cuando si llama.
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
  v_project_url := get_system_setting('project_url');
  v_cron_secret := get_system_setting('cron_shared_secret');

  if v_project_url is null or v_cron_secret is null then
    -- Antes: se retornaba sin dejar ningun rastro -- el diagnostico de
    -- Ajustes no podia distinguir esto de "pg_net nunca respondio". Ahora
    -- queda una fila explicita con la causa exacta (distingue cual de los
    -- dos valores falta, o si faltan ambos).
    v_missing := case
      when v_project_url is null and v_cron_secret is null then 'missing_project_url,missing_cron_shared_secret'
      when v_project_url is null then 'missing_project_url'
      else 'missing_cron_shared_secret'
    end;
    insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, error_message)
    values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'not_attempted', v_missing);
    return new;
  end if;

  -- net.http_post() devuelve el request_id de la cola asincrona de pg_net
  -- de inmediato (no espera la respuesta HTTP real) -- se guarda para poder
  -- cruzarlo despues contra net._http_response y saber que paso realmente
  -- con esa llamada puntual (get_push_infra_diagnostics, mas abajo).
  select net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object('notificationId', new.id)
  ) into v_request_id;

  -- No se inserta una fila 'ok' aca: send-push-system es quien reclama la
  -- deduplicacion real (indice unico parcial sobre notification_id where
  -- status='ok', migracion 0025) cuando efectivamente procesa el pedido.
  -- Esta fila 'dispatched' con request_id NO cuenta para esa deduplicacion
  -- (el indice unico es solo sobre status='ok'), asi que no bloquea el
  -- insert real que hace send-push-system -- es pura trazabilidad de que
  -- el trigger si disparo la llamada, para poder cruzar despues contra
  -- net._http_response y saber que respondio.
  insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, pg_net_request_id)
  values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'dispatched', v_request_id);

  return new;
exception
  when others then
    -- net.http_post puede lanzar si pg_net no esta instalado/habilitado
    -- (function net.http_post does not exist) -- sin este catch, ESO
    -- rompia el insert completo de la notificacion (el trigger es AFTER
    -- INSERT, pero una excepcion sin capturar en un trigger revierte toda
    -- la transaccion, incluida la fila que se estaba insertando). Se deja
    -- constancia del error real y se permite que la notificacion interna
    -- se guarde igual -- el push es una mejora, nunca un requisito.
    insert into push_send_log (notification_id, profile_id, region_id, subsede_id, station_id, status, error_message)
    values (new.id, new.profile_id, new.region_id, new.subsede_id, new.station_id, 'not_attempted', 'pg_net_error: ' || sqlerrm);
    return new;
end;
$$;

comment on function dispatch_notification_push() is 'Trigger AFTER INSERT ON notifications: dispara el push real via pg_net -> send-push-system para CUALQUIER notificacion. Revision 0089: ahora deja SIEMPRE una fila en push_send_log. Si falta project_url/cron_shared_secret (o pg_net no esta instalado, capturado en el EXCEPTION handler): status=not_attempted con error_message explicito. Si SI logra llamar a net.http_post: status=dispatched con pg_net_request_id (la llamada quedo en la cola async de pg_net, todavia sin resultado conocido en este mismo insert). Antes de 0089, los casos de "no se pudo llamar" no dejaban ningun rastro -- el diagnostico de Ajustes no podia distinguir "nunca se intento" de "se intento y no hay respuesta todavia". Ver get_push_infra_diagnostics() para cruzar pg_net_request_id contra la respuesta HTTP real.';

revoke all on function dispatch_notification_push() from public;

-- ============================================================
-- 3. get_push_infra_diagnostics(): diagnostico consolidado de
--    infraestructura -- SOLO informatica_r4 (mismo criterio que
--    list_system_settings_status, que ya requiere is_super_admin() para
--    esto, no solo is_informatica_r4()/integrante_informatica -- project_url/
--    cron_shared_secret son datos de infraestructura sensibles).
-- ============================================================

create or replace function get_push_infra_diagnostics()
returns table (
  project_url_configured boolean,
  cron_shared_secret_configured boolean,
  pg_net_installed boolean,
  recent_requests_count integer,
  recent_responses_count integer,
  last_response_status_code integer,
  last_response_error text,
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
  v_last_at timestamptz;
begin
  if not is_super_admin() then
    raise exception 'Solo informatica_r4 puede consultar el diagnóstico de infraestructura de push.';
  end if;

  select exists(select 1 from pg_extension where extname = 'pg_net') into v_pg_net_installed;

  -- net._http_response es una tabla interna de la extension pg_net (no
  -- documentada como API publica, pero es la unica fuente real de "que
  -- respondio el servidor" para una llamada async de net.http_post) -- se
  -- accede solo si la extension esta instalada, y solo a las respuestas de
  -- request_id que este mismo sistema guardo en push_send_log (nunca todas
  -- las de net._http_response, que podria tener trafico de otras
  -- funciones). Si la tabla no existe o el acceso falla por cualquier
  -- motivo, se degrada a null sin romper el resto del diagnostico.
  if v_pg_net_installed then
    begin
      select count(*) into v_recent_requests
      from push_send_log
      where pg_net_request_id is not null and created_at >= now() - interval '7 days';

      select
        count(r.id),
        (array_agg(r.status_code order by r.created desc))[1],
        (array_agg(r.error_msg order by r.created desc))[1],
        max(r.created)
      into v_recent_responses, v_last_status, v_last_error, v_last_at
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
    v_last_at;
end;
$$;

comment on function get_push_infra_diagnostics() is 'Diagnostico consolidado de infraestructura de push -- SOLO informatica_r4 (is_super_admin()). Reporta si project_url/cron_shared_secret estan configurados (sin exponer el valor), si la extension pg_net esta instalada, cuantas llamadas a pg_net se registraron en los ultimos 7 dias (push_send_log.pg_net_request_id), y la ultima respuesta HTTP real que pg_net capturo para esas llamadas (status_code/error, cruzando contra net._http_response) -- distingue "nunca se llamo" de "se llamo pero pg_net no proceso nada" de "se llamo y el servidor respondio con error".';

revoke all on function get_push_infra_diagnostics() from public;
grant execute on function get_push_infra_diagnostics() to authenticated;

-- ============================================================
-- 4. get_own_push_diagnostics() (0086): se redefine para elegir, por
--    notificacion, la fila MAS INFORMATIVA de push_send_log en vez de
--    cualquiera -- ahora puede haber hasta 3 filas por notification_id
--    (dispatched o not_attempted, escritas por el trigger; ok/error/
--    rate_limited/duplicate, escrita por la Edge Function). Prioridad:
--    resultado real (ok/error/rate_limited/duplicate) > dispatched (se
--    llamo a pg_net, todavia sin resultado conocido) > not_attempted
--    (nunca se pudo llamar).
-- ============================================================

create or replace function get_own_push_diagnostics(p_limit integer default 10)
returns table (
  notification_id uuid,
  notification_title text,
  notification_created_at timestamptz,
  push_attempted boolean,
  push_status text,
  push_sent_count integer,
  push_recipients_count integer,
  push_error_message text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    n.id as notification_id,
    n.title as notification_title,
    n.created_at as notification_created_at,
    (best.status is not null and best.status not in ('not_attempted', 'dispatched')) as push_attempted,
    best.status as push_status,
    best.sent_count as push_sent_count,
    best.recipients_count as push_recipients_count,
    best.error_message as push_error_message
  from notifications n
  left join lateral (
    select psl.status, psl.sent_count, psl.recipients_count, psl.error_message
    from push_send_log psl
    where psl.notification_id = n.id
    order by
      case psl.status
        when 'ok' then 1 when 'error' then 1 when 'rate_limited' then 1 when 'duplicate' then 1
        when 'dispatched' then 2
        else 3
      end,
      psl.created_at desc
    limit 1
  ) best on true
  where n.profile_id = current_profile_id()
  order by n.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

comment on function get_own_push_diagnostics(integer) is 'Diagnostico de push acotado al perfil actual. Revision 0089: por notificacion, elige la fila mas informativa de push_send_log (puede haber varias: dispatched/not_attempted del trigger, mas ok/error/etc. de la Edge Function) -- prioriza el resultado real sobre las filas de trazabilidad del trigger. push_attempted=true solo si hay una fila de resultado real (no solo dispatched/not_attempted). Para la causa exacta de un not_attempted (que config falta) o dispatched sin resultado (pg_net no proceso, o la Edge Function nunca respondio), usar get_push_infra_diagnostics() (solo informatica_r4).';

revoke all on function get_own_push_diagnostics(integer) from public;
grant execute on function get_own_push_diagnostics(integer) to authenticated;
