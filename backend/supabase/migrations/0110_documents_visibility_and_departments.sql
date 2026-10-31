-- SIGER4 - Documentos: visibilidad por documento y espacio de cada departamento
--
-- Hasta 0109 un documento solo lo veía quien estuviera dentro de su alcance
-- (Regional, subsede, cuartel o usuario específico) y no existía forma de
-- publicar algo "para todos": un documento sin alcance no lo veía nadie salvo
-- Informática, y uno con alcance Regional solo lo veía quien tuviera esa
-- Regional asignada. Esta migración agrega, sobre la misma tabla (sin tablas
-- nuevas ni segunda fuente de verdad):
--
--   1. VISIBILIDAD por documento (documents.visibility):
--        'alcance'     (por defecto) lo ve quien está dentro del alcance del
--                      documento, como siempre. No cambia nada de lo existente.
--        'todos'       publicado: lo ve cualquier usuario con sesión y perfil
--                      activo (se muestra en "General"). Solo lo pueden
--                      publicar Informática y el Secretario Regional.
--        'restringido' lo ven solo quien lo cargó y quienes administran los
--                      documentos de ese alcance, aunque estén en el alcance.
--      Un documento en la papelera o sin archivo todavía no se muestra
--      nunca como publicado.
--   2. ESPACIO DE DEPARTAMENTO (documents.department_id): cada departamento
--      puede cargar sus propios documentos. Los ven y cargan su coordinador,
--      sus integrantes e Informática (la misma regla que los informes y
--      actas, 0098/0106). Los edita quien lo cargó, el coordinador e
--      Informática. No se mezclan departamentos. El modo departamento
--      (0107) deja de bloquear los documentos de sus departamentos y los
--      publicados; el resto de Documentos le sigue cerrado.
--
-- Qué NO hace esta migración: no relaja ninguna política existente. Las
-- políticas nuevas de lectura son permisivas pero acotadas (publicado,
-- departamento); la restricción de "restringido" y la de publicar son
-- restrictivas o de disparador. Las políticas de escritura de cuartel y
-- Regional (0053) no se tocan.

set client_encoding = 'UTF8';

-- ---------------- 1. Columnas ----------------

alter table documents
  add column if not exists department_id uuid references departments(id) on delete restrict,
  add column if not exists visibility text not null default 'alcance';

comment on column documents.department_id is 'Departamento dueño del documento (espacio documental del departamento). Es uno de los alcances posibles (excluyente con region/subsede/cuartel/usuario). NULL en el resto de los documentos.';
comment on column documents.visibility is 'Quién lo ve: alcance (quien está dentro de su alcance), todos (publicado para todos los usuarios, solo Informática y Secretario Regional) o restringido (solo quien lo cargó y quienes administran ese alcance).';

alter table documents drop constraint if exists documents_visibility_check;
alter table documents
  add constraint documents_visibility_check check (visibility in ('alcance', 'todos', 'restringido'));

-- Cada documento tiene exactamente un alcance (0032: región, subsede, cuartel o
-- persona). El departamento pasa a ser uno más de esos alcances: los documentos
-- existentes (todos con departamento nulo) siguen cumpliendo la regla.
alter table documents drop constraint if exists documents_single_scope;
alter table documents
  add constraint documents_single_scope check (
    (region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int
    + (profile_id is not null)::int + (department_id is not null)::int = 1
  );

-- Un documento dirigido a una persona puntual no se publica para todos.
alter table documents drop constraint if exists documents_published_not_personal;
alter table documents
  add constraint documents_published_not_personal check (not (visibility = 'todos' and profile_id is not null));

create index if not exists idx_documents_department_id on documents(department_id) where department_id is not null;
create index if not exists idx_documents_published on documents(created_at desc) where visibility = 'todos' and deleted_at is null;

-- ---------------- 2. Helpers ----------------
-- SECURITY DEFINER + search_path fijo, como el resto de los helpers de RLS.
-- current_profile_id() es null para perfiles inactivos: ninguno pasa.

create or replace function can_publish_documents_to_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_informatica_r4() or is_regional_role();
$$;

comment on function can_publish_documents_to_all() is 'Publicar un documento para todos los usuarios: Informática (y su integrante) y el Secretario Regional. Ningún otro rol.';

create or replace function can_create_department_document(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_create_department_report(p_department_id);
$$;

comment on function can_create_department_document(uuid) is 'Cargar un documento en el espacio de un departamento: quien puede cargar sus informes (Informática, su coordinador o sus integrantes), solo en departamentos activos.';

create or replace function can_manage_department_document(p_department_id uuid, p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (
      is_informatica_r4()
      or exists (select 1 from departments d where d.id = p_department_id and d.coordinator_profile_id = current_profile_id())
      or (
        p_uploaded_by is not null
        and p_uploaded_by = current_profile_id()
        and can_view_department_reports(p_department_id)
      )
    );
$$;

comment on function can_manage_department_document(uuid, uuid) is 'Editar, enviar a la papelera y restaurar un documento de departamento: Informática, el coordinador del departamento o quien lo cargó (si sigue teniendo acceso al departamento). Mismo criterio que los informes (0098).';

create or replace function document_is_manageable(
  p_region_id uuid,
  p_subsede_id uuid,
  p_station_id uuid,
  p_department_id uuid,
  p_uploaded_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_informatica_r4()
    or (p_uploaded_by is not null and p_uploaded_by = current_profile_id())
    or (
      is_regional_role()
      and (
        (p_region_id is not null and p_region_id in (select my_region_ids()))
        or (p_subsede_id is not null and p_subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
        or (p_station_id is not null and p_station_id in (select id from stations where region_id in (select my_region_ids())))
      )
    )
    or (
      p_station_id is not null
      and p_station_id in (select my_station_ids())
      and (
        has_role('usuario_carga_cuartel') or has_role('presidente_cuartel')
        or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
      )
    )
    or (p_department_id is not null and can_manage_department_document(p_department_id, p_uploaded_by));
$$;

comment on function document_is_manageable(uuid, uuid, uuid, uuid, uuid) is 'Quién administra un documento: Informática, quien lo cargó, el Secretario Regional dentro de su Regional, los roles de carga del cuartel dentro de su cuartel y, en un departamento, su coordinador. Es lo que deja ver un documento "restringido".';

revoke all on function can_publish_documents_to_all() from public;
revoke all on function can_create_department_document(uuid) from public;
revoke all on function can_manage_department_document(uuid, uuid) from public;
revoke all on function document_is_manageable(uuid, uuid, uuid, uuid, uuid) from public;
-- anon también: las políticas restrictivas se evalúan en cualquier consulta y,
-- sin sesión, estas funciones devuelven false.
grant execute on function can_publish_documents_to_all() to anon, authenticated;
grant execute on function can_create_department_document(uuid) to anon, authenticated;
grant execute on function can_manage_department_document(uuid, uuid) to anon, authenticated;
grant execute on function document_is_manageable(uuid, uuid, uuid, uuid, uuid) to anon, authenticated;

-- ---------------- 3. Publicar para todos: solo quien corresponde ----------------
-- Un disparador y no una política porque la regla es sobre el CAMBIO (pasar a
-- 'todos'), no sobre la fila: quien edita el título de un documento ya
-- publicado no tiene que poder publicar. Despublicar (volver a 'alcance' o
-- 'restringido') lo puede hacer cualquiera que pueda editar el documento.
-- Sin sesión de usuario (SQL Editor, funciones de servicio) no se exige.

create or replace function documents_check_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'todos'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'todos')
     and auth.uid() is not null
     and not can_publish_documents_to_all() then
    raise exception 'Solo Informática y el Secretario Regional pueden publicar un documento para todos.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function documents_check_publication() is 'Impide que un rol que no sea Informática ni Secretario Regional deje un documento en visibilidad "todos" (alta o cambio). No exige nada al editar un documento que ya estaba publicado.';

revoke all on function documents_check_publication() from public;
revoke all on function documents_check_publication() from anon;
revoke all on function documents_check_publication() from authenticated;

drop trigger if exists trg_documents_check_publication on documents;
create trigger trg_documents_check_publication
  before insert or update on documents
  for each row execute function documents_check_publication();

-- ---------------- 4. RLS: documents ----------------

-- Publicados: cualquier usuario con perfil activo. Nunca en la papelera ni
-- sin archivo subido.
drop policy if exists "documents_select_published" on documents;
create policy "documents_select_published" on documents
  for select using (
    visibility = 'todos'
    and deleted_at is null
    and storage_path <> 'pending'
    and current_profile_id() is not null
  );

-- Documentos de un departamento: sus integrantes, su coordinador e Informática.
drop policy if exists "documents_select_department" on documents;
create policy "documents_select_department" on documents
  for select using (
    department_id is not null
    and can_view_department_reports(department_id)
  );

drop policy if exists "documents_insert_department" on documents;
create policy "documents_insert_department" on documents
  for insert with check (
    department_id is not null
    and can_create_department_document(department_id)
  );

drop policy if exists "documents_update_department" on documents;
create policy "documents_update_department" on documents
  for update using (
    department_id is not null
    and can_manage_department_document(department_id, uploaded_by_profile_id)
  )
  with check (
    department_id is not null
    and can_manage_department_document(department_id, uploaded_by_profile_id)
  );

-- Restringido: solo quien lo carga y quienes lo administran (y, si es para
-- una persona puntual, esa persona). Restrictiva: solo quita visibilidad.
drop policy if exists "documents_restricted_visibility" on documents;
create policy "documents_restricted_visibility" on documents
  as restrictive for select
  using (
    visibility <> 'restringido'
    or document_is_manageable(region_id, subsede_id, station_id, department_id, uploaded_by_profile_id)
    or (profile_id is not null and profile_id = current_profile_id())
  );

-- Modo departamento (0107): Documentos sigue cerrado salvo los documentos de
-- sus departamentos y los publicados para todos.
drop policy if exists "documents_department_only_block" on documents;
create policy "documents_department_only_block" on documents
  as restrictive for select
  using (not is_department_only() or department_id is not null or visibility = 'todos');

-- ---------------- 5. RLS: document_versions ----------------
-- Reemplazar el archivo de un documento de departamento guarda la versión
-- anterior: quien lo administra la lee y la agrega.

drop policy if exists "document_versions_select_department" on document_versions;
create policy "document_versions_select_department" on document_versions
  for select using (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
        and d.department_id is not null
        and can_view_department_reports(d.department_id)
    )
  );

drop policy if exists "document_versions_insert_department" on document_versions;
create policy "document_versions_insert_department" on document_versions
  for insert with check (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
        and d.department_id is not null
        and can_manage_department_document(d.department_id, d.uploaded_by_profile_id)
    )
  );

drop policy if exists "document_versions_department_only_block" on document_versions;
create policy "document_versions_department_only_block" on document_versions
  as restrictive for select
  using (
    not is_department_only()
    or exists (
      select 1 from documents d
      where d.id = document_versions.document_id and d.department_id is not null
    )
  );

-- ---------------- 6. Storage: bucket "documents" ----------------
-- El primer segmento del path es el id del documento (<document_id>/archivo).
-- Las consultas a documents de adentro de las políticas pasan por la RLS de
-- documents: un documento "restringido" que la persona no puede ver tampoco
-- le deja descargar su archivo (ni con las políticas de alcance de 0019).

drop policy if exists "documents_storage_select_published" on storage.objects;
create policy "documents_storage_select_published" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
        and d.visibility = 'todos'
        and d.deleted_at is null
        and d.storage_path <> 'pending'
        and current_profile_id() is not null
    )
  );

drop policy if exists "documents_storage_select_department" on storage.objects;
create policy "documents_storage_select_department" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
        and d.department_id is not null
        and can_view_department_reports(d.department_id)
    )
  );

drop policy if exists "documents_storage_write_department" on storage.objects;
create policy "documents_storage_write_department" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
        and d.department_id is not null
        and can_manage_department_document(d.department_id, d.uploaded_by_profile_id)
    )
  );

drop policy if exists "documents_storage_delete_department" on storage.objects;
create policy "documents_storage_delete_department" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
        and d.department_id is not null
        and can_manage_department_document(d.department_id, d.uploaded_by_profile_id)
    )
  );

drop policy if exists "documents_storage_department_only_block" on storage.objects;
create policy "documents_storage_department_only_block" on storage.objects
  as restrictive for select
  using (
    bucket_id <> 'documents'
    or not is_department_only()
    or exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
        and (d.department_id is not null or d.visibility = 'todos')
    )
  );

-- ---------------- 7. Notificación de "documento nuevo" ----------------
-- Misma función de 0056 con dos cambios, para no avisar de lo que no se puede
-- abrir: un documento restringido o de un departamento no genera aviso de
-- alcance (sin alcance, el aviso quedaba sin destinatario y solo lo veía
-- Informática).

create or replace function notify_document_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.storage_path = 'pending' then
    return new;
  end if;
  if tg_op = 'update' and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;
  if tg_op = 'update' and old.storage_path <> 'pending' then
    return new;
  end if;
  -- Restringido o de un departamento: sin aviso de alcance.
  if new.visibility = 'restringido' or new.department_id is not null then
    return new;
  end if;
  -- Sin ningún alcance no hay a quién avisar.
  if new.profile_id is null and new.region_id is null and new.subsede_id is null and new.station_id is null then
    return new;
  end if;

  insert into notifications (profile_id, region_id, subsede_id, station_id, type, title, body)
  values (
    new.profile_id,
    case when new.profile_id is null then new.region_id else null end,
    case when new.profile_id is null then new.subsede_id else null end,
    case when new.profile_id is null then new.station_id else null end,
    'documento_actualizado',
    'Nuevo documento: ' || new.title,
    'Se cargó un nuevo documento (' || new.category || ') en tu alcance.'
  );
  return new;
end;
$$;

comment on function notify_document_created() is 'Crea una notificacion con el mismo alcance del documento recien cuando storage_path deja de ser ''pending'' (0056). No avisa de documentos restringidos ni de departamento (0110) ni de los que no tienen ningun alcance.';
