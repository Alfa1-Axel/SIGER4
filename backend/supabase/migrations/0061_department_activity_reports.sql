-- SIGER4 - Estadisticas de Departamentos Regionales: informes de actividad
--
-- Fase futura documentada explicitamente en 0042_departments_module.sql:
-- registro basico de actividad de cada departamento regional (reuniones,
-- capacitaciones, practicas, mantenimiento, gestion, informes, otro), sin
-- todavia un sistema complejo de aprobacion/flujo. Un informe es un registro
-- simple: quien, que tipo de actividad, cuando, cuanta gente y cuantas horas
-- -- pensado para poder armar estadisticas livianas (actividades por mes,
-- horas acumuladas, tipos mas frecuentes), no un workflow como las
-- solicitudes de prestamo del inventario (0057).
--
-- Permisos (confirmado explicitamente con el usuario):
--   - Lectura: cualquier usuario autenticado (mismo criterio que el resto de
--     los directorios institucionales del sistema).
--   - Escritura (crear/editar): informatica_r4, secretario_regional
--     (is_regional_role(), que desde 0048 significa SOLO secretario_regional
--     -- director_escuela ya no comparte esta funcion), el coordinador del
--     departamento, o CUALQUIER miembro del departamento (department_members
--     no distingue roles dentro del departamento, es todo-o-nada a nivel
--     membresia -- no hay forma de dar de alta un informe sin ya ser
--     coordinador o miembro).
--   - Borrado: informatica_r4 o quien cargo el informe (created_by_profile_id
--     = uno mismo) -- a diferencia de las solicitudes de prestamo, un informe
--     de actividad NO es un registro legal/institucional permanente, tiene
--     sentido poder borrar uno cargado por error.

create type department_activity_type as enum (
  'reunion',
  'capacitacion',
  'practica',
  'mantenimiento',
  'gestion',
  'informe',
  'otro'
);

create table department_activity_reports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  title text not null,
  description text,
  activity_date date not null default current_date,
  activity_type department_activity_type not null default 'otro',
  station_id uuid references stations(id) on delete set null,
  subsede_id uuid references subsedes(id) on delete set null,
  attendees_count integer not null default 0,
  hours_worked numeric(6, 2) not null default 0,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_activity_reports_attendees_non_negative check (attendees_count >= 0),
  constraint department_activity_reports_hours_non_negative check (hours_worked >= 0)
);

comment on table department_activity_reports is 'Registro basico de actividad de un departamento regional: reuniones, capacitaciones, practicas, mantenimiento, gestion u otros eventos, con asistentes y horas acumuladas para armar estadisticas livianas. No es un workflow con aprobacion -- es un registro simple, editable/borrable por quien lo cargo, el coordinador del departamento, o un rol regional/admin.';
comment on column department_activity_reports.station_id is 'Cuartel donde ocurrio la actividad, si aplica. Independiente de subsede_id -- ambos son opcionales y no se excluyen mutuamente (una actividad puede abarcar una subsede entera sin un cuartel puntual, o viceversa).';
comment on column department_activity_reports.subsede_id is 'Subsede donde ocurrio la actividad, si aplica. Ver station_id.';
comment on column department_activity_reports.hours_worked is 'Horas acumuladas de la actividad (ej. 2.5 = dos horas y media). numeric(6,2) alcanza para cargas institucionales razonables sin permitir valores absurdos por error de tipeo.';

create index idx_department_activity_reports_department_id on department_activity_reports(department_id, activity_date desc);
create index idx_department_activity_reports_activity_date on department_activity_reports(activity_date);
create index idx_department_activity_reports_activity_type on department_activity_reports(activity_type);
create index idx_department_activity_reports_station_id on department_activity_reports(station_id);
create index idx_department_activity_reports_subsede_id on department_activity_reports(subsede_id);

create trigger trg_department_activity_reports_updated_at
  before update on department_activity_reports
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table department_activity_reports enable row level security;

create policy "department_activity_reports_select_authenticated" on department_activity_reports
  for select using (auth.role() = 'authenticated');

create policy "department_activity_reports_write_member_or_admin" on department_activity_reports
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or exists (select 1 from departments d where d.id = department_activity_reports.department_id and d.coordinator_profile_id = current_profile_id())
    or exists (select 1 from department_members dm where dm.department_id = department_activity_reports.department_id and dm.profile_id = current_profile_id())
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or exists (select 1 from departments d where d.id = department_activity_reports.department_id and d.coordinator_profile_id = current_profile_id())
    or exists (select 1 from department_members dm where dm.department_id = department_activity_reports.department_id and dm.profile_id = current_profile_id())
  );

comment on policy "department_activity_reports_write_member_or_admin" on department_activity_reports is 'Crear/editar: informatica_r4, secretario_regional (is_regional_role(), solo ese rol desde 0048), el coordinador del departamento, o cualquier miembro (department_members no distingue roles internos). El borrado real queda mas restringido, ver policy de delete.';

-- Borrado mas restrictivo que el resto de la escritura: solo admin o quien
-- cargo el informe -- un miembro cualquiera puede editar un informe ajeno
-- del mismo departamento (arriba), pero no borrarlo.
create policy "department_activity_reports_delete_own_or_admin" on department_activity_reports
  for delete using (
    is_informatica_r4() or created_by_profile_id = current_profile_id()
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

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. department_activity_reports resuelve station_id/subsede_id directo del informe (a diferencia de departments/department_members, que no tienen territorio propio y quedan en la rama else).';

create trigger trg_audit_department_activity_reports
  after insert or update or delete on department_activity_reports
  for each row execute function audit_row_change();
