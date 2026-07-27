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

create table if not exists intervention_summaries (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  category text not null,
  total_count integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table intervention_summaries is 'Resumenes periodicos de intervenciones (incendios, rescates, accidentes, etc.) por cuartel.';

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
-- GESTION DOCUMENTAL
-- ============================================================

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  title text not null,
  category text not null,
  storage_path text not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table documents is 'Documentacion institucional (circulares, actas, manuales). storage_path referencia a Supabase Storage.';

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
