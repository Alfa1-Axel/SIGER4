-- SIGER4 - Modulo de Personal / Dotacion
--
-- Reemplaza el personnel_count manual de stations por un conteo real derivado
-- de una tabla de personal por cuartel. El objetivo no es cargar datos
-- sensibles porque si, sino medir capacidad institucional real (dotacion
-- activa, distribucion por cuartel/subsede, necesidades de capacitacion).
--
-- DNI queda opcional y sin destacarse visualmente (fase futura si se necesita
-- para cruces con otros sistemas); no es requisito de este modulo.

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

create trigger trg_personnel_updated_at
  before update on personnel
  for each row execute function set_updated_at();

alter table personnel enable row level security;

create policy "personnel_select_scope" on personnel
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

create policy "personnel_write_admin_regional_station" on personnel
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- audit_row_change() ya existe (0004) pero su "case tg_table_name" no conoce
-- 'personnel' todavia; se restablece completa con esa rama agregada (misma
-- tecnica que uso 0019 para documents), para que el contexto territorial se
-- resuelva via join a stations en vez de caer en la rama "else" (todo null).
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

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla.';

create trigger trg_audit_personnel
  after insert or update or delete on personnel
  for each row execute function audit_row_change();

-- ---------------- contador automatico de personal activo ----------------
-- personnel_count deja de ser manual: se recalcula solo, igual que ya se hizo
-- para vehicles_count en 0013. Solo cuenta personal en estado 'activo' (de
-- licencia/baja/reserva/aspirante no forman parte de la dotacion activa).

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

-- Backfill: cuarteles existentes no tienen filas en personnel todavia, asi
-- que el conteo real pasa a 0 hasta que se cargue la dotacion real (el valor
-- manual anterior no era confiable, ver comentario de 0013 para vehicles_count).
update stations set personnel_count = (select count(*) from personnel p where p.station_id = stations.id and p.status = 'activo');
