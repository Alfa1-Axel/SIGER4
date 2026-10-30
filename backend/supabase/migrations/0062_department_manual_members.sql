-- SIGER4 - Integrantes manuales de Departamentos Regionales
--
-- Hueco detectado en auditoria de permisos (2026-08-07): department_members
-- exige profile_id not null, es decir la unica forma de sumar un integrante a
-- un departamento es que ya tenga usuario/cuenta en el sistema. En la
-- practica, un departamento regional puede tener integrantes que solo deben
-- figurar como tales (nombre, cuartel, cargo/funcion dentro del
-- departamento) sin necesitar cuenta Auth ni rol del sistema. Esta migracion
-- agrega una tabla hermana para ese caso, sin tocar department_members (que
-- sigue siendo la relacion "profile real es miembro").
--
-- Permisos (mismo criterio que department_activity_reports en 0061, para
-- consistencia dentro del modulo Departamentos):
--   - Lectura: cualquier usuario autenticado.
--   - Escritura (crear/editar/desactivar): informatica_r4, secretario_regional
--     (is_regional_role()), el coordinador del departamento, o cualquier
--     miembro real del departamento (department_members).
--   - Borrado: NO se expone borrado fisico desde la app -- se desactiva
--     (is_active = false) igual que el resto de "bajas" institucionales del
--     sistema (profiles, departments, inventory_items). Solo informatica_r4
--     podria borrar la fila en Supabase directamente si hiciera falta
--     corregir un error de carga; no hay policy de delete para nadie mas.
--   - El coordinador del departamento sigue siendo obligatoriamente un
--     profile/user real (coordinator_profile_id en departments, sin cambios).
--   - linked_profile_id es opcional: si el integrante manual corresponde a un
--     usuario real del sistema, se puede asociar sin que sea obligatorio.

create table department_manual_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  station_id uuid references stations(id) on delete set null,
  role_function text,
  contact_info text,
  is_active boolean not null default true,
  observations text,
  linked_profile_id uuid references profiles(id) on delete set null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table department_manual_members is 'Integrantes de un departamento regional sin cuenta de usuario en el sistema: solo figuran como tales (nombre, cuartel, cargo/funcion, contacto). No ocupan cuenta Auth ni requieren rol. Se desactivan (is_active = false) en vez de borrarse. Distinto de department_members, que vincula un profile/user real.';
comment on column department_manual_members.station_id is 'Cuartel del integrante, opcional -- a diferencia de department_members, que resuelve el cuartel via profiles.station_id, aca se carga directo porque no hay profile.';
comment on column department_manual_members.role_function is 'Cargo o funcion del integrante dentro del departamento (ej. "Vocal", "Responsable de logistica"). Texto libre.';
comment on column department_manual_members.linked_profile_id is 'Asociacion opcional a un profile/user real, si el integrante manual tambien tiene cuenta en el sistema. No obligatoria.';

create index idx_department_manual_members_department_id on department_manual_members(department_id);
create index idx_department_manual_members_station_id on department_manual_members(station_id);
create index idx_department_manual_members_linked_profile_id on department_manual_members(linked_profile_id);

create trigger trg_department_manual_members_updated_at
  before update on department_manual_members
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table department_manual_members enable row level security;

create policy "department_manual_members_select_authenticated" on department_manual_members
  for select using (auth.role() = 'authenticated');

create policy "department_manual_members_write_member_or_admin" on department_manual_members
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or exists (select 1 from departments d where d.id = department_manual_members.department_id and d.coordinator_profile_id = current_profile_id())
    or exists (select 1 from department_members dm where dm.department_id = department_manual_members.department_id and dm.profile_id = current_profile_id())
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or exists (select 1 from departments d where d.id = department_manual_members.department_id and d.coordinator_profile_id = current_profile_id())
    or exists (select 1 from department_members dm where dm.department_id = department_manual_members.department_id and dm.profile_id = current_profile_id())
  );

comment on policy "department_manual_members_write_member_or_admin" on department_manual_members is 'Crear/editar/desactivar: informatica_r4, secretario_regional (is_regional_role()), el coordinador del departamento, o cualquier miembro real (department_members). No hay policy de delete: las bajas se hacen con is_active = false, igual que el resto del sistema.';

-- ============================================================
-- Auditoria
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
    when 'inventory_loan_requests' then
      v_station_id := rec.requesting_station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.requesting_station_id;
    when 'department_activity_reports' then
      v_station_id := rec.station_id;
      v_subsede_id := rec.subsede_id;
      if v_subsede_id is null and v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
      if v_station_id is not null then
        select region_id into v_region_id from stations where id = v_station_id;
      elsif v_subsede_id is not null then
        select region_id into v_region_id from subsedes where id = v_subsede_id;
      end if;
    when 'department_manual_members' then
      v_station_id := rec.station_id;
      if v_station_id is not null then
        select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = v_station_id;
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

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. department_manual_members resuelve region_id/subsede_id a partir de su station_id (si tiene cuartel cargado); si no tiene cuartel, queda sin territorio (null), igual que un departamento sin actividad geolocalizada.';

create trigger trg_audit_department_manual_members
  after insert or update or delete on department_manual_members
  for each row execute function audit_row_change();
