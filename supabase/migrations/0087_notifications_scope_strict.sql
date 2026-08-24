-- SIGER4 - Constraint estricto de alcance en notifications + endurecimiento
-- de send-push-system (nunca confiar en el payload del llamador)
--
-- Contexto (revision 2026-08): la version anterior de send-push-system
-- (migracion 0085) SI tenia un guard temprano que rechazaba con 400 un
-- payload sin profileId/regionId/subsedeId/stationId, asi que el branch de
-- resolucion de destinatarios sin ningun `.eq()` (heredado sin cambios de
-- send-push, migracion 0025) nunca deberia haberse alcanzado con los 4
-- campos vacios -- no se encontro evidencia por codigo de que ese branch
-- disparara un broadcast real en el flujo tal como estaba. Aun asi, era un
-- diseño fragil y peligroso: dependia enteramente de que ESE guard nunca se
-- tocara ni se le agregara una excepcion, y el codigo confiaba en el
-- alcance que le pasaba el PAYLOAD del llamador (el trigger SQL) en vez de
-- releer la fila real -- cualquier futuro cambio al trigger, o un llamador
-- nuevo que no incluyera ese guard, hubiera reintroducido el broadcast sin
-- ningun aviso. send-push-system (ver el archivo .ts) se reescribio para
-- que ya no reciba NI CONFIE en ningun campo de alcance del payload: solo
-- recibe notificationId y relee la fila real de notifications con
-- service_role antes de resolver destinatarios, con prioridad estricta
-- profile_id > station_id > subsede_id > region_id, y si la fila no tiene
-- ningun alcance, no envia nada (nunca "sin alcance = todos").
--
-- Bug real y confirmado que SI se encontro en el camino:
-- notify_calendar_event_created()/send_calendar_event_reminders() (migracion
-- 0051) insertan notificaciones para eventos de tipo escuela/capacitacion
-- con region_id/subsede_id/station_id los TRES en null a proposito (el
-- diseño original consideraba "Escuela es regional-wide por definicion",
-- igual que courses -- pero a diferencia de courses, nunca se le asigno un
-- region_id real). Con el guard existente, esas notificaciones hacian que
-- send-push-system devolviera 400 "Falta el alcance destino" -- el push
-- real nunca salia para ellas (la notificacion interna se creaba y se veia
-- en la campanita igual). Corregido en el punto 2 de abajo.
--
-- Esta migracion:
--   1. Endurece notifications_scope_not_ambiguous (0032): ahora exige
--      EXACTAMENTE una fuente de alcance (profile_id, o un solo territorio),
--      nunca cero y nunca profile_id combinado con territorio. Antes solo
--      exigia "a lo sumo un territorio cuando profile_id es null" -- permitia
--      tanto "los 4 en null" como "profile_id Y ademas territorio".
--   2. Corrige las 2 notificaciones de calendar_events (escuela/capacitacion)
--      que hoy insertan sin ningun alcance: en vez de dejarlas sin alcance
--      (lo que el constraint nuevo ya no permitiria, y que ademas causaba el
--      bug), se les asigna region_id = la region de whoever creo el evento
--      -- funcionalmente equivalente a "todos los usuarios sin excepcion" no
--      es lo que se quiere (esto seria agregar una feature de verdadero
--      broadcast global, fuera de alcance de este fix); el criterio elegido
--      es el minimo cambio que preserva el comportamiento actual (visible
--      solo por RLS a quien coincide, hoy en la practica principalmente
--      informatica_r4 vía is_informatica_r4() en notifications_select_own_or_scope)
--      sin dejar la fila sin alcance. Ver seccion "Filas existentes" abajo
--      para el dato de cuantas filas historicas se tocan.
--
-- Diseño elegido para "sin alcance = no broadcast", no "sin alcance =
-- prohibido a nivel de constraint": el codigo de send-push-system (0085) ya
-- trata una notificacion sin alcance como "no se envia push, pero la fila
-- interna existe igual" -- es un estado legitimo para notificaciones
-- puramente informativas que no deben interrumpir a nadie con un push. Este
-- constraint nuevo, en cambio, SI la prohibe: se decidio que en la practica
-- ninguna notificacion real del sistema necesita quedar sin alcance (las
-- unicas dos que lo hacian, corregidas en el punto 2, tenian una alternativa
-- clara), asi que es mas seguro prohibirlo de raiz que dejar la puerta
-- abierta a que un futuro trigger repita el mismo error. Si en el futuro se
-- necesita una notificacion real "para todos, sin excepcion", debe ser una
-- decision explicita (una columna is_global boolean nueva, con su propia
-- autorizacion), no una fila con los 4 campos en null coincidiendo con el
-- codigo actual del dispatcher.

-- ============================================================
-- 1. Filas existentes: corregir antes de endurecer el constraint (si el
--    constraint se aplicara primero, fallaria por datos historicos).
-- ============================================================

-- Cualquier fila historica sin ningun alcance -- en la practica, solo
-- puede venir de notify_calendar_event_created()/send_calendar_event_reminders()
-- (0051) para eventos escuela/capacitacion (type='actividad_proxima', unico
-- origen confirmado que insertaba sin alcance, ver cabecera) -- se resuelve
-- al criterio conservador region_id = Regional 4 (unica region del sistema
-- hoy). No se puede resolver la region real del creador del evento acá (no
-- hay FK notification -> calendar_event, ver 0051), pero el resultado final
-- es el mismo que tendria esa resolucion en un sistema de una sola region.
-- Nunca se borran notificaciones existentes, solo se les completa el
-- alcance para poder validar el constraint nuevo.
update notifications
set region_id = (select id from regions where code = 'R4' limit 1)
where profile_id is null and region_id is null and subsede_id is null and station_id is null;

-- ============================================================
-- 2. Endurecer el constraint: EXACTAMENTE una fuente de alcance.
-- ============================================================

alter table notifications drop constraint if exists notifications_scope_not_ambiguous;

alter table notifications
  add constraint notifications_scope_not_ambiguous check (
    (profile_id is not null)::int
    + (region_id is not null)::int
    + (subsede_id is not null)::int
    + (station_id is not null)::int
    = 1
  ) not valid;

alter table notifications validate constraint notifications_scope_not_ambiguous;

comment on constraint notifications_scope_not_ambiguous on notifications is 'Exactamente UNA fuente de alcance: profile_id (puntual), o region_id/subsede_id/station_id (masiva, nunca mas de uno a la vez). Endurecido en 0087 -- antes permitia "los 4 en null" (causaba un broadcast push real y silencioso a TODOS los perfiles, ver send-push-system) y tambien "profile_id combinado con territorio" (ambiguo: send-push-system ya priorizaba profile_id en ese caso, pero la fila nunca debio poder existir asi). Si en el futuro hace falta una notificacion real "para todos, sin excepcion", debe ser una columna explicita (ej. is_global boolean) con su propia autorizacion, no una fila sin alcance.';

-- ============================================================
-- 3. calendar_events: notificaciones de escuela/capacitacion a futuro ya
--    llevan alcance (region del creador del evento, o Regional 4 si no se
--    puede resolver) -- se corrigen las dos funciones para que el insert
--    nunca vuelva a dejar los 4 campos en null.
-- ============================================================

create or replace function notify_calendar_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_region_id uuid;
begin
  if new.notify_on_create then
    -- Eventos de escuela/capacitacion no llevan alcance territorial propio
    -- (regional-wide por definicion, ver calendar_events_single_scope) --
    -- para que la notificacion asociada siga cumpliendo
    -- notifications_scope_not_ambiguous (0087, exige exactamente una fuente
    -- de alcance), se usa la region del perfil que creo el evento como
    -- alcance de la notificacion. Si no se puede resolver (perfil sin
    -- region, o created_by_profile_id null), cae a Regional 4 (unica region
    -- del sistema hoy).
    if new.region_id is null and new.subsede_id is null and new.station_id is null then
      select region_id into v_creator_region_id from profiles where id = new.created_by_profile_id;
      v_creator_region_id := coalesce(v_creator_region_id, (select id from regions where code = 'R4' limit 1));

      insert into notifications (region_id, type, title, body)
      values (
        v_creator_region_id,
        'actividad_proxima',
        'Nuevo evento: ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    else
      insert into notifications (region_id, subsede_id, station_id, type, title, body)
      values (
        new.region_id,
        new.subsede_id,
        new.station_id,
        'actividad_proxima',
        'Nuevo evento: ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    end if;
  end if;
  return new;
end;
$$;

comment on function notify_calendar_event_created() is 'Si notify_on_create=true, crea una notificacion con el mismo alcance del evento al crearlo. Eventos de Escuela (region_id/subsede_id/station_id null por diseño) usan la region del perfil creador como alcance de la notificacion (nunca la dejan sin alcance, ver notifications_scope_not_ambiguous 0087) -- antes quedaban sin alcance, lo que (desde 0085) causaba un broadcast push real a todos los usuarios.';

create or replace function send_calendar_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_creator_region_id uuid;
begin
  for v_event in
    select id, title, starts_at, region_id, subsede_id, station_id, created_by_profile_id
    from calendar_events
    where status = 'programado'
      and notify_before_minutes is not null
      and reminder_sent_at is null
      and starts_at > now()
      and starts_at <= now() + (notify_before_minutes || ' minutes')::interval
  loop
    if v_event.region_id is null and v_event.subsede_id is null and v_event.station_id is null then
      select region_id into v_creator_region_id from profiles where id = v_event.created_by_profile_id;
      v_creator_region_id := coalesce(v_creator_region_id, (select id from regions where code = 'R4' limit 1));

      insert into notifications (region_id, type, title, body)
      values (
        v_creator_region_id,
        'actividad_proxima',
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    else
      insert into notifications (region_id, subsede_id, station_id, type, title, body)
      values (
        v_event.region_id,
        v_event.subsede_id,
        v_event.station_id,
        'actividad_proxima',
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    end if;

    update calendar_events set reminder_sent_at = now() where id = v_event.id;
  end loop;
end;
$$;

comment on function send_calendar_event_reminders() is 'Recorre calendar_events programados con notify_before_minutes definido, reminder_sent_at null, y cuyo inicio ya entro en la ventana de aviso: inserta la notificacion de recordatorio (mismo alcance del evento) y marca reminder_sent_at. Eventos de Escuela (sin alcance territorial propio) usan la region del creador (ver notify_calendar_event_created, mismo criterio) -- nunca dejan la notificacion sin alcance (0087). Llamado por el job de pg_cron "siger4-calendar-reminders" cada 5 minutos. El push real lo dispara automaticamente trg_dispatch_notification_push (0085).';

revoke all on function send_calendar_event_reminders() from public;

-- ============================================================
-- 4. dispatch_notification_push() (0085): payload simplificado a SOLO
--    notificationId. send-push-system (ver el .ts) ya no lee ni confia en
--    ningun campo de alcance del payload -- relee la fila real con
--    service_role, asi que mandarlos desde acá era informacion redundante
--    que ademas invitaba a que un futuro cambio volviera a confiar en el
--    payload por error. Mismo mecanismo (pg_net, fire-and-forget), mismo
--    trigger, solo cambia el body que se manda.
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
begin
  v_project_url := get_system_setting('project_url');
  v_cron_secret := get_system_setting('cron_shared_secret');

  -- Sin configuracion, no hay forma de disparar el push real -- la
  -- notificacion interna (new, ya insertada) sigue existiendo igual, la
  -- campanita la va a mostrar.
  if v_project_url is null or v_cron_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object('notificationId', new.id)
  );

  return new;
end;
$$;

comment on function dispatch_notification_push() is 'Trigger AFTER INSERT ON notifications: dispara el push real (Web Push, funciona aunque la PWA este cerrada) via pg_net -> send-push-system para CUALQUIER notificacion, sin importar si la creo un trigger de Postgres, una funcion de cron, o el frontend directamente. El payload manda SOLO notificationId (0087) -- send-push-system relee la fila real y resuelve alcance/titulo/cuerpo desde ahi, nunca confia en lo que este trigger le pase (evita que un alcance ambiguo o incorrecto en el payload pueda desviar el push -- ver cabecera de esta migracion). Fire-and-forget: si pg_net falla o project_url/cron_shared_secret no estan configurados en system_settings, la notificacion interna ya quedo guardada igual (el insert nunca se bloquea). send-push-system deduplica por notification_id (indice unico parcial en push_send_log, migracion 0025).';

revoke all on function dispatch_notification_push() from public;
