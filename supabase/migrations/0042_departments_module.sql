-- SIGER4 - Base del modulo Departamentos Regionales
--
-- Registra los departamentos/areas regionales (ej. Capacitacion, Logistica,
-- Comunicaciones): nombre, descripcion, coordinador, miembros (con el
-- cuartel de cada uno), contacto y estado activo/inactivo.
--
-- Permisos: solo el coordinador del departamento e informatica_r4/
-- integrante_informatica pueden modificarlo (editar datos del departamento,
-- agregar/quitar miembros). El resto de los usuarios autenticados puede
-- verlo (igual que el resto de los directorios institucionales del sistema).
--
-- Fase futura (documentado, no implementado en esta tanda): informes y
-- estadisticas de actividad por departamento.

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  coordinator_profile_id uuid references profiles(id) on delete set null,
  contact_info text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table departments is 'Departamentos/areas regionales (ej. Capacitacion, Logistica). coordinator_profile_id es el unico, ademas de informatica_r4, que puede modificar el departamento y sus miembros.';

create trigger trg_departments_updated_at
  before update on departments
  for each row execute function set_updated_at();

create table department_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (department_id, profile_id)
);

comment on table department_members is 'Miembros de un departamento regional. El cuartel de cada miembro se resuelve via profiles.station_id (no se duplica aca), asi siempre refleja el cuartel actual del miembro.';

create index idx_department_members_department_id on department_members(department_id);
create index idx_department_members_profile_id on department_members(profile_id);

-- ============================================================
-- RLS
-- ============================================================

alter table departments enable row level security;
alter table department_members enable row level security;

create policy "departments_select_authenticated" on departments
  for select using (auth.role() = 'authenticated');

create policy "departments_write_coordinator_or_admin" on departments
  for all using (
    is_informatica_r4() or coordinator_profile_id = current_profile_id()
  )
  with check (
    is_informatica_r4() or coordinator_profile_id = current_profile_id()
  );

comment on policy "departments_write_coordinator_or_admin" on departments is 'Solo el coordinador del departamento (coordinator_profile_id = uno mismo) o informatica_r4/integrante_informatica pueden editar el departamento.';

create policy "department_members_select_authenticated" on department_members
  for select using (auth.role() = 'authenticated');

-- Escritura de miembros: solo el coordinador del departamento en cuestion o
-- informatica_r4. Se resuelve via join a departments (department_members no
-- tiene coordinator_profile_id propio).
create policy "department_members_write_coordinator_or_admin" on department_members
  for all using (
    is_informatica_r4()
    or exists (select 1 from departments d where d.id = department_members.department_id and d.coordinator_profile_id = current_profile_id())
  )
  with check (
    is_informatica_r4()
    or exists (select 1 from departments d where d.id = department_members.department_id and d.coordinator_profile_id = current_profile_id())
  );

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

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. departments/department_members no tienen territorio propio (son regionales por definicion), quedan en la rama "else" (sin region/subsede/station), lo cual es correcto.';

create trigger trg_audit_departments
  after insert or update or delete on departments
  for each row execute function audit_row_change();

create trigger trg_audit_department_members
  after insert or update or delete on department_members
  for each row execute function audit_row_change();
