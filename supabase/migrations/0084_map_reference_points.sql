-- SIGER4 - Puntos de inflexión / referencia territorial del Mapa Regional (v1)
--
-- Diseño ya documentado como fase futura en DEPLOYMENT.md sección 40.2 (ronda
-- del Mapa Regional v1) -- esta migración implementa la v1 simple: puntos
-- individuales georreferenciados (rutas importantes, parques industriales,
-- ríos, zonas de riesgo, puntos estratégicos, referencias operativas), sin
-- líneas/polígonos/capas complejas. Un punto de referencia territorial NO
-- es un cuartel: vive en su propia tabla, separada de stations, y el mapa
-- los distingue visualmente (ver MapaRegionalPage.tsx).
--
-- Alcance opcional (region_id/subsede_id/station_id todos nullable): un
-- punto puede no estar asociado a ningún cuartel/subsede puntual (ej. un río
-- que cruza varias jurisdicciones, o un punto estratégico regional-wide) --
-- mismo criterio que notifications (0015) para "alcance opcional coincidente".
-- Si TODOS los campos de alcance son null, el punto es visible para
-- cualquier autenticado (referencia de toda la Regional 4); si alguno está
-- seteado, solo lo ven los usuarios cuyo alcance coincide.

create type map_reference_point_type as enum (
  'ruta',
  'parque_industrial',
  'rio',
  'zona_riesgo',
  'punto_estrategico',
  'otro'
);

create table if not exists map_reference_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type map_reference_point_type not null,
  description text,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  region_id uuid references regions(id) on delete set null,
  subsede_id uuid references subsedes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_reference_points_latitude_range check (latitude >= -90 and latitude <= 90),
  constraint map_reference_points_longitude_range check (longitude >= -180 and longitude <= 180)
);

comment on table map_reference_points is 'Puntos de inflexión / referencia territorial del Mapa Regional -- v1 simple (solo puntos, sin líneas/polígonos): rutas, parques industriales, ríos, zonas de riesgo, puntos estratégicos, referencias operativas. No son cuarteles (ver stations); alcance region_id/subsede_id/station_id todos opcionales -- si ninguno está seteado, el punto es una referencia general de toda la Regional 4, visible para cualquier autenticado.';
comment on column map_reference_points.type is 'Categoría del punto -- el frontend usa esto para elegir ícono/color y para el filtro de capas "Referencias territoriales" en /mapa.';
comment on column map_reference_points.latitude is 'Latitud WGS84, grados decimales. A diferencia de stations.latitude (nullable, un cuartel puede no tener coordenadas todavía), acá es obligatoria -- un punto de referencia territorial sin ubicación no tiene ningún sentido en el mapa.';
comment on column map_reference_points.is_active is 'Soft-delete: un punto inactivo no se borra (se conserva el historial de quién lo cargó y cuándo), solo deja de mostrarse en el mapa por defecto. Mismo patrón que departments.is_active (0042) y department_manual_members.is_active (0062).';

create index if not exists idx_map_reference_points_region_id on map_reference_points(region_id);
create index if not exists idx_map_reference_points_subsede_id on map_reference_points(subsede_id);
create index if not exists idx_map_reference_points_station_id on map_reference_points(station_id);

create trigger trg_map_reference_points_updated_at before update on map_reference_points
  for each row execute function set_updated_at();

alter table map_reference_points enable row level security;

-- Lectura: mismo patrón de "alcance opcional coincidente" que
-- notifications_select_own_or_scope (0015) -- informatica_r4 ve todo; un
-- punto SIN alcance definido (los 3 campos null) es una referencia general,
-- visible para cualquier autenticado; un punto CON alcance definido solo lo
-- ven los usuarios cuyo alcance (region_id/subsede_id/station_id via
-- my_region_ids()/my_subsede_ids()/my_station_ids()) coincide -- incluye a
-- invitado, que participa de esos helpers igual que cualquier otro rol (no
-- tiene un helper propio que lo excluya acá, a diferencia de auditoría,
-- donde se lo excluyó explícitamente por ser un dato mucho más sensible).
create policy "map_reference_points_select_scope" on map_reference_points
  for select using (
    is_informatica_r4()
    or (region_id is null and subsede_id is null and station_id is null)
    or (region_id is not null and region_id in (select my_region_ids()))
    or (subsede_id is not null and subsede_id in (select my_subsede_ids()))
    or (station_id is not null and station_id in (select my_station_ids()))
  );

-- Escritura: informatica_r4 sin restricción; secretario_regional (única
-- membresía real de is_regional_role() desde 0048) solo dentro de su propia
-- región -- nunca puede cargar/editar/borrar un punto fuera de
-- my_region_ids(), ni dejar region_id en null (eso lo haría visible a
-- cualquiera, escalando su propio alcance regional a "sin restricción").
-- Roles de cuartel NO tienen escritura (el pedido dice explícitamente
-- "lectura según alcance" para ellos, sin mencionar gestión).
create policy "map_reference_points_insert_scoped" on map_reference_points
  for insert with check (
    is_informatica_r4()
    or (is_regional_role() and region_id is not null and region_id in (select my_region_ids()))
  );

-- with check además de using: sin esto, secretario_regional podría editar
-- un punto ya dentro de su región y, en el mismo UPDATE, cambiarle
-- region_id a null o a una región ajena -- using solo valida la fila ANTES
-- del cambio, with check valida la fila DESPUÉS.
create policy "map_reference_points_update_scoped" on map_reference_points
  for update using (
    is_informatica_r4()
    or (is_regional_role() and region_id is not null and region_id in (select my_region_ids()))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and region_id is not null and region_id in (select my_region_ids()))
  );

-- Borrado físico: solo informatica_r4 -- mismo criterio que el resto del
-- sistema (ej. eliminar un usuario, ver admin-delete-user), donde el
-- borrado real queda reservado al superadmin y el resto de los roles usa
-- is_active para "sacar de circulación" sin perder el historial.
create policy "map_reference_points_delete_admin" on map_reference_points
  for delete using (is_informatica_r4());

comment on policy "map_reference_points_select_scope" on map_reference_points is 'Un punto sin alcance definido es una referencia general de la Regional 4 (visible para cualquier autenticado); un punto con alcance definido solo es visible para quien tenga ese mismo alcance -- nunca se muestra fuera del alcance real del usuario.';
comment on policy "map_reference_points_insert_scoped" on map_reference_points is 'secretario_regional solo puede crear puntos DENTRO de su propia región (region_id obligatorio y coincidente con my_region_ids()) -- no puede crear un punto sin alcance (eso lo haría visible a toda la app) ni en una región ajena.';
