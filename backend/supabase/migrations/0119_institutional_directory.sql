-- SIGER4 - Lectura institucional básica de Cuarteles y Departamentos para todos los usuarios activos (v1.17.0)
--
-- Regla nueva: cualquier persona con una cuenta ACTIVA de SIGER4 puede ver la ficha institucional
-- básica de cada cuartel y de cada departamento de la Regional, sin darle acceso a nada interno ni a
-- ninguna edición.
--
--   Cuartel (ficha básica):  nombre, código, Regional, subsede, zona, dirección, ubicación en el mapa,
--                            teléfono, WhatsApp, correo y redes institucionales, descripción, año de
--                            fundación, logo, portada, estado (operativo / no operativo) y sus
--                            autoridades (nombre y cargo).
--   Departamento (básica):   nombre, descripción, contacto institucional, estado (activo / inactivo)
--                            y nombre de su coordinador.
--
-- Lo que SIGUE restringido (no sale en ninguna de estas funciones): efectivos y su historial, personal,
-- móviles, asistencia, intervenciones, estado de carga, tiempo de respuesta, notas del mapa, documentos,
-- historial institucional, calendario del cuartel, avales; y de los departamentos: miembros, informes,
-- actas, documentos internos, eventos, avisos y archivos. Tampoco salen el correo ni el teléfono
-- personales de las autoridades.
--
-- Cómo se hace sin relajar ninguna política: NO se toca la RLS de stations ni de departments (ni las
-- políticas restrictivas del modo departamento de 0107). Se agregan tres funciones de solo lectura
-- (SECURITY DEFINER) que devuelven SOLO las columnas básicas. Quien tiene acceso interno sigue leyendo
-- las tablas como siempre; quien no, lee solo esta ficha. current_profile_id() es null si la cuenta no
-- existe o está desactivada: en ese caso las funciones no devuelven nada.
--
-- Es idempotente: se puede volver a correr. No modifica datos.
set client_encoding = 'UTF8';

-- ============================================================
-- 1. Cuarteles: ficha básica
-- ============================================================

create or replace function list_station_directory()
returns table (
  id uuid,
  region_id uuid,
  region_name text,
  subsede_id uuid,
  subsede_name text,
  name text,
  code text,
  address text,
  zone text,
  phone text,
  whatsapp_phone text,
  email text,
  social_media jsonb,
  description text,
  status station_status,
  founded_year integer,
  logo_url text,
  cover_image_url text,
  latitude numeric,
  longitude numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.region_id,
    r.name,
    s.subsede_id,
    sb.name,
    s.name,
    s.code,
    s.address,
    s.zone,
    s.phone,
    s.whatsapp_phone,
    s.email,
    s.social_media,
    s.description,
    s.status,
    s.founded_year,
    s.logo_url,
    s.cover_image_url,
    s.latitude,
    s.longitude
  from stations s
  join regions r on r.id = s.region_id
  left join subsedes sb on sb.id = s.subsede_id
  where current_profile_id() is not null
  order by s.name;
$$;

comment on function list_station_directory() is 'Ficha institucional básica de TODOS los cuarteles para cualquier usuario activo (0119). Solo columnas institucionales: no devuelve efectivos, móviles, tiempo de respuesta, estado de carga ni notas del mapa.';

-- ============================================================
-- 2. Cuarteles: autoridades (nombre y cargo)
-- ============================================================

create or replace function station_directory_authorities(p_station_id uuid)
returns table (
  full_name text,
  role role_key
)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name, ur.role
  from user_roles ur
  join profiles p on p.id = ur.profile_id
  where current_profile_id() is not null
    and p_station_id is not null
    and p.is_active = true
    and p.station_id = p_station_id
    and ur.role in ('presidente_cuartel', 'jefe_cuerpo_activo', 'secretario_comision')
  order by
    case ur.role when 'presidente_cuartel' then 1 when 'jefe_cuerpo_activo' then 2 else 3 end,
    p.full_name;
$$;

comment on function station_directory_authorities(uuid) is 'Autoridades de un cuartel (Presidente de CD, Jefe de Cuerpo Activo y Secretario de CD activos): solo nombre y cargo, para cualquier usuario activo (0119). No devuelve correo ni teléfono personales.';

-- ============================================================
-- 3. Departamentos: ficha básica
-- ============================================================

create or replace function list_department_directory()
returns table (
  id uuid,
  name text,
  description text,
  contact_info text,
  is_active boolean,
  coordinator_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.name,
    d.description,
    d.contact_info,
    d.is_active,
    c.full_name
  from departments d
  left join profiles c on c.id = d.coordinator_profile_id
  where current_profile_id() is not null
  order by d.name;
$$;

comment on function list_department_directory() is 'Ficha institucional básica de TODOS los departamentos para cualquier usuario activo (0119): nombre, descripción, contacto, estado y coordinador. No devuelve miembros ni cantidades ni nada del contenido interno.';

-- ============================================================
-- 4. Permisos de ejecución: solo personas con sesión
-- ============================================================

revoke all on function list_station_directory() from public, anon;
revoke all on function station_directory_authorities(uuid) from public, anon;
revoke all on function list_department_directory() from public, anon;
grant execute on function list_station_directory() to authenticated;
grant execute on function station_directory_authorities(uuid) to authenticated;
grant execute on function list_department_directory() to authenticated;
