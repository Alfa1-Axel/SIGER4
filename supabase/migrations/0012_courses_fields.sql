-- SIGER4 - Detalle ampliado de cursos: horas, dias, asistentes, disertantes,
-- y cuarteles participantes (relacion muchos-a-muchos).
--
-- Decisiones de producto (confirmadas con el usuario):
--  - days: cantidad de dias como entero simple, no un listado de fechas
--    (no existe UI/infraestructura de calendario en la app para eso).
--  - speakers: texto libre separado por comas, no una tabla de "disertantes"
--    normalizada (pueden no ser usuarios registrados del sistema).
--  - attendees_count: campo NUEVO y distinto de enrolled_count. enrolled_count
--    ya significaba "inscriptos" (se mantiene tal cual, no se renombra para no
--    romper semantica/UI existente). attendees_count = asistencia real
--    registrada una vez finalizada la actividad.
--  - category ya cubre "tipo de actividad": no se agrega columna nueva.

alter table courses
  add column if not exists hours integer,
  add column if not exists days integer,
  add column if not exists attendees_count integer,
  add column if not exists speakers text;

comment on column courses.hours is 'Cantidad total de horas catedra del curso/actividad.';
comment on column courses.days is 'Cantidad de dias que dura el curso/actividad (numero simple, no fechas puntuales).';
comment on column courses.attendees_count is 'Cantidad de asistentes reales (asistencia registrada al finalizar), distinto de enrolled_count (inscriptos).';
comment on column courses.speakers is 'Disertantes del curso/actividad, texto libre separado por comas. No referencia profiles: pueden ser personas externas al sistema.';

-- ---------------- Cuarteles participantes (muchos-a-muchos) ----------------

create table if not exists course_stations (
  course_id uuid not null references courses(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, station_id)
);

comment on table course_stations is 'Cuarteles que participan de un curso/actividad de la Escuela Regional (relacion muchos-a-muchos).';

alter table course_stations enable row level security;

create policy "course_stations_select_authenticated" on course_stations
  for select using (auth.role() = 'authenticated');

create policy "course_stations_write_admin_escuela" on course_stations
  for all using (is_informatica_r4() or is_escuela_role())
  with check (is_informatica_r4() or is_escuela_role());

-- ---------------- Auditoria ----------------
-- course_stations tiene clave primaria compuesta (course_id, station_id), sin
-- columna id, por eso usa una variante de la funcion de auditoria general.

create or replace function audit_course_stations_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := current_profile_id();

  if (tg_op = 'INSERT') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'insert', tg_table_name, new.course_id::text || ':' || new.station_id::text, null, to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'delete', tg_table_name, old.course_id::text || ':' || old.station_id::text, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_course_stations_change() is 'Version de audit_row_change() para course_stations, cuya clave primaria es compuesta (course_id, station_id) y no tiene columna id.';

create trigger trg_audit_course_stations
  after insert or delete on course_stations
  for each row execute function audit_course_stations_change();
