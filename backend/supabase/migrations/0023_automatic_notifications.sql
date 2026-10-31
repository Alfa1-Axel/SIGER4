-- SIGER4 - Notificaciones automaticas desde eventos del sistema
--
-- Hasta ahora las notificaciones solo se creaban manualmente desde
-- /notificaciones/nueva. Se agregan triggers (security definer, mismo patron
-- que audit_row_change()) que generan notificaciones automaticas cuando pasan
-- eventos institucionales relevantes, respetando el mismo alcance
-- (region/subsede/cuartel/usuario) que ya define el evento.
--
-- Estos triggers escriben en notifications, que ya tiene su propio trigger de
-- auditoria (trg_audit_notifications, desde 0004) — cada notificacion
-- automatica queda registrada en audit_logs sin trabajo adicional.
--
-- Sin duplicados: cada trigger dispara una sola vez por evento (insert o
-- cambio de estado real, nunca en cada update generico), y no se notifica dos
-- veces el mismo evento. No se expone informacion sensible: los titulos y
-- cuerpos de notificacion son genericos (nombre de la entidad, no contenido
-- interno).

-- ---------------- self-notify: reportes generados ----------------
-- La generacion de reportes es 100% client-side (no hay tabla "reports"), asi
-- que la notificacion de "reporte generado" no puede salir de un trigger — el
-- frontend la inserta directamente. La politica de insert existente
-- (notifications_write_admin_regional_escuela) solo permite informatica_r4/
-- roles regionales/escuela, lo que dejaba sin notificacion a cualquier otro
-- rol que genera sus propios reportes (presidente_cuartel, usuario_carga_cuartel,
-- etc.). Se agrega una politica adicional: cualquier usuario autenticado
-- puede insertarse una notificacion a si mismo (profile_id = su propio
-- perfil), sin importar el rol — no es un broadcast, es su propia bandeja.
create policy "notifications_write_self" on notifications
  for insert with check (profile_id = current_profile_id());

-- ---------------- cursos nuevos ----------------

create or replace function notify_course_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (region_id, type, title, body)
  values (new.region_id, 'curso_nuevo', 'Nuevo curso: ' || new.title, 'Se publicó un nuevo curso de la Escuela Regional: ' || new.category || '.');
  return new;
end;
$$;

comment on function notify_course_created() is 'Crea una notificacion regional cuando se publica un curso nuevo.';

create trigger trg_notify_course_created
  after insert on courses
  for each row execute function notify_course_created();

-- ---------------- documentos nuevos ----------------

create or replace function notify_document_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, region_id, subsede_id, station_id, type, title, body)
  values (
    new.profile_id,
    case when new.profile_id is null then new.region_id else null end,
    case when new.profile_id is null then new.subsede_id else null end,
    case when new.profile_id is null then new.station_id else null end,
    'documento_actualizado',
    'Nuevo documento: ' || new.title,
    'Se cargó un nuevo documento (' || new.category || ') en tu alcance.'
  );
  return new;
end;
$$;

comment on function notify_document_created() is 'Crea una notificacion con el mismo alcance del documento (region/subsede/cuartel/usuario especifico) cuando se carga un documento nuevo.';

create trigger trg_notify_document_created
  after insert on documents
  for each row execute function notify_document_created();

-- ---------------- cambio de estado: cuarteles ----------------

create or replace function notify_station_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into notifications (region_id, subsede_id, station_id, type, title, body)
    values (new.region_id, new.subsede_id, new.id, 'cambio_estado', 'Cambio de estado: ' || new.name, 'El cuartel ' || new.name || ' pasó a estado "' || new.status || '".');
  end if;
  return new;
end;
$$;

comment on function notify_station_status_change() is 'Crea una notificacion cuando cambia el estado operativo de un cuartel (no en cualquier otra edicion).';

create trigger trg_notify_station_status_change
  after update on stations
  for each row execute function notify_station_status_change();

-- ---------------- cambio de estado: vehiculos ----------------

create or replace function notify_vehicle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region_id uuid;
  v_subsede_id uuid;
begin
  if old.status is distinct from new.status then
    select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = new.station_id;
    insert into notifications (region_id, subsede_id, station_id, type, title, body)
    values (v_region_id, v_subsede_id, new.station_id, 'cambio_estado', 'Cambio de estado: vehículo ' || new.internal_code, 'El vehículo ' || new.internal_code || ' pasó a estado "' || new.status || '".');
  end if;
  return new;
end;
$$;

comment on function notify_vehicle_status_change() is 'Crea una notificacion cuando cambia el estado de un vehiculo (no en cualquier otra edicion).';

create trigger trg_notify_vehicle_status_change
  after update on vehicles
  for each row execute function notify_vehicle_status_change();

-- ---------------- cambio de estado: personal ----------------

create or replace function notify_personnel_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region_id uuid;
  v_subsede_id uuid;
begin
  if old.status is distinct from new.status then
    select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = new.station_id;
    insert into notifications (region_id, subsede_id, station_id, type, title, body)
    values (v_region_id, v_subsede_id, new.station_id, 'cambio_estado', 'Cambio de estado: ' || new.first_name || ' ' || new.last_name, 'Un integrante de la dotación pasó a estado "' || new.status || '".');
  end if;
  return new;
end;
$$;

comment on function notify_personnel_status_change() is 'Crea una notificacion cuando cambia el estado de un integrante del personal (no en cualquier otra edicion). No incluye DNI ni datos sensibles.';

create trigger trg_notify_personnel_status_change
  after update on personnel
  for each row execute function notify_personnel_status_change();

-- ---------------- asistencia cargada ----------------

create or replace function notify_attendance_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_name text;
begin
  select region_id, subsede_id, name into v_region_id, v_subsede_id, v_station_name from stations where id = new.station_id;
  insert into notifications (region_id, subsede_id, station_id, type, title, body)
  values (v_region_id, v_subsede_id, new.station_id, 'estadisticas_nuevas', 'Asistencia cargada: ' || v_station_name, 'Se cargó un resumen de asistencia del período ' || new.period_start || ' a ' || new.period_end || '.');
  return new;
end;
$$;

comment on function notify_attendance_created() is 'Crea una notificacion cuando se carga un nuevo resumen de asistencia.';

create trigger trg_notify_attendance_created
  after insert on attendance_summaries
  for each row execute function notify_attendance_created();

-- ---------------- intervencion cargada ----------------

create or replace function notify_intervention_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_name text;
begin
  select region_id, subsede_id, name into v_region_id, v_subsede_id, v_station_name from stations where id = new.station_id;
  insert into notifications (region_id, subsede_id, station_id, type, title, body)
  values (v_region_id, v_subsede_id, new.station_id, 'estadisticas_nuevas', 'Intervención cargada: ' || v_station_name, 'Se cargó un resumen de intervenciones (' || new.category || ') del período ' || new.period_start || ' a ' || new.period_end || '.');
  return new;
end;
$$;

comment on function notify_intervention_created() is 'Crea una notificacion cuando se carga un nuevo resumen de intervenciones.';

create trigger trg_notify_intervention_created
  after insert on intervention_summaries
  for each row execute function notify_intervention_created();
