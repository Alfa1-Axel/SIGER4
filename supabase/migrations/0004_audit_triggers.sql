-- SIGER4 - Triggers de auditoria automatica
-- Registra automaticamente inserts/updates/deletes de tablas sensibles en audit_logs.

create or replace function audit_row_change()
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
    values (actor, 'insert', tg_table_name, new.id::text, null, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'delete', tg_table_name, old.id::text, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas.';

-- Variante para tablas con clave primaria compuesta (sin columna id), como
-- course_stations. record_id se arma concatenando las columnas de la PK.
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

create trigger trg_audit_stations
  after insert or update or delete on stations
  for each row execute function audit_row_change();

create trigger trg_audit_profiles
  after insert or update or delete on profiles
  for each row execute function audit_row_change();

create trigger trg_audit_user_roles
  after insert or update or delete on user_roles
  for each row execute function audit_row_change();

create trigger trg_audit_courses
  after insert or update or delete on courses
  for each row execute function audit_row_change();

create trigger trg_audit_vehicles
  after insert or update or delete on vehicles
  for each row execute function audit_row_change();

create trigger trg_audit_documents
  after insert or update or delete on documents
  for each row execute function audit_row_change();

create trigger trg_audit_user_scopes
  after insert or update or delete on user_scopes
  for each row execute function audit_row_change();

create trigger trg_audit_course_stations
  after insert or delete on course_stations
  for each row execute function audit_course_stations_change();
