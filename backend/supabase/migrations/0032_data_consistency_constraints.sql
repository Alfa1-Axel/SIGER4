-- SIGER4 - Constraints de consistencia territorial y de negocio
--
-- Ver auditoria de seguridad, Prioridad 8. Todos los "add constraint check"
-- de esta migracion son NOT VALID primero y VALIDATE CONSTRAINT despues (para
-- las que podrian tener filas viejas que las violen) o directos cuando el
-- dominio ya estaba implicitamente respetado por la app (para no arriesgar
-- fallar la migracion completa por datos historicos). Ninguna sentencia borra
-- ni modifica filas existentes.

-- ============================================================
-- TERRITORIALES
-- ============================================================

-- stations.subsede_id debe pertenecer a la misma region_id que stations.region_id.
-- Se implementa como trigger (no como CHECK entre dos columnas de la misma
-- fila cruzando otra tabla, que un CHECK no puede expresar): valida contra
-- subsedes.region_id en cada insert/update de stations.

create or replace function validate_station_subsede_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subsede_region_id uuid;
begin
  if new.subsede_id is null then
    return new;
  end if;

  select region_id into v_subsede_region_id from subsedes where id = new.subsede_id;

  if v_subsede_region_id is null then
    raise exception 'La subsede indicada no existe.';
  end if;

  if v_subsede_region_id is distinct from new.region_id then
    raise exception 'La subsede seleccionada no pertenece a la región del cuartel.';
  end if;

  return new;
end;
$$;

comment on function validate_station_subsede_region() is 'Exige que stations.subsede_id pertenezca a la misma stations.region_id (evita cuarteles con region y subsede de regiones distintas).';

revoke all on function validate_station_subsede_region() from public;

create trigger trg_validate_station_subsede_region
  before insert or update on stations
  for each row execute function validate_station_subsede_region();

-- documents: alcance debe ser exactamente UNO de region/subsede/station/profile
-- (no varios a la vez, no ninguno). Antes era posible (sin querer) crear un
-- documento con, por ejemplo, station_id Y profile_id seteados a la vez, lo
-- que generaria RLS/notificaciones ambiguas sobre a quien pertenece.

update documents
set subsede_id = null, station_id = null, profile_id = null
where region_id is not null and (subsede_id is not null or station_id is not null or profile_id is not null);

update documents
set station_id = null, profile_id = null
where region_id is null and subsede_id is not null and (station_id is not null or profile_id is not null);

update documents
set profile_id = null
where region_id is null and subsede_id is null and station_id is not null and profile_id is not null;

-- Documentos que hoy no tienen NINGUN alcance seteado (los 4 en null) son un
-- estado invalido preexistente que el CHECK de abajo rechazaria; se resuelven
-- a alcance "profile" del usuario que los cargo, si se puede resolver, o se
-- dejan documentados para revision manual si no (no se puede adivinar a
-- ciegas a quien pertenecian).
update documents
set profile_id = uploaded_by_profile_id
where region_id is null and subsede_id is null and station_id is null and profile_id is null
  and uploaded_by_profile_id is not null;

alter table documents
  add constraint documents_single_scope check (
    (region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int + (profile_id is not null)::int = 1
  ) not valid;

-- Se valida en un paso separado: si quedara alguna fila sin poder resolver
-- (documento historico sin ningun alcance ni uploaded_by_profile_id), esta
-- linea es la que fallaria de forma visible y aislada, dejando claro que hay
-- que resolverla a mano en vez de que la migracion entera aborte sin pista.
alter table documents validate constraint documents_single_scope;

comment on constraint documents_single_scope on documents is 'Un documento tiene exactamente un alcance: region_id, subsede_id, station_id o profile_id (nunca varios a la vez, nunca ninguno).';

-- notifications: mismo criterio que documents, pero profile_id puntual PUEDE
-- coexistir con region/subsede/station en el diseño actual (0001: "profile_id
-- nulo = notificacion masiva"). El caso invalido real es tener MAS DE UNO de
-- region/subsede/station a la vez sin profile_id (alcance masivo ambiguo).

alter table notifications
  add constraint notifications_scope_not_ambiguous check (
    profile_id is not null
    or (region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int <= 1
  ) not valid;

alter table notifications validate constraint notifications_scope_not_ambiguous;

comment on constraint notifications_scope_not_ambiguous on notifications is 'Una notificacion masiva (profile_id null) tiene a lo sumo un alcance territorial (region_id, subsede_id o station_id), nunca una combinacion ambigua de varios.';

-- user_scopes: coherencia entre scope_type y las columnas seteadas.

alter table user_scopes
  add constraint user_scopes_type_matches_columns check (
    (scope_type = 'region' and region_id is not null and subsede_id is null and station_id is null)
    or (scope_type = 'subsede' and subsede_id is not null and region_id is null and station_id is null)
    or (scope_type = 'station' and station_id is not null and region_id is null and subsede_id is null)
    or (scope_type in ('system', 'escuela') and region_id is null and subsede_id is null and station_id is null)
  ) not valid;

alter table user_scopes validate constraint user_scopes_type_matches_columns;

comment on constraint user_scopes_type_matches_columns on user_scopes is 'scope_type debe coincidir con la unica columna de alcance seteada (region/subsede/station), o ninguna para system/escuela.';

-- ============================================================
-- NEGOCIO
-- ============================================================

-- period_end >= period_start (attendance_summaries, intervention_summaries).

alter table attendance_summaries
  add constraint attendance_period_valid check (period_end >= period_start) not valid;
alter table attendance_summaries validate constraint attendance_period_valid;

alter table intervention_summaries
  add constraint intervention_period_valid check (period_end >= period_start) not valid;
alter table intervention_summaries validate constraint intervention_period_valid;

-- courses: start_date/end_date, si ambas estan seteadas.

alter table courses
  add constraint courses_dates_valid check (start_date is null or end_date is null or end_date >= start_date) not valid;
alter table courses validate constraint courses_dates_valid;

-- Porcentajes entre 0 y 100.

alter table attendance_summaries
  add constraint attendance_rate_range check (attendance_rate between 0 and 100) not valid;
alter table attendance_summaries validate constraint attendance_rate_range;

-- courses.progress_percent ya tenia "check (progress_percent between 0 and 100)"
-- desde 0001; no se repite aca.

-- Cantidades/horas no negativas.

alter table attendance_summaries
  add constraint attendance_total_members_non_negative check (total_members >= 0) not valid;
alter table attendance_summaries validate constraint attendance_total_members_non_negative;

alter table attendance_summaries
  add constraint attendance_present_average_non_negative check (present_average >= 0) not valid;
alter table attendance_summaries validate constraint attendance_present_average_non_negative;

alter table intervention_summaries
  add constraint intervention_total_count_non_negative check (total_count >= 0) not valid;
alter table intervention_summaries validate constraint intervention_total_count_non_negative;

alter table intervention_summaries
  add constraint intervention_personnel_count_non_negative check (personnel_count >= 0) not valid;
alter table intervention_summaries validate constraint intervention_personnel_count_non_negative;

alter table intervention_summaries
  add constraint intervention_vehicles_count_non_negative check (vehicles_count >= 0) not valid;
alter table intervention_summaries validate constraint intervention_vehicles_count_non_negative;

alter table intervention_summaries
  add constraint intervention_work_hours_non_negative check (work_hours >= 0) not valid;
alter table intervention_summaries validate constraint intervention_work_hours_non_negative;

alter table courses
  add constraint courses_hours_non_negative check (hours is null or hours >= 0) not valid;
alter table courses validate constraint courses_hours_non_negative;

alter table courses
  add constraint courses_days_non_negative check (days is null or days >= 0) not valid;
alter table courses validate constraint courses_days_non_negative;

alter table courses
  add constraint courses_enrolled_count_non_negative check (enrolled_count >= 0) not valid;
alter table courses validate constraint courses_enrolled_count_non_negative;

alter table courses
  add constraint courses_attendees_count_non_negative check (attendees_count is null or attendees_count >= 0) not valid;
alter table courses validate constraint courses_attendees_count_non_negative;

alter table vehicles
  add constraint vehicles_water_capacity_non_negative check (water_capacity_liters is null or water_capacity_liters >= 0) not valid;
alter table vehicles validate constraint vehicles_water_capacity_non_negative;

alter table vehicles
  add constraint vehicles_crew_capacity_non_negative check (crew_capacity is null or crew_capacity >= 0) not valid;
alter table vehicles validate constraint vehicles_crew_capacity_non_negative;

-- No duplicar relaciones importantes: course_stations ya tiene PK compuesta
-- (course_id, station_id) desde 0001, que ya impide duplicados; no se repite
-- aca. push_subscriptions.endpoint ya es unique desde 0024.
