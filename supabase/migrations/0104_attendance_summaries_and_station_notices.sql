-- SIGER4 - Resúmenes de asistencia y avisos automáticos de cuartel
--
-- Error que se veía al guardar un resumen de asistencia ("El valor ingresado
-- no es válido para el estado actual del registro"):
--   notify_attendance_created() creaba el aviso con region_id, subsede_id y
--   station_id a la vez. Desde 0087, notifications_scope_not_ambiguous exige
--   exactamente un alcance, así que el aviso violaba el check (23514) y la
--   base rechazaba todo el alta del resumen, en el celular y en la
--   computadora. El mismo defecto tenían los avisos de:
--     - resumen de intervenciones (notify_intervention_created),
--     - cambio de estado del cuartel (notify_station_status_change),
--     - cambio de estado de un integrante (notify_personnel_status_change),
--     - cambio de estado de un vehículo (notify_vehicle_status_change),
--   que también fallaban desde 0087.
--
-- Esta migración:
--   1. Rehace esos cinco avisos con un solo alcance: el cuartel. Es el mismo
--      destino que ya elegía el envío de push (prioridad perfil > cuartel >
--      subsede > Regional, 0087). Suman enlace al cuartel (link_path, 0102).
--   2. Resumen de asistencia:
--      - "Total de miembros" deja de cargarse a mano: la base guarda, al dar
--        de alta el resumen, la dotación activa del cuartel
--        (stations.personnel_count, que ya cuenta el personal en estado
--        "activo"). Si el cuartel no tiene personal cargado queda vacío, en
--        lugar de un 0 que no es real.
--      - "Promedio de presentes" deja de pedirse: no hay asistencia diaria
--        por persona para calcularlo. Los resúmenes viejos conservan el valor
--        que se cargó a mano.
--      - Observaciones opcionales.
--      - Mensajes claros para tasa fuera de 0-100, fechas invertidas, período
--        que empieza en el futuro y período superpuesto con otro resumen del
--        mismo cuartel.
--   No se borran ni se modifican datos históricos. RLS sin cambios.
--
-- Requiere 0102. Se puede volver a correr.

set client_encoding = 'UTF8';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'link_path'
  ) then
    raise exception 'Falta la migración 0102 (notifications.link_path). Correla antes que esta.';
  end if;
end $$;

-- ============================================================
-- 1. Avisos automáticos de cuartel con un solo alcance
-- ============================================================

create or replace function notify_attendance_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station_name text;
begin
  select name into v_station_name from stations where id = new.station_id;
  insert into notifications (station_id, type, title, body, link_path)
  values (
    new.station_id,
    'estadisticas_nuevas',
    'Asistencia cargada: ' || v_station_name,
    'Se cargó el resumen de asistencia del ' || to_char(new.period_start, 'DD/MM/YYYY') || ' al ' || to_char(new.period_end, 'DD/MM/YYYY') || '.',
    '/cuarteles/' || new.station_id::text
  );
  return new;
end;
$$;

create or replace function notify_intervention_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station_name text;
begin
  select name into v_station_name from stations where id = new.station_id;
  insert into notifications (station_id, type, title, body, link_path)
  values (
    new.station_id,
    'estadisticas_nuevas',
    'Intervención cargada: ' || v_station_name,
    'Se cargó un resumen de intervenciones (' || new.category || ') del ' || to_char(new.period_start, 'DD/MM/YYYY') || ' al ' || to_char(new.period_end, 'DD/MM/YYYY') || '.',
    '/cuarteles/' || new.station_id::text
  );
  return new;
end;
$$;

create or replace function notify_personnel_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into notifications (station_id, type, title, body, link_path)
    values (
      new.station_id,
      'cambio_estado',
      'Cambio de estado: ' || new.first_name || ' ' || new.last_name,
      'Un integrante de la dotación pasó a estado "' || new.status || '".',
      '/cuarteles/' || new.station_id::text
    );
  end if;
  return new;
end;
$$;

create or replace function notify_station_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into notifications (station_id, type, title, body, link_path)
    values (
      new.id,
      'cambio_estado',
      'Cambio de estado: ' || new.name,
      'El cuartel ' || new.name || ' pasó a estado "' || new.status || '".',
      '/cuarteles/' || new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function notify_vehicle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into notifications (station_id, type, title, body, link_path)
    values (
      new.station_id,
      'cambio_estado',
      'Cambio de estado: vehículo ' || new.internal_code,
      'El vehículo ' || new.internal_code || ' pasó a estado "' || new.status || '".',
      '/cuarteles/' || new.station_id::text
    );
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. Resumen de asistencia
-- ============================================================

alter table attendance_summaries alter column total_members drop not null;
alter table attendance_summaries alter column present_average drop not null;
alter table attendance_summaries add column if not exists observations text;

alter table attendance_summaries drop constraint if exists attendance_observations_length;
alter table attendance_summaries
  add constraint attendance_observations_length check (observations is null or char_length(observations) <= 1000);

comment on column attendance_summaries.total_members is 'Dotación activa del cuartel al dar de alta el resumen (stations.personnel_count: personal en estado activo). La completa la base; null si el cuartel no tenía personal cargado. En los resúmenes anteriores a 0104 es el valor que se cargaba a mano.';
comment on column attendance_summaries.present_average is 'Solo resúmenes anteriores a 0104: se cargaba a mano. Ya no se pide ni se calcula (no hay asistencia diaria por persona).';
comment on column attendance_summaries.observations is 'Observaciones opcionales del resumen (hasta 1000 caracteres).';

-- Validaciones con mensajes para la pantalla (P0001 se muestra tal cual) y
-- datos que completa la base. SECURITY DEFINER para ver todos los resúmenes
-- del cuartel al buscar superposiciones (la RLS ya decidió si puede escribir).
create or replace function attendance_summaries_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overlap record;
  v_period_changed boolean;
begin
  if new.attendance_rate is null or new.attendance_rate < 0 or new.attendance_rate > 100 then
    raise exception 'La tasa de asistencia tiene que estar entre 0 y 100.' using errcode = 'P0001';
  end if;
  if new.period_start is null or new.period_end is null then
    raise exception 'Completá el inicio y el fin del período.' using errcode = 'P0001';
  end if;
  if new.period_end < new.period_start then
    raise exception 'La fecha de fin tiene que ser igual o posterior a la de inicio.' using errcode = 'P0001';
  end if;

  v_period_changed := tg_op = 'INSERT'
    or new.station_id is distinct from old.station_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end;

  if v_period_changed then
    if new.period_start > current_date then
      raise exception 'El período no puede empezar en el futuro.' using errcode = 'P0001';
    end if;

    select a.period_start, a.period_end into v_overlap
    from attendance_summaries a
    where a.station_id = new.station_id
      and a.id is distinct from new.id
      and daterange(a.period_start, a.period_end, '[]') && daterange(new.period_start, new.period_end, '[]')
    order by a.period_start
    limit 1;
    if found then
      raise exception 'Ya hay un resumen de asistencia de este cuartel del % al %, que se superpone con este período. Editá ese resumen o elegí otras fechas.',
        to_char(v_overlap.period_start, 'DD/MM/YYYY'), to_char(v_overlap.period_end, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Dotación activa del cuartel en el momento del alta; nunca un valor a mano.
    select nullif(s.personnel_count, 0) into new.total_members from stations s where s.id = new.station_id;
    new.present_average := null;
  else
    -- En una edición se conservan los datos que completó la base (o los
    -- históricos); si cambia el cuartel, se toma la dotación del nuevo.
    if new.station_id is distinct from old.station_id then
      select nullif(s.personnel_count, 0) into new.total_members from stations s where s.id = new.station_id;
    else
      new.total_members := old.total_members;
    end if;
    new.present_average := old.present_average;
  end if;

  new.observations := nullif(btrim(coalesce(new.observations, '')), '');
  return new;
end;
$$;

revoke all on function attendance_summaries_before_write() from public;
revoke all on function attendance_summaries_before_write() from anon;
revoke all on function attendance_summaries_before_write() from authenticated;

drop trigger if exists trg_attendance_summaries_before_write on attendance_summaries;
create trigger trg_attendance_summaries_before_write
  before insert or update on attendance_summaries
  for each row execute function attendance_summaries_before_write();
