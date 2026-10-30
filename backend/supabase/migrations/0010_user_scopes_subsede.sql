-- SIGER4 - Alcance de subsede en user_scopes + auditoria + RLS
--
-- Requiere que 0009_scope_type_add_subsede.sql ya se haya ejecutado (en su
-- propia transaccion) para que el valor 'subsede' del enum scope_type ya exista
-- y pueda usarse aqui sin el error "unsafe use of new value of enum type".
--
-- Decision de producto: el scope de subsede otorga SOLO lectura ampliada (ver
-- cuarteles, vehiculos y perfiles de esa subsede). La escritura sigue
-- dependiendo de los roles de cuartel/regional/admin existentes, igual que ya
-- pasa con el scope de region. No se agrega ninguna policy de escritura nueva.

alter table user_scopes
  add column if not exists subsede_id uuid references subsedes(id) on delete cascade;

comment on column user_scopes.subsede_id is 'Subsede asociada cuando scope_type = subsede. Null en el resto de los casos.';

-- ---------------- Helper: my_subsede_ids() ----------------

create or replace function my_subsede_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select subsede_id from user_scopes
  where profile_id = current_profile_id() and subsede_id is not null;
$$;

comment on function my_subsede_ids() is 'IDs de subsede a los que el usuario actual tiene acceso via user_scopes (scope_type = subsede).';

-- ---------------- RLS: stations_select_scope ----------------
-- Se agrega el OR de subsede: un usuario con scope de subsede ve todos los
-- cuarteles de esa subsede, ademas de lo que ya veia.

drop policy if exists "stations_select_scope" on stations;

create policy "stations_select_scope" on stations
  for select using (
    is_informatica_r4()
    or is_regional_role() and region_id in (select my_region_ids())
    or id in (select my_station_ids())
    or subsede_id in (select my_subsede_ids())
    or has_role('invitado') and id in (select my_station_ids())
  );

-- ---------------- RLS: vehicles_select_scope ----------------
-- Un usuario con scope de subsede tambien ve los vehiculos de los cuarteles de
-- esa subsede.

drop policy if exists "vehicles_select_scope" on vehicles;

create policy "vehicles_select_scope" on vehicles
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- ---------------- RLS: profiles_select_subsede_scope ----------------
-- Analogo a profiles_select_regional: un usuario con scope de subsede puede ver
-- los perfiles cuyo cuartel pertenece a esa subsede.

create policy "profiles_select_subsede_scope" on profiles
  for select using (
    station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- ---------------- Auditoria: user_scopes ----------------
-- user_scopes no tenia trigger de auditoria hasta ahora. Se agrega para que los
-- cambios de alcance queden registrados automaticamente, igual que ya pasa con
-- stations/profiles/user_roles/courses/vehicles/documents.

create trigger trg_audit_user_scopes
  after insert or update or delete on user_scopes
  for each row execute function audit_row_change();
