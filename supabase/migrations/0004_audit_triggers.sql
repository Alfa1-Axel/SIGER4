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
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
  rec record;
begin
  actor := current_profile_id();
  rec := coalesce(new, old);

  -- Resolver contexto territorial segun la tabla auditada. Cada tabla tiene
  -- una relacion distinta con region/subsede/cuartel, por eso el case: no hay
  -- una forma generica de inferir esto sin saber la forma de cada tabla.
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
    else
      -- Tablas sin relacion territorial directa conocida (ej. otras futuras):
      -- se deja null en las 3 columnas en vez de asumir una forma incorrecta.
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

create trigger trg_audit_subsedes
  after insert or update or delete on subsedes
  for each row execute function audit_row_change();

create trigger trg_audit_regions
  after insert or update or delete on regions
  for each row execute function audit_row_change();

create trigger trg_audit_notifications
  after insert or update or delete on notifications
  for each row execute function audit_row_change();

create trigger trg_audit_attendance_summaries
  after insert or update or delete on attendance_summaries
  for each row execute function audit_row_change();

create trigger trg_audit_intervention_summaries
  after insert or update or delete on intervention_summaries
  for each row execute function audit_row_change();

create trigger trg_audit_document_versions
  after insert or update or delete on document_versions
  for each row execute function audit_row_change();

create trigger trg_audit_personnel
  after insert or update or delete on personnel
  for each row execute function audit_row_change();
