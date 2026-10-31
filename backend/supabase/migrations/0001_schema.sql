-- SIGER4 - Esquema inicial
-- Sistema Integral de Gestion de la Regional 4 de Bomberos Voluntarios
--
-- Este script crea las tablas base. Pegar en el SQL Editor de Supabase
-- (Proyecto > SQL Editor > New query) y ejecutar una sola vez.

create extension if not exists "pgcrypto";

-- ============================================================
-- REGIONES Y CUARTELES
-- ============================================================

create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

comment on table regions is 'Regionales de Bomberos Voluntarios (ej. Regional 4). Preparado para futuras regionales.';

create table if not exists subsedes (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (region_id, code)
);

comment on table subsedes is 'Subsedes de una regional (ej. SubSede Las Varillas, Subsede Luque, Subsede Rio Primero). Cada cuartel pertenece a una subsede.';

create type station_status as enum ('operativo', 'no_operativo');

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete restrict,
  subsede_id uuid references subsedes(id) on delete restrict,
  name text not null,
  code text not null,
  address text,
  zone text,
  phone text,
  email text,
  social_media jsonb,
  description text,
  status station_status not null default 'operativo',
  response_time_minutes integer,
  personnel_count integer not null default 0,
  vehicles_count integer not null default 0,
  founded_year integer,
  cover_image_url text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, code)
);

comment on table stations is 'Cuarteles de bomberos dependientes de una regional y una subsede.';
comment on column stations.phone is 'Telefono de contacto del cuartel.';
comment on column stations.email is 'Email institucional del cuartel.';
comment on column stations.social_media is 'Redes sociales del cuartel, formato libre {"facebook": "...", "instagram": "..."}.';
comment on column stations.description is 'Descripcion institucional libre del cuartel.';
comment on column stations.logo_url is 'Logo/escudo institucional del cuartel (Supabase Storage). Distinto de cover_image_url (foto de portada).';

-- ============================================================
-- PERFILES, ROLES Y ALCANCES (SCOPES)
-- ============================================================

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  rank text,
  phone text,
  "position" text,
  seniority_start_date date,
  region_id uuid references regions(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Perfil institucional de cada usuario autenticado en Supabase Auth.';
comment on column profiles.phone is 'Telefono de contacto del usuario.';
comment on column profiles."position" is 'Cargo o funcion del usuario (distinto de rank, que es la jerarquia).';
comment on column profiles.seniority_start_date is 'Fecha de ingreso, usada para calcular antiguedad.';

create type role_key as enum (
  'informatica_r4',
  'integrante_informatica',
  'director_escuela',
  'instructor',
  'secretario_regional',
  'presidente_cuartel',
  'jefe_cuerpo_activo',
  'usuario_carga_cuartel',
  'secretario_comision',
  'administrativo',
  'invitado'
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role role_key not null,
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

comment on table user_roles is 'Roles institucionales asignados a cada perfil. informatica_r4 es el rol administrador maximo.';

create type scope_type as enum ('system', 'region', 'subsede', 'station', 'escuela');

create table if not exists user_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  scope_type scope_type not null,
  region_id uuid references regions(id) on delete cascade,
  subsede_id uuid references subsedes(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table user_scopes is 'Alcance de datos visible para cada perfil: sistema completo, una region, una subsede, un cuartel o la escuela regional.';

-- ============================================================
-- AUDITORIA
-- ============================================================

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  region_id uuid references regions(id) on delete set null,
  subsede_id uuid references subsedes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table audit_logs is 'Bitacora institucional: quien hizo que, cuando, sobre que registro, y valores antes/despues.';
comment on column audit_logs.region_id is 'Region asociada al evento, resuelta segun la tabla auditada.';
comment on column audit_logs.subsede_id is 'Subsede asociada al evento, resuelta segun la tabla auditada.';
comment on column audit_logs.station_id is 'Cuartel asociado al evento, resuelto segun la tabla auditada.';

-- ============================================================
-- NOTIFICACIONES
-- ============================================================

create type notification_type as enum (
  'curso_nuevo',
  'circular_nueva',
  'asistencia_pendiente',
  'estadisticas_nuevas',
  'cambio_estado',
  'actividad_proxima',
  'documento_actualizado',
  'reporte_generado'
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  region_id uuid references regions(id) on delete cascade,
  subsede_id uuid references subsedes(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table notifications is 'Notificaciones internas. profile_id nulo = notificacion masiva para la region/subsede/cuartel indicado.';
comment on column notifications.subsede_id is 'Subsede destino cuando la notificacion es masiva para toda una subsede (no un cuartel especifico).';

-- ============================================================
-- ASISTENCIA E INTERVENCIONES (RESUMENES)
-- ============================================================

create table if not exists attendance_summaries (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  attendance_rate numeric(5,2) not null,
  total_members integer not null,
  present_average numeric(6,2) not null,
  created_at timestamptz not null default now()
);

comment on table attendance_summaries is 'Resumenes periodicos de asistencia por cuartel, usados para estadisticas y dashboard.';

create type intervention_time_of_day as enum ('diurno', 'nocturno', 'mixto');

create table if not exists intervention_summaries (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  category text not null,
  total_count integer not null default 0,
  time_of_day intervention_time_of_day,
  observations text,
  personnel_count integer not null default 0,
  vehicles_count integer not null default 0,
  work_hours numeric(6, 1) not null default 0,
  created_at timestamptz not null default now()
);

comment on table intervention_summaries is 'Resumenes periodicos de intervenciones (incendios, rescates, accidentes, etc.) por cuartel.';
comment on column intervention_summaries.time_of_day is 'Franja horaria predominante de las intervenciones del resumen: diurno, nocturno, o mixto si hubo de ambas.';
comment on column intervention_summaries.observations is 'Notas libres del resumen (sin datos de victimas ni direcciones exactas).';
comment on column intervention_summaries.personnel_count is 'Cantidad de personal que participo de las intervenciones del periodo (para relacionar dotacion vs. actividad operativa).';
comment on column intervention_summaries.vehicles_count is 'Cantidad de moviles/vehiculos que participaron de las intervenciones del periodo.';
comment on column intervention_summaries.work_hours is 'Horas de trabajo totales dedicadas a las intervenciones del periodo.';

-- ============================================================
-- CURSOS (ESCUELA REGIONAL)
-- ============================================================

create type course_status as enum ('planificado', 'en_curso', 'finalizado', 'cancelado');

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete cascade,
  title text not null,
  category text not null,
  status course_status not null default 'planificado',
  start_date date,
  end_date date,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  enrolled_count integer not null default 0,
  attendees_count integer,
  hours integer,
  days integer,
  speakers text,
  instructor_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table courses is 'Cursos y capacitaciones de la Escuela Regional.';
comment on column courses.attendees_count is 'Cantidad de asistentes reales (asistencia registrada al finalizar), distinto de enrolled_count (inscriptos).';
comment on column courses.hours is 'Cantidad total de horas catedra del curso/actividad.';
comment on column courses.days is 'Cantidad de dias que dura el curso/actividad (numero simple, no fechas puntuales).';
comment on column courses.speakers is 'Disertantes del curso/actividad, texto libre separado por comas. No referencia profiles.';

create table if not exists course_stations (
  course_id uuid not null references courses(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, station_id)
);

comment on table course_stations is 'Cuarteles que participan de un curso/actividad de la Escuela Regional (relacion muchos-a-muchos).';

-- ============================================================
-- VEHICULOS
-- ============================================================

create type vehicle_status as enum ('operativo', 'mantenimiento', 'fuera_de_servicio');

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  internal_code text not null,
  vehicle_type text not null,
  status vehicle_status not null default 'operativo',
  plate text,
  water_capacity_liters integer,
  crew_capacity integer,
  observations text,
  last_service_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, internal_code)
);

comment on table vehicles is 'Vehiculos/moviles registrados por cuartel.';
comment on column vehicles.water_capacity_liters is 'Capacidad de agua en litros (si aplica al tipo de vehiculo).';
comment on column vehicles.crew_capacity is 'Capacidad de personal/tripulantes (si aplica al tipo de vehiculo).';
comment on column vehicles.observations is 'Observaciones libres sobre el estado/uso del vehiculo.';

create or replace function sync_station_vehicles_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = new.station_id)
    where id = new.station_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = new.station_id)
    where id = new.station_id;
    if (old.station_id is distinct from new.station_id) then
      update stations set vehicles_count = (select count(*) from vehicles where station_id = old.station_id)
      where id = old.station_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = old.station_id)
    where id = old.station_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function sync_station_vehicles_count() is 'Recalcula stations.vehicles_count desde la tabla vehicles cada vez que cambian los vehiculos de un cuartel.';

create trigger trg_sync_station_vehicles_count
  after insert or update or delete on vehicles
  for each row execute function sync_station_vehicles_count();

-- ============================================================
-- PERSONAL / DOTACION
-- ============================================================
-- Mide capacidad institucional real (dotacion activa, distribucion por
-- cuartel/subsede, necesidades de capacitacion), no es un padron de RRHH
-- completo. DNI queda opcional y sin destacarse visualmente.

create type personnel_status as enum ('activo', 'licencia', 'baja', 'reserva', 'aspirante');

create table if not exists personnel (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  national_id text,
  rank text,
  role_function text,
  status personnel_status not null default 'activo',
  department text,
  join_date date,
  phone text,
  email text,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table personnel is 'Personal/dotacion real por cuartel: mide capacidad institucional, no es un padron de RRHH completo.';
comment on column personnel.national_id is 'DNI, opcional. No se usa como requisito ni se destaca visualmente en los listados.';
comment on column personnel.rank is 'Jerarquia dentro del cuerpo activo (ej. Bombero, Cabo, Sargento, Oficial).';
comment on column personnel.role_function is 'Cargo o funcion dentro del cuartel (ej. Conductor, Instructor interno, Tesorero).';
comment on column personnel.department is 'Departamento/area al que pertenece dentro del cuartel (ej. Cuerpo Activo, Comision Directiva, Escuela).';
comment on column personnel.join_date is 'Fecha de ingreso; la antiguedad se calcula en la aplicacion a partir de esta fecha, no se almacena.';

create index if not exists idx_personnel_station_id on personnel(station_id);
create index if not exists idx_personnel_status on personnel(status);

-- personnel_count deja de ser manual: se recalcula solo (solo cuenta personal
-- en estado 'activo'), igual que vehicles_count.
create or replace function sync_station_personnel_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update stations set personnel_count = (select count(*) from personnel where station_id = new.station_id and status = 'activo')
    where id = new.station_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    update stations set personnel_count = (select count(*) from personnel where station_id = new.station_id and status = 'activo')
    where id = new.station_id;
    if (old.station_id is distinct from new.station_id) then
      update stations set personnel_count = (select count(*) from personnel where station_id = old.station_id and status = 'activo')
      where id = old.station_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    update stations set personnel_count = (select count(*) from personnel where station_id = old.station_id and status = 'activo')
    where id = old.station_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function sync_station_personnel_count() is 'Recalcula stations.personnel_count (solo personal activo) desde la tabla personnel cada vez que cambia.';

create trigger trg_sync_station_personnel_count
  after insert or update or delete on personnel
  for each row execute function sync_station_personnel_count();

-- ============================================================
-- GESTION DOCUMENTAL
-- ============================================================

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions(id) on delete cascade,
  subsede_id uuid references subsedes(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  title text not null,
  category text not null,
  description text,
  storage_path text not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table documents is 'Documentacion institucional (circulares, actas, manuales). storage_path referencia a Supabase Storage.';
comment on column documents.subsede_id is 'Subsede destino cuando el documento es para toda una subsede.';
comment on column documents.profile_id is 'Perfil destino cuando el documento es para un usuario especifico.';
comment on column documents.description is 'Descripcion libre del documento.';

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  storage_path text not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

comment on table document_versions is 'Historial de versiones de un documento: cada fila es un archivo subido previamente. La version vigente es documents.storage_path.';

-- ============================================================
-- TRIGGERS: updated_at automatico
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_stations_updated_at before update on stations
  for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_courses_updated_at before update on courses
  for each row execute function set_updated_at();
create trigger trg_vehicles_updated_at before update on vehicles
  for each row execute function set_updated_at();
create trigger trg_documents_updated_at before update on documents
  for each row execute function set_updated_at();
create trigger trg_personnel_updated_at before update on personnel
  for each row execute function set_updated_at();

-- ============================================================
-- NOTIFICACIONES AUTOMATICAS
-- ============================================================
-- Ademas de las notificaciones manuales (creadas desde /notificaciones/nueva),
-- estos triggers generan notificaciones automaticas desde eventos del sistema,
-- respetando el mismo alcance (region/subsede/cuartel/usuario) del evento que
-- las origina. Escriben en "notifications", que ya tiene su propio trigger de
-- auditoria (trg_audit_notifications, mas abajo), asi que cada notificacion
-- automatica queda registrada en audit_logs sin trabajo adicional.

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

-- ============================================================
-- DATOS INICIALES: Regional 4
-- ============================================================

insert into regions (name, code)
values ('Regional 4', 'R4')
on conflict (code) do nothing;

insert into subsedes (region_id, name, code)
select r.id, v.name, v.code
from regions r
cross join (
  values
    ('SubSede Las Varillas', 'LV'),
    ('Subsede Luque', 'LQ'),
    ('Subsede Rio Primero', 'RP')
) as v(name, code)
where r.code = 'R4'
on conflict (region_id, code) do nothing;
