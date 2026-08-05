-- SIGER4 - Calendario institucional
--
-- Nuevo modulo (ciclo funcional 2026-08): eventos de calendario para toda la
-- Regional — reuniones, guardias, vencimientos, capacitaciones, actividades
-- de Escuela, mantenimientos programados, hitos regionales o de cuartel.
--
-- Alcance: mismo patron de "single scope" que documents/document_folders
-- (0032/0045) para region_id/subsede_id/station_id — un evento tiene
-- EXACTAMENTE uno de los tres, salvo los eventos de Escuela (event_type
-- 'escuela'/'capacitacion'), que no llevan ningun alcance territorial propio
-- porque la Escuela Regional ya es regional-wide por definicion (mismo
-- criterio que courses, ver 0003: courses_write_admin_escuela no filtra por
-- region_id/station_id, solo por is_escuela_role()).
--
-- Notificaciones: reutiliza el mismo mecanismo ya construido en 0023/0025 —
-- un trigger inserta en "notifications" con el mismo alcance del evento
-- (cuando notify_on_create = true), y NotificationPushBridge (frontend) ya
-- escucha CUALQUIER insert en notifications via Realtime y dispara el push
-- correspondiente el solo — no hace falta ni se debe duplicar esa llamada
-- desde el formulario de carga de eventos. El recordatorio previo
-- (notify_before_minutes) usa un job de pg_cron corto (cada 5 minutos) que
-- revisa que eventos entraron en su ventana de aviso y no fueron notificados
-- todavia (send_calendar_event_reminders(), analogo a send_weekly_reminder()
-- de 0036, pero sin requerir pg_net: el recordatorio entra por la misma
-- tabla notifications + NotificationPushBridge, no llama a una Edge Function
-- directamente).

create type calendar_event_type as enum (
  'regional',
  'cuartel',
  'escuela',
  'capacitacion',
  'vencimiento',
  'guardia',
  'reunion',
  'mantenimiento',
  'otro'
);

create type calendar_event_status as enum ('programado', 'cancelado', 'finalizado');

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type calendar_event_type not null default 'otro',
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  region_id uuid references regions(id) on delete cascade,
  subsede_id uuid references subsedes(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  status calendar_event_status not null default 'programado',
  notify_on_create boolean not null default false,
  notify_before_minutes integer,
  reminder_sent_at timestamptz,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_dates_check check (ends_at is null or ends_at >= starts_at),
  constraint calendar_events_reminder_minutes_check check (notify_before_minutes is null or notify_before_minutes > 0),
  -- Eventos de Escuela (escuela/capacitacion) no llevan alcance territorial
  -- propio (regional-wide por definicion, igual que courses). El resto SI
  -- exige exactamente un alcance — nunca ninguno, nunca varios a la vez.
  constraint calendar_events_single_scope check (
    (event_type in ('escuela', 'capacitacion') and region_id is null and subsede_id is null and station_id is null)
    or (event_type not in ('escuela', 'capacitacion') and (region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int = 1)
  )
);

comment on table calendar_events is 'Calendario institucional: reuniones, guardias, vencimientos, capacitaciones, actividades de Escuela, mantenimientos, hitos regionales/de cuartel. notify_on_create dispara una notificacion (y push, via NotificationPushBridge) al alcance del evento en el momento de crearlo. notify_before_minutes, si esta definido, dispara un recordatorio previo via el job de pg_cron siger4-calendar-reminders (ver send_calendar_event_reminders(), requiere pg_cron habilitado — no requiere pg_net, a diferencia del recordatorio semanal de 0036).';
comment on column calendar_events.reminder_sent_at is 'Cuando se disparo el recordatorio previo (notify_before_minutes). Null hasta que send_calendar_event_reminders() lo procesa; evita reenviar el mismo recordatorio en corridas sucesivas del cron.';

create index idx_calendar_events_starts_at on calendar_events(starts_at);
create index idx_calendar_events_region_id on calendar_events(region_id) where region_id is not null;
create index idx_calendar_events_subsede_id on calendar_events(subsede_id) where subsede_id is not null;
create index idx_calendar_events_station_id on calendar_events(station_id) where station_id is not null;
create index idx_calendar_events_reminder_pending on calendar_events(starts_at) where notify_before_minutes is not null and reminder_sent_at is null and status = 'programado';

create trigger trg_calendar_events_updated_at
  before update on calendar_events
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
-- Lectura: cualquier usuario autenticado ve el listado (incluido invitado,
-- solo lectura por construccion — nunca matchea la policy de escritura). No
-- se restringe la lectura por alcance porque ningun otro directorio
-- institucional del sistema lo hace tampoco (documents, courses,
-- inventory_items, station_history_events): el criterio ya establecido en
-- este proyecto es "todo autenticado ve, RLS de escritura es lo que se
-- acota por alcance".
--
-- Escritura:
--   - informatica_r4 / integrante_informatica: cualquier evento.
--   - is_escuela_role() (director_escuela + instructor): eventos de
--     event_type escuela/capacitacion, sin alcance territorial (igual que
--     courses).
--   - secretario_regional: eventos con region_id dentro de su propia
--     region (o subsede_id/station_id que resuelvan a esa region).
--   - roles de cuartel autorizados (usuario_carga_cuartel, presidente_cuartel,
--     secretario_comision, jefe_cuerpo_activo): eventos con station_id igual
--     a su propio cuartel unicamente.

alter table calendar_events enable row level security;

create policy "calendar_events_select_authenticated" on calendar_events
  for select using (auth.role() = 'authenticated');

create policy "calendar_events_write_admin_regional_station_escuela" on calendar_events
  for all using (
    is_informatica_r4()
    or (event_type in ('escuela', 'capacitacion') and is_escuela_role())
    or (is_regional_role() and event_type not in ('escuela', 'capacitacion') and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  )
  with check (
    is_informatica_r4()
    or (event_type in ('escuela', 'capacitacion') and is_escuela_role())
    or (is_regional_role() and event_type not in ('escuela', 'capacitacion') and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

comment on policy "calendar_events_write_admin_regional_station_escuela" on calendar_events is 'informatica_r4 cualquier alcance; is_escuela_role() (director_escuela/instructor) eventos de escuela/capacitacion sin alcance territorial; secretario_regional eventos regionales dentro de su region (director_escuela ya no comparte is_regional_role() desde 0048, asi que no entra por esta rama); roles de cuartel autorizados solo su propio cuartel.';

-- ============================================================
-- Auditoria tecnica (igual que el resto de las tablas del sistema)
-- ============================================================

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
  rec record;
begin
  actor := current_profile_id();
  rec := coalesce(new, old);

  case tg_table_name
    when 'stations' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.id;
    when 'subsedes' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.id;
    when 'profiles' then
      v_region_id := rec.region_id;
      v_station_id := rec.station_id;
      select subsede_id into v_subsede_id from stations where id = rec.station_id;
    when 'vehicles', 'personnel' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'courses' then
      v_region_id := rec.region_id;
    when 'documents' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
      if v_subsede_id is null and v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'user_roles', 'user_scopes' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'notifications' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
    when 'attendance_summaries', 'intervention_summaries' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'push_subscriptions' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'inventory_items' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
    when 'station_history_events' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'calendar_events' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
      if v_subsede_id is null and v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    else
      v_region_id := null;
      v_subsede_id := null;
      v_station_id := null;
  end case;

  if (tg_op = 'INSERT') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'insert', tg_table_name, new.id::text, null, to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'delete', tg_table_name, old.id::text, to_jsonb(old), null, v_region_id, v_subsede_id, v_station_id);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. calendar_events (0051) resuelve su territorio igual que documents: usa su propio region_id/subsede_id/station_id, completando subsede_id desde station_id cuando falta (eventos de escuela/capacitacion quedan sin territorio, igual que courses).';

create trigger trg_audit_calendar_events
  after insert or update or delete on calendar_events
  for each row execute function audit_row_change();

-- ============================================================
-- Notificacion automatica al crear (si notify_on_create = true)
-- ============================================================
-- Mismo patron que notify_course_created()/notify_document_created() (0023):
-- inserta en notifications con el mismo alcance del evento. El push real lo
-- dispara NotificationPushBridge (frontend) al ver el insert por Realtime —
-- este trigger NUNCA llama a una Edge Function directamente, para no
-- duplicar el envio.

create or replace function notify_calendar_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notify_on_create then
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
  return new;
end;
$$;

comment on function notify_calendar_event_created() is 'Si notify_on_create=true, crea una notificacion con el mismo alcance del evento al crearlo. Eventos de Escuela (region_id/subsede_id/station_id null) generan una notificacion sin alcance territorial, visible solo para informatica_r4 (mismo comportamiento que ya tiene notifications para filas sin alcance) — aceptado como limitacion conocida, ver DEPLOYMENT.md.';

create trigger trg_notify_calendar_event_created
  after insert on calendar_events
  for each row execute function notify_calendar_event_created();

-- ============================================================
-- Recordatorio previo (notify_before_minutes) via pg_cron
-- ============================================================
-- Requiere pg_cron habilitado (Supabase Dashboard -> Database -> Extensions),
-- igual que el recordatorio semanal de 0036 — pero NO requiere pg_net: el
-- recordatorio entra por notifications + NotificationPushBridge (Realtime),
-- no llama a una Edge Function directamente desde SQL.

create or replace function send_calendar_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  for v_event in
    select id, title, starts_at, region_id, subsede_id, station_id
    from calendar_events
    where status = 'programado'
      and notify_before_minutes is not null
      and reminder_sent_at is null
      and starts_at > now()
      and starts_at <= now() + (notify_before_minutes || ' minutes')::interval
  loop
    insert into notifications (region_id, subsede_id, station_id, type, title, body)
    values (
      v_event.region_id,
      v_event.subsede_id,
      v_event.station_id,
      'actividad_proxima',
      'Recordatorio: ' || v_event.title,
      'El evento "' || v_event.title || '" es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
    );

    update calendar_events set reminder_sent_at = now() where id = v_event.id;
  end loop;
end;
$$;

comment on function send_calendar_event_reminders() is 'Recorre calendar_events programados con notify_before_minutes definido, reminder_sent_at null, y cuyo inicio ya entro en la ventana de aviso: inserta la notificacion de recordatorio (mismo alcance del evento) y marca reminder_sent_at para no repetirla. Llamado por el job de pg_cron "siger4-calendar-reminders" cada 5 minutos. No dispara push directamente (pg_net no hace falta aca): NotificationPushBridge en el frontend ya escucha cualquier insert en notifications y dispara el push el solo, igual que con cualquier otra notificacion automatica del sistema.';

revoke all on function send_calendar_event_reminders() from public;

-- El job de pg_cron corre como el rol que ejecuta esta migracion (postgres),
-- que ya tiene permiso para llamar a esta funcion SECURITY DEFINER sin GRANT
-- adicional. Cada 5 minutos es suficiente margen para que notify_before_minutes
-- (definido en minutos por el usuario) no se dispare con mas de ~5 minutos de
-- atraso respecto al valor exacto configurado.
select cron.schedule(
  'siger4-calendar-reminders',
  '*/5 * * * *',
  $$select send_calendar_event_reminders()$$
);
