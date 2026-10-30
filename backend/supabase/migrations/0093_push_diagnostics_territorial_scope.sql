-- SIGER4 - "Probar push server-side" funcionaba pero el diagnostico nunca
-- mostraba nada para notificaciones reales de modulos (calendario,
-- prestamos, cambios de estado) -- causa: el diagnostico solo miraba
-- notificaciones con profile_id puntual
--
-- Investigacion completa del reporte "las notificaciones reales no llegan
-- como push": se revisaron, uno por uno, todos los caminos que insertan en
-- notifications (notify_calendar_event_created/send_calendar_event_reminders,
-- notify_loan_request_created/notify_loan_request_status_change,
-- notify_document_created, notify_station_status_change/
-- notify_vehicle_status_change/notify_personnel_status_change), el trigger
-- dispatch_notification_push() (corre AFTER INSERT sin ningun filtro por
-- type/origen -- confirmado que dispara para CUALQUIER insert), y la
-- resolucion de destinatarios en send-push-system (profile_id > station_id >
-- subsede_id > region_id, con los joins profiles/stations/subsedes
-- correctos). No se encontro ningun bug que impida el ENVIO real del push
-- para notificaciones con scope territorial.
--
-- El bug real esta en la VISIBILIDAD del diagnostico, no en el envio:
-- get_own_push_diagnostics() (0086/0089) filtraba
-- "where n.profile_id = current_profile_id()" -- es decir, SOLO mostraba
-- notificaciones con profile_id puntual (exactamente el camino que usa el
-- boton "Probar push server-side", que siempre crea la notificacion de
-- prueba con profile_id = uno mismo). Cualquier notificacion real de
-- modulos que usa scope territorial (region_id/subsede_id/station_id,
-- profile_id NULL -- que es el caso de casi TODAS las notificaciones reales
-- de calendario/prestamos/cambios de estado, ver notify_calendar_event_created,
-- notify_station_status_change, etc.) nunca aparecia en el panel de
-- diagnostico de Ajustes, sin importar si el push se habia enviado
-- correctamente o no. El usuario interpreto correctamente el sintoma ("no
-- veo confirmacion de que llego") pero la causa no era que el push fallara
-- -- era que el diagnostico nunca buscaba esas filas.
--
-- Fix: get_own_push_diagnostics() ahora incluye tambien las notificaciones
-- de scope territorial que el usuario actual puede ver (mismo criterio que
-- la propia RLS de SELECT en notifications, notifications_select_own_or_scope
-- de 0015 -- reusado acá, no reinventado), no solo las de profile_id
-- puntual. Se agrega ademas recipients_count/sent_count reales (antes solo
-- se calculaban para push_attempted, quedaban en null para dispatched/
-- not_attempted) para que el panel pueda mostrar "a cuantos se intento
-- mandar" incluso en filas sin resultado final todavia.

-- ============================================================
-- 1. get_own_push_diagnostics(): incluye notificaciones de scope
--    territorial visibles para el usuario actual, no solo profile_id
--    puntual.
-- ============================================================

create or replace function get_own_push_diagnostics(p_limit integer default 10)
returns table (
  notification_id uuid,
  notification_title text,
  notification_created_at timestamptz,
  notification_scope text,
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
    case
      when n.profile_id is not null then 'personal'
      when n.station_id is not null then 'cuartel'
      when n.subsede_id is not null then 'subsede'
      when n.region_id is not null then 'region'
      else 'sin_alcance'
    end as notification_scope,
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
  where
    -- Mismo criterio que notifications_select_own_or_scope (0015): propias,
    -- o de scope territorial que el usuario puede ver. is_informatica_r4()
    -- ve todo, igual que en esa policy.
    is_informatica_r4()
    or n.profile_id = current_profile_id()
    or (n.profile_id is null and n.region_id in (select my_region_ids()))
    or (n.profile_id is null and n.station_id in (select my_station_ids()))
    or (n.profile_id is null and n.station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
    or (n.profile_id is null and n.subsede_id in (select my_subsede_ids()))
  order by n.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

comment on function get_own_push_diagnostics(integer) is 'Diagnostico de push para el usuario actual. Revision 0093: antes SOLO mostraba notificaciones con profile_id puntual (el mismo scope que usa "Probar push server-side") -- cualquier notificacion real de modulos con scope territorial (region/subsede/cuartel, que es el caso de casi todas las notificaciones reales de calendario/prestamos/cambios de estado) nunca aparecia, asi que el panel no podia confirmar si el push habia llegado o no para ellas. Ahora incluye tambien notificaciones territoriales visibles para el usuario (mismo criterio que la RLS notifications_select_own_or_scope, 0015) -- notification_scope indica de donde viene el alcance (personal/cuartel/subsede/region/sin_alcance). Revision 0089 (sin cambios): por notificacion, elige la fila mas informativa de push_send_log, prioriza resultado real sobre trazabilidad del trigger.';

revoke all on function get_own_push_diagnostics(integer) from public;
grant execute on function get_own_push_diagnostics(integer) to authenticated;

-- ============================================================
-- 2. get_push_infra_diagnostics(): separa el ULTIMO intento real del
--    historial de errores de los ultimos 7 dias -- antes, un 401 viejo ya
--    corregido (ej. de antes del fix de --no-verify-jwt) seguia
--    apareciendo como si fuera el estado actual hasta que hubiera una
--    notificacion nueva. Ahora se distingue explicitamente "el intento MAS
--    RECIENTE" de "hubo errores en la ventana de 7 dias, pero no
--    necesariamente ahora".
-- ============================================================

drop function if exists get_push_infra_diagnostics();

create or replace function get_push_infra_diagnostics()
returns table (
  project_url_configured boolean,
  cron_shared_secret_configured boolean,
  pg_net_installed boolean,
  recent_requests_count integer,
  recent_responses_count integer,
  recent_error_count integer,
  last_response_status_code integer,
  last_response_error text,
  last_response_body text,
  last_response_at timestamptz,
  last_response_is_historical boolean
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
  v_recent_errors integer := 0;
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

      -- Errores en TODA la ventana de 7 dias (para saber si hubo problemas
      -- recientes, aunque ya se hayan resuelto) vs. la respuesta MAS
      -- RECIENTE en particular (para saber el estado ACTUAL). Antes solo se
      -- reportaba "la ultima respuesta", que un 401 viejo (ya corregido) podia
      -- seguir mostrando como si fuera el problema vigente hasta la proxima
      -- notificacion real.
      select count(*) into v_recent_errors
      from push_send_log psl
      join net._http_response r on r.id = psl.pg_net_request_id
      where psl.created_at >= now() - interval '7 days'
        and (r.status_code is null or r.status_code >= 400);

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
    v_recent_errors,
    v_last_status,
    v_last_error,
    v_last_content,
    v_last_at,
    -- "Historico" si la ultima respuesta tiene mas de 15 minutos: distingue
    -- "esto paso hace rato, puede ya estar resuelto" de "esto acaba de pasar,
    -- es el estado actual". 15 minutos es generoso frente a la latencia real
    -- de pg_net (segundos) para no marcar como "actual" algo que en la
    -- practica ya quedo viejo apenas el usuario abre el panel un rato despues.
    (v_last_at is not null and v_last_at < now() - interval '15 minutes');
end;
$$;

comment on function get_push_infra_diagnostics() is 'Diagnostico consolidado de infraestructura de push -- SOLO informatica_r4 (is_super_admin()). Revision 0093: agrega recent_error_count (cuantas de las respuestas de los ultimos 7 dias fueron error, sin importar si son la mas reciente) y last_response_is_historical (true si la ultima respuesta tiene mas de 15 minutos -- evita que un 401 viejo ya corregido se lea como "esto esta pasando ahora"). Revision 0092 (sin cambios): last_response_body trae el body real truncado a 300 caracteres para distinguir un 401 del gateway de Supabase (verify_jwt) de un 401 de nuestro codigo (x-cron-secret). Ver test_push_dispatcher_auth() para una prueba activa equivalente.';

revoke all on function get_push_infra_diagnostics() from public;
grant execute on function get_push_infra_diagnostics() to authenticated;
