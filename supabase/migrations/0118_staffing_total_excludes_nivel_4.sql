-- SIGER4 - Efectivos del cuartel: Bomberos Nivel 4 se carga y se ve, pero no suma al total (v1.16.0)
--
-- REQUISITO: correr antes 0108 y 0109 (efectivos, año e historial). Se corre sola.
--
-- Criterio nuevo (institucional): el "Total de efectivos" que se usa como referencia operativa NO
-- incluye a los Bomberos Nivel 4. La categoría sigue existiendo, se sigue cargando, se sigue
-- viendo (ficha, historial y reportes) y sus datos históricos no se tocan; solo deja de integrar
-- el total.
--
--   Suman:    aspirantes menores, aspirantes mayores, Bomberos Nivel 1, 2 y 3, reserva y cuerpo
--             auxiliar (el criterio actual de estas tres últimas no cambia).
--   No suma:  Bomberos Nivel 4.
--
-- Causa del criterio anterior: station_staffing.total (0108) era la suma de las ocho categorías
-- y de ahí salían, copiados, todos los demás totales:
--   - stations.personnel_count         (station_dotation_total(), 0108)  -> tarjetas, listado, Inicio.
--   - station_staffing_history.total   (disparador de 0109, un número guardado en cada foto).
--   - attendance_summaries.total_members (0109: "efectivos de referencia" al dar de alta el resumen).
-- Los reportes y la pantalla leen esos campos; no suman por su cuenta, así que corregir la base
-- corrige todo. Esta migración:
--
--   1. station_staffing.total pasa a sumar sin Nivel 4 (columna calculada, nadie la carga).
--   2. station_staffing_history.total pasa a ser también una columna CALCULADA a partir de las
--      categorías guardadas en cada foto: el historial conserva el Nivel 4 de cada momento y el
--      total siempre responde a la regla vigente (antes era un número copiado). El disparador que
--      escribe la foto deja de enviar el total.
--   3. stations.personnel_count se vuelve a calcular para los cuarteles que cargaron efectivos
--      (los que no, siguen con el personal activo del registro nominal, como hasta ahora).
--   4. Asistencia: los resúmenes ya guardados conservaron como "efectivos de referencia" el total
--      de ese momento, que incluía Nivel 4. Se recalculan SOLO los que coinciden exactamente con
--      la foto de efectivos vigente cuando se dieron de alta (total anterior = total nuevo + Nivel 4
--      de esa foto); así quedan con la misma regla que el resto. Los que no coinciden (venían del
--      registro de personal, de antes de 0109 o de una carga manual) no se tocan. No cambia
--      ningún otro dato del resumen ni cuenta como edición (no sube la versión ni la fecha de
--      actualización); la auditoría registra cada cambio.
--
-- Es idempotente: se puede volver a correr (las columnas ya calculadas con la regla nueva no se
-- tocan y los resúmenes ya recalculados dejan de coincidir). No borra ni modifica las cantidades
-- por categoría ni el historial: solo cambia cómo se calculan los totales.
set client_encoding = 'UTF8';

do $$
begin
  if to_regclass('public.station_staffing') is null or to_regclass('public.station_staffing_history') is null then
    raise exception 'Falta correr 0108 y 0109 (efectivos del cuartel) antes de 0118.';
  end if;
end;
$$;

-- ============================================================
-- 1. station_staffing.total: sin Nivel 4
-- ============================================================

do $$
declare
  v_expr text;
begin
  select pg_get_expr(d.adbin, d.adrelid)
  into v_expr
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.station_staffing'::regclass and a.attname = 'total' and a.attgenerated <> '';

  -- Si ya suma con la regla nueva (se volvió a correr), no hay nada que hacer.
  if v_expr is null or position('bomberos_nivel_4' in v_expr) > 0 then
    alter table station_staffing drop column if exists total;
    alter table station_staffing add column total integer generated always as (
      aspirantes_menores + aspirantes_mayores + bomberos_nivel_1 + bomberos_nivel_2 +
      bomberos_nivel_3 + personal_reserva + cuerpo_auxiliar
    ) stored;
  end if;
end;
$$;

comment on column station_staffing.total is 'Total de efectivos: aspirantes menores y mayores, Bomberos Nivel 1, 2 y 3, reserva y cuerpo auxiliar. NO incluye a los Bomberos Nivel 4, que se cargan y se ven pero no suman. La calcula la base; no se carga.';

-- ============================================================
-- 2. station_staffing_history.total: calculado, con la misma regla
-- ============================================================

-- El disparador ya no envía el total: lo calcula la columna.
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
      personal_reserva, cuerpo_auxiliar,
      recorded_by_profile_id, recorded_by_name, recorded_at
    ) values (
      new.station_id, new.reference_year, new.aspirantes_menores, new.aspirantes_mayores,
      new.bomberos_nivel_1, new.bomberos_nivel_2, new.bomberos_nivel_3, new.bomberos_nivel_4,
      new.personal_reserva, new.cuerpo_auxiliar,
      new.updated_by_profile_id, new.updated_by_name, new.updated_at
    );
  end if;
  return new;
end;
$$;

revoke all on function station_staffing_record_history() from public, anon, authenticated;

do $$
declare
  v_generated boolean;
  v_expr text;
begin
  select a.attgenerated <> '', pg_get_expr(d.adbin, d.adrelid)
  into v_generated, v_expr
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.station_staffing_history'::regclass and a.attname = 'total';

  if not coalesce(v_generated, false) or position('bomberos_nivel_4' in coalesce(v_expr, '')) > 0 then
    alter table station_staffing_history drop column if exists total;
    alter table station_staffing_history add column total integer generated always as (
      aspirantes_menores + aspirantes_mayores + bomberos_nivel_1 + bomberos_nivel_2 +
      bomberos_nivel_3 + personal_reserva + cuerpo_auxiliar
    ) stored;
  end if;
end;
$$;

comment on column station_staffing_history.total is 'Total de efectivos de esa foto con la regla vigente (sin Bomberos Nivel 4, que se conserva en su columna). Se calcula a partir de las categorías guardadas: cambia solo si cambia la regla, nunca por un dato cargado a mano.';
comment on column station_staffing_history.bomberos_nivel_4 is 'Bomberos Nivel 4 de esa foto. Se informa pero no suma al total.';
comment on column station_staffing.bomberos_nivel_4 is 'Bomberos Nivel 4: se carga y se ve, pero no integra el total de efectivos.';

-- ============================================================
-- 3. stations.personnel_count (dotación): se vuelve a calcular
-- ============================================================

-- Solo los cuarteles que cargaron efectivos: el resto sigue con el registro nominal.
update stations s
set personnel_count = station_dotation_total(s.id)
where exists (select 1 from station_staffing sf where sf.station_id = s.id)
  and s.personnel_count is distinct from station_dotation_total(s.id);

comment on function station_dotation_total(uuid) is 'Dotación del cuartel: el total de efectivos cargados (sin Bomberos Nivel 4) si cargó sus efectivos; si no, el personal activo del registro nominal.';
comment on column stations.personnel_count is 'Dotación del cuartel. La completa la base: el total de efectivos de station_staffing (sin Bomberos Nivel 4) si el cuartel cargó sus efectivos; si no, el personal activo del registro nominal (personnel).';

-- ============================================================
-- 4. Asistencia: efectivos de referencia de los resúmenes ya guardados
-- ============================================================

do $$
declare
  v_trigger text;
  v_disabled text[] := array[]::text[];
  v_changed integer;
begin
  -- Se suspenden solo los disparadores que harían del recálculo una "edición" (la base
  -- conserva total_members en cada edición, y la versión y la fecha de actualización
  -- cuentan cambios de contenido). La auditoría sigue activa.
  foreach v_trigger in array array['trg_attendance_summaries_before_write', 'trg_zz_row_version', 'trg_attendance_summaries_updated_at'] loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.attendance_summaries'::regclass and tgname = v_trigger and not tgisinternal) then
      execute format('alter table attendance_summaries disable trigger %I', v_trigger);
      v_disabled := v_disabled || v_trigger;
    end if;
  end loop;

  with vigente as (
    select a.id as attendance_id, h.total as nuevo_total
    from attendance_summaries a
    join lateral (
      select hh.total, hh.bomberos_nivel_4
      from station_staffing_history hh
      where hh.station_id = a.station_id and hh.recorded_at <= a.created_at
      order by hh.recorded_at desc, hh.id
      limit 1
    ) h on true
    where a.total_members is not null
      and h.bomberos_nivel_4 > 0
      and a.total_members = h.total + h.bomberos_nivel_4
  )
  update attendance_summaries a
  set total_members = nullif(v.nuevo_total, 0)
  from vigente v
  where a.id = v.attendance_id;
  get diagnostics v_changed = row_count;

  foreach v_trigger in array v_disabled loop
    execute format('alter table attendance_summaries enable trigger %I', v_trigger);
  end loop;

  raise notice '0118: % resumen(es) de asistencia recalculados con la regla nueva (los demás conservan su valor).', v_changed;
end;
$$;

comment on column attendance_summaries.total_members is 'Efectivos de referencia: el total de efectivos cargados del cuartel (station_staffing, sin Bomberos Nivel 4) al dar de alta el resumen. La completa la base; null si el cuartel no tenía efectivos cargados. Es un dato histórico: no cambia si después cambian los efectivos. En los resúmenes anteriores a 0118 que coincidían con la foto de efectivos de ese momento se recalculó sin Nivel 4; en los anteriores a 0109 puede venir del registro de personal, y antes de 0104 es el valor que se cargaba a mano.';

comment on table station_staffing is 'Efectivos del cuartel por categorías (una fila por cuartel, editable cuando cambian). Su total (sin Bomberos Nivel 4) alimenta stations.personnel_count. Cada cambio queda en station_staffing_history.';
