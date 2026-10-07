-- SIGER4 - Dotación actual del cuartel, por categorías
--
-- Qué resuelve: hasta ahora la dotación de un cuartel salía de contar el
-- personal activo de un registro nominal (tabla personnel). Para gestión y
-- reportes alcanza con saber cuántos integrantes hay en cada categoría, y
-- cargar nombre por nombre hacía perder tiempo. Esta migración agrega la
-- ficha de DOTACIÓN ACTUAL del cuartel: ocho cantidades que se editan cuando
-- cambia la dotación real. No es una carga mensual ni anual.
--
-- Una sola cifra de dotación (sin duplicar fuentes de verdad):
--   - stations.personnel_count sigue siendo EL total que usan Asistencia,
--     reportes, tarjetas e Inicio. Lo completa la base:
--       * si el cuartel cargó su dotación por categorías: la suma de las
--         categorías (station_staffing.total);
--       * si todavía no la cargó: el personal activo del registro nominal,
--         como hasta ahora. Los cuarteles existentes conservan su número
--         hasta que carguen la dotación; no se inventa ningún valor.
--   - El registro nominal (personnel) sigue existiendo y es opcional.
--
-- Categorías: las del sistema bomberil (aspirantes menores y mayores,
-- bomberos nivel 1 a 4, personal en reserva y cuerpo auxiliar). No se
-- agregaron cadetes, oficiales, suboficiales ni comisión directiva: los
-- oficiales y suboficiales son jerarquías dentro de los niveles y la comisión
-- directiva no forma parte de la dotación operativa.
--
-- Permisos: los mismos que la carga de personal (0027). Informática en todo;
-- el Secretario Regional dentro de su Regional; Presidente, Jefe de Cuerpo
-- Activo y usuario de carga en su propio cuartel. Lectura con el alcance de
-- personal. Quien está en modo departamento (0107) no la lee.
set client_encoding = 'UTF8';

-- ---------------- Tabla ----------------

create table if not exists station_staffing (
  station_id uuid primary key references stations(id) on delete cascade,
  aspirantes_menores integer not null default 0,
  aspirantes_mayores integer not null default 0,
  bomberos_nivel_1 integer not null default 0,
  bomberos_nivel_2 integer not null default 0,
  bomberos_nivel_3 integer not null default 0,
  bomberos_nivel_4 integer not null default 0,
  personal_reserva integer not null default 0,
  cuerpo_auxiliar integer not null default 0,
  -- Se calcula siempre en la base: nadie carga el total a mano.
  total integer generated always as (
    aspirantes_menores + aspirantes_mayores + bomberos_nivel_1 + bomberos_nivel_2 +
    bomberos_nivel_3 + bomberos_nivel_4 + personal_reserva + cuerpo_auxiliar
  ) stored,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_staffing_counts_range check (
    aspirantes_menores between 0 and 9999
    and aspirantes_mayores between 0 and 9999
    and bomberos_nivel_1 between 0 and 9999
    and bomberos_nivel_2 between 0 and 9999
    and bomberos_nivel_3 between 0 and 9999
    and bomberos_nivel_4 between 0 and 9999
    and personal_reserva between 0 and 9999
    and cuerpo_auxiliar between 0 and 9999
  )
);

comment on table station_staffing is 'Dotación actual del cuartel por categorías (una fila por cuartel, editable cuando cambia la dotación real). Su total alimenta stations.personnel_count.';
comment on column station_staffing.total is 'Suma de las ocho categorías. La calcula la base; no se carga.';
comment on column station_staffing.updated_by_profile_id is 'Quién la actualizó por última vez. La completa la base con el usuario que guarda.';
comment on column station_staffing.updated_by_name is 'Nombre de quien la actualizó, tomado al guardar para mostrarlo sin consultar perfiles.';

-- ---------------- Quién y cuándo, siempre de la base ----------------

create or replace function station_staffing_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.station_id is distinct from old.station_id then
    raise exception 'La dotación no se puede pasar a otro cuartel.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.updated_by_profile_id := current_profile_id();
  select p.full_name into new.updated_by_name from profiles p where p.id = new.updated_by_profile_id;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function station_staffing_before_write() from public;
revoke all on function station_staffing_before_write() from anon;
revoke all on function station_staffing_before_write() from authenticated;

drop trigger if exists trg_station_staffing_before_write on station_staffing;
create trigger trg_station_staffing_before_write
  before insert or update on station_staffing
  for each row execute function station_staffing_before_write();

-- ---------------- La dotación de stations.personnel_count ----------------

create or replace function station_dotation_total(p_station_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.total from station_staffing s where s.station_id = p_station_id),
    (select count(*)::integer from personnel p where p.station_id = p_station_id and p.status = 'activo')
  );
$$;

comment on function station_dotation_total(uuid) is 'Dotación del cuartel: la suma de las categorías si cargó su dotación actual; si no, el personal activo del registro nominal.';

revoke all on function station_dotation_total(uuid) from public;
revoke all on function station_dotation_total(uuid) from anon;
revoke all on function station_dotation_total(uuid) from authenticated;

-- Al cambiar el registro nominal: solo pesa si el cuartel no cargó categorías.
create or replace function sync_station_personnel_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    update stations set personnel_count = station_dotation_total(new.station_id)
    where id = new.station_id and personnel_count is distinct from station_dotation_total(new.station_id);
  end if;
  if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.station_id is distinct from new.station_id)) then
    update stations set personnel_count = station_dotation_total(old.station_id)
    where id = old.station_id and personnel_count is distinct from station_dotation_total(old.station_id);
  end if;
  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

comment on function sync_station_personnel_count() is 'Recalcula stations.personnel_count (dotación) cuando cambia el registro nominal de personal: solo cuenta si el cuartel no cargó su dotación por categorías.';

-- Al guardar la dotación por categorías.
create or replace function sync_station_dotation_from_staffing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station uuid := case when tg_op = 'DELETE' then old.station_id else new.station_id end;
begin
  update stations set personnel_count = station_dotation_total(v_station)
  where id = v_station and personnel_count is distinct from station_dotation_total(v_station);
  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function sync_station_dotation_from_staffing() from public;
revoke all on function sync_station_dotation_from_staffing() from anon;
revoke all on function sync_station_dotation_from_staffing() from authenticated;

drop trigger if exists trg_station_staffing_sync_dotation on station_staffing;
create trigger trg_station_staffing_sync_dotation
  after insert or update or delete on station_staffing
  for each row execute function sync_station_dotation_from_staffing();

comment on column stations.personnel_count is 'Dotación del cuartel. La completa la base: la suma de las categorías de station_staffing si el cuartel cargó su dotación actual; si no, el personal activo del registro nominal (personnel).';
comment on column attendance_summaries.total_members is 'Dotación del cuartel al dar de alta el resumen (stations.personnel_count: la dotación actual por categorías o, si el cuartel todavía no la cargó, el personal activo del registro nominal). La completa la base; null si el cuartel no tenía dotación cargada. Es un dato histórico: no cambia si después cambia la dotación. En los resúmenes anteriores a 0104 es el valor que se cargaba a mano.';

-- ---------------- Permisos (RLS) ----------------

alter table station_staffing enable row level security;

-- Lectura: el mismo alcance que el personal del cuartel.
drop policy if exists "station_staffing_select_scope" on station_staffing;
create policy "station_staffing_select_scope" on station_staffing
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- Escritura: la misma que la carga de personal (0027).
drop policy if exists "station_staffing_write_admin_regional_station" on station_staffing;
create policy "station_staffing_write_admin_regional_station" on station_staffing
  for all using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- Modo departamento (0107): la dotación es del módulo Cuarteles, que ese modo no abre.
drop policy if exists "station_staffing_department_only_block" on station_staffing;
create policy "station_staffing_department_only_block" on station_staffing
  as restrictive for select
  using (not is_department_only());

-- ---------------- Tareas pendientes de Inicio: lenguaje y enlace ----------------

-- get_pending_items() (última versión en 0107) avisa de un cuartel sin
-- dotación con "Falta cargar personal activo." y de uno sin móviles con
-- "Falta cargar vehículos.". Se cambia solo el texto, para que hable de
-- dotación y de móviles, y el enlace de "falta la dotación", que lleva
-- directo a la tarjeta de dotación de la ficha. Se parte de la definición que
-- está en la base (no se copia la función), así que no pisa ninguna otra
-- parte; si el texto ya está cambiado, no hace nada.
do $patch$
declare
  v_def text;
  v_new text;
begin
  if to_regprocedure('public.get_pending_items()') is null then
    return;
  end if;
  select pg_get_functiondef('public.get_pending_items()'::regprocedure) into v_def;
  v_new := replace(v_def, $a$Falta cargar personal activo.$a$, $b$Falta cargar la dotación actual del cuartel.$b$);
  v_new := replace(v_new, $a$Falta cargar vehículos.$a$, $b$Falta cargar los móviles del cuartel.$b$);
  v_new := replace(
    v_new,
    $a$'/cuarteles/' || sc.station_id::text,$a$,
    $b$case when sc.has_contact_info and not sc.has_personnel then '/cuarteles/' || sc.station_id::text || '#dotacion' else '/cuarteles/' || sc.station_id::text end,$b$
  );
  if v_new is distinct from v_def then
    execute v_new;
  end if;
end;
$patch$;
