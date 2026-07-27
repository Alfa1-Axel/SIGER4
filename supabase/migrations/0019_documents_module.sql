-- SIGER4 - Modulo de Documentos: campos faltantes, alcance completo,
-- versionado simple y Supabase Storage
--
-- documents ya existia (schema + RLS) pero le faltaban: descripcion,
-- subsede_id (alcance directo a subsede, mismo gap que notifications antes
-- de 0015) y profile_id (alcance a un usuario especifico, ademas de
-- region/cuartel). Se agrega tambien una tabla document_versions minima para
-- dejar preparado un historial de versiones sin sobre-diseñar (cada nueva
-- version simplemente agrega una fila con su propio storage_path).

alter table documents
  add column if not exists description text,
  add column if not exists subsede_id uuid references subsedes(id) on delete cascade,
  add column if not exists profile_id uuid references profiles(id) on delete cascade;

comment on column documents.description is 'Descripcion libre del documento.';
comment on column documents.subsede_id is 'Subsede destino cuando el documento es para toda una subsede (no un cuartel especifico ni toda la region).';
comment on column documents.profile_id is 'Perfil destino cuando el documento es para un usuario especifico. Null en documentos institucionales de alcance region/subsede/cuartel.';

-- ---------------- Historial de versiones ----------------

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  storage_path text not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

comment on table document_versions is 'Historial de versiones de un documento: cada fila es un archivo subido previamente, ordenado por created_at. La version vigente es documents.storage_path.';

alter table document_versions enable row level security;

-- Mismo criterio de lectura/escritura que el documento al que pertenecen.
create policy "document_versions_select_scope" on document_versions
  for select using (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
      and (
        is_informatica_r4()
        or (d.region_id is not null and d.region_id in (select my_region_ids()))
        or (d.station_id is not null and d.station_id in (select my_station_ids()))
        or (d.station_id is not null and d.station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
        or (d.subsede_id is not null and d.subsede_id in (select my_subsede_ids()))
        or (d.profile_id is not null and d.profile_id = current_profile_id())
      )
    )
  );

create policy "document_versions_write_admin_regional_station" on document_versions
  for insert with check (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
      and (
        is_informatica_r4()
        or is_regional_role()
        or (d.station_id in (select my_station_ids()) and (
          has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
        ))
      )
    )
  );

-- ---------------- RLS: documents (alcance completo) ----------------

drop policy if exists "documents_select_scope" on documents;

create policy "documents_select_scope" on documents
  for select using (
    is_informatica_r4()
    or (region_id is not null and region_id in (select my_region_ids()))
    or (station_id is not null and station_id in (select my_station_ids()))
    or (station_id is not null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
    or (subsede_id is not null and subsede_id in (select my_subsede_ids()))
    or (profile_id is not null and profile_id = current_profile_id())
  );

-- ---------------- Auditoria: agregar contexto de documents ----------------
-- documents ya tenia trigger de auditoria (0004), pero audit_row_change()
-- todavia resuelve su contexto por la rama generica 'documents' ya existente
-- (region_id/station_id/subsede via join). Se agrega subsede_id directo,
-- ya que ahora documents puede tenerlo seteado sin pasar por station_id.

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
    when 'vehicles' then
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

-- Auditoria para document_versions (mismo patron que course_stations: sin
-- columna id compuesta no aplica aca porque document_versions SI tiene id
-- propio, asi que usa audit_row_change() generico, sin rama especial: cae en
-- el "else" y queda sin contexto territorial directo, lo cual es aceptable
-- ya que la version en si no tiene territorio propio -- el documento padre
-- ya queda auditado con su contexto correcto).

create trigger trg_audit_document_versions
  after insert or update or delete on document_versions
  for each row execute function audit_row_change();

-- ============================================================
-- SUPABASE STORAGE: bucket de documentos
-- ============================================================
-- A diferencia de station-media/avatars, los documentos NO son publicos: la
-- lectura debe respetar el mismo alcance que la tabla documents (regional,
-- subsede, cuartel o usuario especifico), no un link publico abierto.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Lectura: el primer segmento del path es el document_id (convencion
-- "<document_id>/archivo.pdf"), se valida contra el scope de esa fila en
-- documents.
create policy "documents_storage_select_scope" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
      and (
        is_informatica_r4()
        or (d.region_id is not null and d.region_id in (select my_region_ids()))
        or (d.station_id is not null and d.station_id in (select my_station_ids()))
        or (d.station_id is not null and d.station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
        or (d.subsede_id is not null and d.subsede_id in (select my_subsede_ids()))
        or (d.profile_id is not null and d.profile_id = current_profile_id())
      )
    )
  );

-- El flujo de alta es: 1) crear la fila en "documents" (sin archivo todavia,
-- storage_path placeholder), 2) subir el archivo usando ese id real como
-- carpeta, 3) actualizar storage_path con la URL/definitiva. Por eso esta
-- policy siempre puede validar contra una fila ya existente en documents.
create policy "documents_storage_write_admin_regional_station" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
      and (
        is_informatica_r4()
        or is_regional_role()
        or (d.station_id in (select my_station_ids()) and (
          has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
        ))
      )
    )
  );

create policy "documents_storage_delete_admin_regional_station" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      is_informatica_r4()
      or is_regional_role()
      or exists (
        select 1 from documents d
        where d.id::text = (storage.foldername(name))[1]
        and d.station_id in (select my_station_ids())
        and (has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision'))
      )
    )
  );
