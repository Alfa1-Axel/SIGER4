-- SIGER4 - Carpetas administrables para documentos
--
-- Permite organizar documentos en carpetas (ej. "Actas", "Circulares",
-- "Manuales técnicos") en vez de una lista plana. Cada carpeta tiene su
-- propio alcance territorial (region/subsede/station/profile), igual que
-- documents, y el mismo criterio de permisos de escritura que ya usa
-- documents_write_admin_regional_station — no se inventa una matriz nueva.
--
-- Compatibilidad: documents.folder_id es nullable. Los documentos existentes
-- sin carpeta se siguen viendo (el frontend los muestra como "Sin carpeta" /
-- "General"), no se migran a ninguna carpeta automáticamente.
--
-- Fuera de alcance de esta migración (documentado para después, no
-- implementado): papelera de 30 días / borrado definitivo diferido. El
-- borrado de una carpeta hoy es inmediato (on delete set null en
-- documents.folder_id: los documentos NO se borran, quedan sin carpeta).

create table document_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  region_id uuid references regions(id) on delete cascade,
  subsede_id uuid references subsedes(id) on delete cascade,
  station_id uuid references stations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_folders_single_scope check (
    (region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int + (profile_id is not null)::int = 1
  )
);

comment on table document_folders is 'Carpetas administrables para organizar documentos. Alcance exclusivo (region/subsede/station/profile), igual criterio que documents. is_active=false oculta la carpeta sin borrar los documentos que contiene.';
comment on column document_folders.profile_id is 'Carpeta personal de un usuario específico (ej. documentación propia), distinto de una carpeta institucional de region/subsede/station.';

create trigger trg_document_folders_updated_at
  before update on document_folders
  for each row execute function set_updated_at();

alter table documents
  add column if not exists folder_id uuid references document_folders(id) on delete set null;

comment on column documents.folder_id is 'Carpeta a la que pertenece el documento. NULL = "Sin carpeta" (documentos históricos previos a este módulo, o cargados directo sin elegir carpeta), se muestra como "General" en la UI.';

create index idx_documents_folder_id on documents(folder_id);

-- ============================================================
-- RLS
-- ============================================================

alter table document_folders enable row level security;

-- Lectura: mismo alcance que documents (región/subsede/cuartel propio, o
-- carpeta personal propia). informatica_r4 ve todo.
create policy "document_folders_select_scope" on document_folders
  for select using (
    is_informatica_r4()
    or (region_id is not null and region_id in (select my_region_ids()))
    or (station_id is not null and station_id in (select my_station_ids()))
    or (station_id is not null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
    or (subsede_id is not null and subsede_id in (select my_subsede_ids()))
    or (profile_id is not null and profile_id = current_profile_id())
  );

-- Escritura: EXACTO el mismo criterio que documents_write_admin_regional_station
-- (0027) — informatica_r4, roles regionales dentro de su región, o roles de
-- cuartel (usuario_carga_cuartel/presidente_cuartel/secretario_comision)
-- dentro de su propio cuartel. director_escuela ya está cubierto por
-- is_regional_role() (secretario_regional/director_escuela).
create policy "document_folders_write_admin_regional_station" on document_folders
  for all using (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  );

comment on policy "document_folders_write_admin_regional_station" on document_folders is 'Mismo criterio que documents_write_admin_regional_station: informatica_r4 cualquier alcance; roles regionales (secretario_regional/director_escuela) dentro de su región; roles de cuartel autorizados (usuario_carga_cuartel/presidente_cuartel/secretario_comision) solo su propio cuartel.';

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
    when 'document_folders' then
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

create trigger trg_audit_document_folders
  after insert or update or delete on document_folders
  for each row execute function audit_row_change();
