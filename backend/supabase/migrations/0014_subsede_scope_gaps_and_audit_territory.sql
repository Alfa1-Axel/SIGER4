-- SIGER4 - Completar scope de subsede + auditoria territorial
--
-- Parte A: agrega el OR de subsede (ya presente en stations/vehicles/profiles
-- desde 0010) a attendance_summaries, intervention_summaries, documents y
-- notifications, para que un usuario con scope de subsede tenga acceso de
-- lectura consistente en todas las tablas relacionadas con los cuarteles de
-- su subsede, no solo en stations/vehicles.
--
-- Parte B: agrega contexto territorial (region_id, subsede_id, station_id) a
-- audit_logs. audit_row_change() se reescribe para resolver ese contexto por
-- tabla (directo cuando la tabla lo tiene, via join cuando no). No se hace
-- backfill de logs historicos: quedan con estas columnas en null, ya que
-- reconstruir el territorio de eventos pasados con precision no siempre es
-- posible (ej. un cuartel borrado despues del evento).
--
-- Parte C: audit_logs_select_regional pasa a filtrar por region_id en vez de
-- dar acceso a todo el sistema. informatica_r4 sigue con acceso total via
-- audit_logs_select_admin (sin cambios).
--
-- Parte D: agrega trigger de auditoria para subsedes y regions (tablas de
-- referencia que hoy son escribibles solo por admin pero no dejan rastro).

-- ============================================================
-- PARTE A: scope de subsede en attendance/intervention/documents/notifications
-- ============================================================

drop policy if exists "attendance_select_scope" on attendance_summaries;

create policy "attendance_select_scope" on attendance_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

drop policy if exists "interventions_select_scope" on intervention_summaries;

create policy "interventions_select_scope" on intervention_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

drop policy if exists "documents_select_scope" on documents;

create policy "documents_select_scope" on documents
  for select using (
    is_informatica_r4()
    or (region_id is not null and region_id in (select my_region_ids()))
    or (station_id is not null and station_id in (select my_station_ids()))
    or (station_id is not null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
  );

drop policy if exists "notifications_select_own_or_scope" on notifications;

create policy "notifications_select_own_or_scope" on notifications
  for select using (
    is_informatica_r4()
    or profile_id = current_profile_id()
    or (profile_id is null and region_id in (select my_region_ids()))
    or (profile_id is null and station_id in (select my_station_ids()))
    or (profile_id is null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
  );

-- ============================================================
-- PARTE B: contexto territorial en audit_logs
-- ============================================================

alter table audit_logs
  add column if not exists region_id uuid references regions(id) on delete set null,
  add column if not exists subsede_id uuid references subsedes(id) on delete set null,
  add column if not exists station_id uuid references stations(id) on delete set null;

comment on column audit_logs.region_id is 'Region asociada al evento, resuelta segun la tabla auditada. Null en logs anteriores a esta migracion.';
comment on column audit_logs.subsede_id is 'Subsede asociada al evento, resuelta segun la tabla auditada. Null en logs anteriores a esta migracion.';
comment on column audit_logs.station_id is 'Cuartel asociado al evento, resuelto segun la tabla auditada. Null en logs anteriores a esta migracion o cuando el evento no tiene cuartel asociado.';

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
    when 'vehicles' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'courses' then
      v_region_id := rec.region_id;
    when 'documents' then
      v_region_id := rec.region_id;
      v_station_id := rec.station_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'user_roles', 'user_scopes' then
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

-- ============================================================
-- PARTE C: filtrar audit_logs_select_regional por region
-- ============================================================

drop policy if exists "audit_logs_select_regional" on audit_logs;

create policy "audit_logs_select_regional" on audit_logs
  for select using (
    is_regional_role()
    and (region_id is null or region_id in (select my_region_ids()))
  );

comment on policy "audit_logs_select_regional" on audit_logs is 'secretario_regional/director_escuela ven solo la auditoria de su(s) region(es). Logs sin region_id resuelto (ej. historicos previos a esta migracion, o tablas sin relacion territorial) quedan visibles igual para no ocultar informacion por una limitacion de datos.';

-- ============================================================
-- PARTE D: auditoria para subsedes y regions
-- ============================================================

create trigger trg_audit_subsedes
  after insert or update or delete on subsedes
  for each row execute function audit_row_change();

create trigger trg_audit_regions
  after insert or update or delete on regions
  for each row execute function audit_row_change();
