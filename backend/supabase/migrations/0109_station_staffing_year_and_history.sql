-- SIGER4 - Efectivos del cuartel: año de referencia, historial y base de Asistencia
--
-- Sigue a 0108 (station_staffing: efectivos por categoría, una fila por
-- cuartel). Esta migración no crea otra fuente de verdad: agrega lo que faltaba
-- para usar los efectivos en reportes y en Asistencia.
--
--   1. AÑO DE REFERENCIA. Los efectivos cambian de forma anual o eventual:
--      cada carga lleva el año al que corresponde (por defecto, el actual).
--   2. HISTORIAL. Cada vez que cambian las cantidades (o el año) la base
--      guarda una foto en station_staffing_history. Así un reporte de un
--      período anterior puede decir con cuántos efectivos contaba el cuartel
--      en ese momento, y no con los de hoy. La escribe solo la base (un
--      disparador): ningún rol puede insertar, modificar ni borrar historial.
--      Los cuarteles que ya habían cargado sus efectivos (0108) reciben su
--      primera foto con la fecha de su última actualización.
--   3. ASISTENCIA. El resumen de asistencia toma como "efectivos de
--      referencia" el total de los efectivos cargados del cuartel (antes tomaba
--      stations.personnel_count, que sin efectivos cargados cae al registro
--      nominal de personal). Sin efectivos cargados queda vacío, y la pantalla
--      pide cargarlos primero. Los resúmenes ya guardados no se tocan.
--   4. TAREAS PENDIENTES. get_pending_items() pide "Cargar los efectivos del
--      cuartel" y lleva a su tarjeta (#efectivos).
--
-- Permisos: no cambian. Quien carga los efectivos es quien ya los cargaba
-- (0108); el historial se lee con el mismo alcance que la tabla y no se lee en
-- modo departamento (0107).
set client_encoding = 'UTF8';

-- ---------------- 1. Año de referencia ----------------

alter table station_staffing add column if not exists reference_year smallint;

update station_staffing
set reference_year = extract(year from updated_at)::smallint
where reference_year is null;

alter table station_staffing alter column reference_year set default (extract(year from now())::smallint);
alter table station_staffing alter column reference_year set not null;

alter table station_staffing drop constraint if exists station_staffing_year_range;
alter table station_staffing
  add constraint station_staffing_year_range check (reference_year between 2000 and 2100);

comment on column station_staffing.reference_year is 'Año al que corresponden los efectivos cargados. Por defecto, el año actual.';

-- ---------------- 2. Historial ----------------

create table if not exists station_staffing_history (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  reference_year smallint not null,
  aspirantes_menores integer not null,
  aspirantes_mayores integer not null,
  bomberos_nivel_1 integer not null,
  bomberos_nivel_2 integer not null,
  bomberos_nivel_3 integer not null,
  bomberos_nivel_4 integer not null,
  personal_reserva integer not null,
  cuerpo_auxiliar integer not null,
  total integer not null,
  recorded_by_profile_id uuid references profiles(id) on delete set null,
  recorded_by_name text,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_station_staffing_history_station on station_staffing_history (station_id, recorded_at desc);

comment on table station_staffing_history is 'Foto de los efectivos de un cuartel cada vez que cambian (cantidades o año). La escribe solo la base; sirve para reportes de períodos anteriores.';
comment on column station_staffing_history.recorded_at is 'Cuándo se guardó esa foto: los efectivos valen desde ese momento hasta la foto siguiente.';

create or replace function station_staffing_record_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.reference_year is distinct from old.reference_year
     or new.aspirantes_menores is distinct from old.aspirantes_menores
     or new.aspirantes_mayores is distinct from old.aspirantes_mayores
     or new.bomberos_nivel_1 is distinct from old.bomberos_nivel_1
     or new.bomberos_nivel_2 is distinct from old.bomberos_nivel_2
     or new.bomberos_nivel_3 is distinct from old.bomberos_nivel_3
     or new.bomberos_nivel_4 is distinct from old.bomberos_nivel_4
     or new.personal_reserva is distinct from old.personal_reserva
     or new.cuerpo_auxiliar is distinct from old.cuerpo_auxiliar then
    insert into station_staffing_history (
      station_id, reference_year, aspirantes_menores, aspirantes_mayores,
      bomberos_nivel_1, bomberos_nivel_2, bomberos_nivel_3, bomberos_nivel_4,
      personal_reserva, cuerpo_auxiliar, total,
      recorded_by_profile_id, recorded_by_name, recorded_at
    ) values (
      new.station_id, new.reference_year, new.aspirantes_menores, new.aspirantes_mayores,
      new.bomberos_nivel_1, new.bomberos_nivel_2, new.bomberos_nivel_3, new.bomberos_nivel_4,
      new.personal_reserva, new.cuerpo_auxiliar, new.total,
      new.updated_by_profile_id, new.updated_by_name, new.updated_at
    );
  end if;
  return new;
end;
$$;

revoke all on function station_staffing_record_history() from public;
revoke all on function station_staffing_record_history() from anon;
revoke all on function station_staffing_record_history() from authenticated;

drop trigger if exists trg_station_staffing_history on station_staffing;
create trigger trg_station_staffing_history
  after insert or update on station_staffing
  for each row execute function station_staffing_record_history();

-- Primera foto de los cuarteles que ya habían cargado sus efectivos (0108).
insert into station_staffing_history (
  station_id, reference_year, aspirantes_menores, aspirantes_mayores,
  bomberos_nivel_1, bomberos_nivel_2, bomberos_nivel_3, bomberos_nivel_4,
  personal_reserva, cuerpo_auxiliar, total,
  recorded_by_profile_id, recorded_by_name, recorded_at
)
select
  s.station_id, s.reference_year, s.aspirantes_menores, s.aspirantes_mayores,
  s.bomberos_nivel_1, s.bomberos_nivel_2, s.bomberos_nivel_3, s.bomberos_nivel_4,
  s.personal_reserva, s.cuerpo_auxiliar, s.total,
  s.updated_by_profile_id, s.updated_by_name, s.updated_at
from station_staffing s
where not exists (select 1 from station_staffing_history h where h.station_id = s.station_id);

-- Permisos (RLS): se lee con el alcance de station_staffing; no se escribe desde la aplicación.
alter table station_staffing_history enable row level security;

drop policy if exists "station_staffing_history_select_scope" on station_staffing_history;
create policy "station_staffing_history_select_scope" on station_staffing_history
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- Modo departamento (0107): los efectivos son del módulo Cuarteles, que ese modo no abre.
drop policy if exists "station_staffing_history_department_only_block" on station_staffing_history;
create policy "station_staffing_history_department_only_block" on station_staffing_history
  as restrictive for select
  using (not is_department_only());

revoke all on station_staffing_history from anon;
revoke insert, update, delete, truncate on station_staffing_history from authenticated;
grant select on station_staffing_history to authenticated;

-- ---------------- 3. Asistencia: efectivos de referencia ----------------

-- attendance_summaries_before_write() (0104) completa total_members. Se toma el
-- total de los efectivos cargados (station_staffing); sin efectivos queda
-- vacío. Se parte de la definición que está en la base, así que no pisa
-- ninguna otra validación; si ya está cambiada, no hace nada.
do $patch$
declare
  v_def text;
  v_old text := $a$select nullif(s.personnel_count, 0) into new.total_members from stations s where s.id = new.station_id;$a$;
  v_new text := $b$select nullif(sf.total, 0) into new.total_members from station_staffing sf where sf.station_id = new.station_id;$b$;
begin
  if to_regprocedure('public.attendance_summaries_before_write()') is null then
    return;
  end if;
  select pg_get_functiondef('public.attendance_summaries_before_write()'::regprocedure) into v_def;
  if position(v_new in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'attendance_summaries_before_write() no tiene el texto esperado: revisar antes de seguir.';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$patch$;

comment on column attendance_summaries.total_members is 'Efectivos de referencia: el total de los efectivos cargados del cuartel (station_staffing) al dar de alta el resumen. La completa la base; null si el cuartel no tenía efectivos cargados. Es un dato histórico: no cambia si después cambian los efectivos. En los resúmenes anteriores a 0109 puede venir del registro de personal, y antes de 0104 es el valor que se cargaba a mano.';

-- ---------------- 4. Tareas pendientes: efectivos ----------------

-- "Falta cargar la dotación actual del cuartel." (0108) pasa a hablar de
-- efectivos, y el enlace lleva a la tarjeta #efectivos.
do $patch$
declare
  v_def text;
  v_new text;
begin
  if to_regprocedure('public.get_pending_items()') is null then
    return;
  end if;
  select pg_get_functiondef('public.get_pending_items()'::regprocedure) into v_def;
  v_new := replace(v_def, $a$Falta cargar la dotación actual del cuartel.$a$, $b$Falta cargar los efectivos del cuartel.$b$);
  v_new := replace(v_new, $a$'#dotacion'$a$, $b$'#efectivos'$b$);
  if v_new is distinct from v_def then
    execute v_new;
  end if;
end;
$patch$;

comment on table station_staffing is 'Efectivos del cuartel por categorías (una fila por cuartel, editable cuando cambian). Su total alimenta stations.personnel_count. Cada cambio queda en station_staffing_history.';
