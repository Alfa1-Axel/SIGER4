-- SIGER4 - Escuela: Avales regionales por departamento interno
--
-- REQUISITO: correr antes 0094_school_roles_enum.sql (en su propia
-- ejecucion del SQL Editor). Esta migracion usa los valores nuevos de
-- role_key y falla con un mensaje claro si todavia no existen.
--
-- Que agrega:
--   1. school_departments: departamentos INTERNOS de la Escuela (Fuego,
--      Forestal, FASME, ...). Funcionan como carpeta/categoria de los
--      avales. NO son los Departamentos Regionales (tabla departments, 0042):
--      son otra estructura, con otros permisos, a proposito.
--   2. school_department_members: que perfil coordina que departamento
--      interno (member_role = 'coordinador'). Se escribe solo via las RPC
--      assign/remove_school_department_coordinator (Informatica R4).
--   3. school_avales_documents: metadata de cada documento de aval. El
--      archivo vive en el bucket privado "school-avales".
--   4. Helpers de permisos, RLS real en las 3 tablas, bucket privado con
--      limites de MIME/tamaño y policies de Storage, auditoria via
--      audit_row_change(), y los 3 departamentos iniciales.
--
-- Matriz de permisos (fuente de verdad: los helpers de abajo):
--   - Informatica (is_informatica_r4(): informatica_r4 + integrante_informatica):
--     ve todos los departamentos y documentos, carga en cualquiera.
--   - Admin supremo (is_super_admin(): SOLO informatica_r4): ademas edita
--     metadata, archiva, desarchiva y elimina documentos, y administra
--     departamentos y coordinadores (can_manage_school_avales()).
--   - coordinador_escuela / secretario_escuela: ven todo, cargan en
--     cualquier departamento activo. No editan, no archivan, no eliminan.
--   - coordinador_departamento_escuela + membresia activa: ve y carga SOLO
--     en su(s) departamento(s). No ve los demas. No edita/archiva/elimina.
--   - Cualquier otro usuario (incluidos director_escuela e instructor, que
--     no figuran en la matriz pedida): sin acceso. RLS no le devuelve ni
--     departamentos ni documentos, y Storage le niega lectura/escritura
--     aunque conozca la ruta exacta del archivo.
--
-- Documentos archivados: solo los ve el admin supremo (para el resto
-- desaparecen del listado y su archivo deja de poder descargarse).
--
-- Flujo de carga (sin filas "pending" como en documents): el cliente genera
-- el id del documento, sube el archivo a
--   school-avales/<department_id>/<document_id>/<archivo-sanitizado>
-- (la policy de INSERT de Storage valida que puede cargar en ese
-- departamento) y recien despues inserta la fila. Un trigger verifica que
-- el archivo exista de verdad en Storage y toma tamaño/MIME reales de la
-- metadata de Storage (no confia en lo que manda el cliente). La lectura
-- del archivo NO depende del path: exige una fila registrada, no archivada,
-- de un departamento que el usuario puede ver.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'role_key' and e.enumlabel = 'coordinador_departamento_escuela'
  ) then
    raise exception 'Falta correr 0094_school_roles_enum.sql antes de 0095_school_avales_module.sql.';
  end if;
end;
$$;

-- ============================================================
-- 1. Tablas
-- ============================================================

create table school_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_departments_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint school_departments_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint school_departments_description_length check (description is null or char_length(description) <= 500),
  constraint school_departments_slug_unique unique (slug)
);

comment on table school_departments is 'Departamentos INTERNOS de la Escuela Regional (Fuego, Forestal, FASME, ...), usados como carpeta/categoria de los avales regionales. No confundir con departments (Departamentos Regionales, 0042). No se borran desde la app: se desactivan (is_active = false), y un departamento inactivo no admite cargas nuevas.';
comment on column school_departments.slug is 'Identificador corto para URLs (?departamento=fuego). Inmutable una vez creado.';

create unique index idx_school_departments_name_unique on school_departments (lower(btrim(name)));

create table school_department_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references school_departments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  member_role text not null default 'coordinador',
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_department_members_role_check check (member_role in ('coordinador')),
  constraint school_department_members_unique unique (department_id, profile_id, member_role)
);

comment on table school_department_members is 'Asignacion de coordinadores a departamentos internos de Escuela. Da acceso a Avales SOLO si el perfil ademas tiene el rol coordinador_departamento_escuela (rol = que es, membresia = de cual). Se escribe solo via assign_school_department_coordinator/remove_school_department_coordinator.';

create index idx_school_department_members_profile on school_department_members (profile_id) where is_active;

create table school_avales_documents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references school_departments(id) on delete restrict,
  title text not null,
  description text,
  observations text,
  storage_bucket text not null default 'school-avales',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  uploaded_by_name text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  archived_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_avales_documents_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint school_avales_documents_description_length check (description is null or char_length(description) <= 2000),
  constraint school_avales_documents_observations_length check (observations is null or char_length(observations) <= 2000),
  constraint school_avales_documents_bucket_check check (storage_bucket = 'school-avales'),
  constraint school_avales_documents_path_format check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$'
  ),
  constraint school_avales_documents_path_unique unique (storage_path),
  constraint school_avales_documents_file_name_length check (char_length(btrim(file_name)) between 1 and 255),
  constraint school_avales_documents_file_size_check check (file_size > 0 and file_size <= 20971520),
  constraint school_avales_documents_archive_consistency check (
    (is_archived and archived_at is not null)
    or (not is_archived and archived_at is null and archived_by_profile_id is null)
  )
);

comment on table school_avales_documents is 'Documentos de avales regionales de la Escuela, organizados por departamento interno. El archivo vive en el bucket privado school-avales; la fila es la fuente de verdad de permisos (Storage solo deja leer archivos con fila registrada, no archivada, de un departamento visible para el usuario).';
comment on column school_avales_documents.storage_path is 'Ruta dentro del bucket school-avales: <department_id original>/<id>/<archivo-sanitizado>. Inmutable. Si el admin mueve el documento de departamento, la ruta no cambia: los permisos salen de department_id, nunca del path.';
comment on column school_avales_documents.file_name is 'Nombre original del archivo (solo para mostrar/descargar). El nombre real en Storage es la version sanitizada del final de storage_path.';
comment on column school_avales_documents.mime_type is 'Tipo MIME real, tomado de la metadata de Storage al registrar el documento.';
comment on column school_avales_documents.file_size is 'Tamaño en bytes, tomado de la metadata de Storage al registrar el documento.';
comment on column school_avales_documents.uploaded_by_name is 'Nombre de quien cargo, copiado al momento de la carga: se sigue viendo aunque el perfil se elimine o el lector no tenga permiso de leer profiles.';
comment on column school_avales_documents.is_archived is 'Archivado: solo lo ve el admin supremo (informatica_r4). Para el resto desaparece del listado y su archivo deja de poder descargarse.';

create index idx_school_avales_documents_department on school_avales_documents (department_id, created_at desc);
create index idx_school_avales_documents_uploaded_by on school_avales_documents (uploaded_by_profile_id);

create trigger trg_school_departments_updated_at
  before update on school_departments
  for each row execute function set_updated_at();

create trigger trg_school_department_members_updated_at
  before update on school_department_members
  for each row execute function set_updated_at();

create trigger trg_school_avales_documents_updated_at
  before update on school_avales_documents
  for each row execute function set_updated_at();

-- ============================================================
-- 2. Helpers de permisos
-- ============================================================
-- SECURITY DEFINER + search_path fijo, igual que el resto de los helpers de
-- RLS (0002/0026): leen user_roles/profiles/school_department_members sin
-- depender de las policies de esas tablas. Todos respetan profiles.is_active
-- via has_role()/current_profile_id()/is_informatica_r4()/is_super_admin().

create or replace function is_school_coordinator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select has_role('coordinador_escuela');
$$;

comment on function is_school_coordinator() is 'true si el usuario activo tiene el rol coordinador_escuela (Coordinador de Escuela).';

create or replace function is_school_secretary()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select has_role('secretario_escuela');
$$;

comment on function is_school_secretary() is 'true si el usuario activo tiene el rol secretario_escuela (Secretario de Escuela).';

create or replace function is_school_department_coordinator(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and has_role('coordinador_departamento_escuela')
    and exists (
      select 1
      from school_department_members m
      where m.department_id = p_department_id
        and m.profile_id = current_profile_id()
        and m.member_role = 'coordinador'
        and m.is_active = true
    );
$$;

comment on function is_school_department_coordinator(uuid) is 'true si el usuario activo tiene el rol coordinador_departamento_escuela Y una membresia activa como coordinador de ESE departamento interno. Ninguna de las dos cosas sola alcanza.';

create or replace function my_school_department_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.department_id
  from school_department_members m
  where m.profile_id = current_profile_id()
    and m.member_role = 'coordinador'
    and m.is_active = true
    and has_role('coordinador_departamento_escuela');
$$;

comment on function my_school_department_ids() is 'Departamentos internos de Escuela que el usuario actual coordina (con rol + membresia activa).';

create or replace function can_view_all_school_avales()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_informatica_r4() or is_school_coordinator() or is_school_secretary();
$$;

comment on function can_view_all_school_avales() is 'true para quien ve todos los departamentos internos de Escuela en Avales: Informatica (informatica_r4/integrante_informatica), coordinador_escuela y secretario_escuela.';

create or replace function can_view_school_avales_department(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and (can_view_all_school_avales() or is_school_department_coordinator(p_department_id));
$$;

comment on function can_view_school_avales_department(uuid) is 'Puede ver el departamento interno y sus avales: Informatica, coordinador_escuela, secretario_escuela, o coordinador activo de ese departamento.';

create or replace function can_upload_school_avales_department(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from school_departments d where d.id = p_department_id and d.is_active = true)
    and can_view_school_avales_department(p_department_id);
$$;

comment on function can_upload_school_avales_department(uuid) is 'Puede cargar avales en el departamento: mismas reglas que ver, y el departamento tiene que estar activo.';

create or replace function can_manage_school_avales()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_super_admin();
$$;

comment on function can_manage_school_avales() is 'Editar metadata, archivar/desarchivar y eliminar avales, y administrar departamentos internos y sus coordinadores. SOLO informatica_r4 (is_super_admin()), ni siquiera integrante_informatica. Para sumar a integrante_informatica, cambiar is_super_admin() por is_informatica_r4() aca: todas las policies del modulo pasan por esta funcion.';

-- Helpers de Storage: parsean/validan la ruta y nunca lanzan error por una
-- ruta mal formada (devuelven false), para no romper consultas de
-- storage.objects de otros buckets.

create or replace function school_avales_object_is_registered(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from school_avales_documents d where d.storage_path = p_name);
$$;

comment on function school_avales_object_is_registered(text) is 'true si la ruta del bucket school-avales ya pertenece a un documento registrado (archivado o no). Usado para permitir que quien subio un archivo pueda borrarlo solo si la carga quedo a medias (sin fila).';

create or replace function can_read_school_avales_object(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select can_manage_school_avales()
    or exists (
      select 1
      from school_avales_documents d
      where d.storage_path = p_name
        and d.is_archived = false
        and can_view_school_avales_department(d.department_id)
    );
$$;

comment on function can_read_school_avales_object(text) is 'Lectura de un archivo del bucket school-avales: admin supremo siempre; el resto solo si la ruta pertenece a un documento registrado, no archivado, de un departamento que puede ver. No depende del path.';

create or replace function can_upload_school_avales_object(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_parts text[];
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_name is null then
    return false;
  end if;

  v_parts := string_to_array(p_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 3 then
    return false;
  end if;
  if v_parts[1] !~ v_uuid_re or v_parts[2] !~ v_uuid_re then
    return false;
  end if;
  if v_parts[3] !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$' then
    return false;
  end if;

  -- La carpeta <document_id> tiene que ser nueva: no se puede subir dentro
  -- de la carpeta de un documento ya registrado.
  if exists (select 1 from school_avales_documents d where d.id = v_parts[2]::uuid) then
    return false;
  end if;

  return can_upload_school_avales_department(v_parts[1]::uuid);
end;
$$;

comment on function can_upload_school_avales_object(text) is 'Subida al bucket school-avales: ruta exacta <department_id>/<document_id nuevo>/<archivo-sanitizado> y permiso de carga en ese departamento (activo).';

-- ============================================================
-- 3. Triggers de integridad
-- ============================================================

create or replace function school_departments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');

  if tg_op = 'INSERT' then
    new.slug := lower(btrim(new.slug));
    if auth.uid() is not null then
      new.created_by_profile_id := current_profile_id();
    end if;
  else
    if new.slug is distinct from old.slug then
      raise exception 'El identificador (slug) de un departamento no se puede cambiar.';
    end if;
    if new.created_by_profile_id is not null and new.created_by_profile_id is distinct from old.created_by_profile_id then
      new.created_by_profile_id := old.created_by_profile_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_school_departments_before_write
  before insert or update on school_departments
  for each row execute function school_departments_before_write();

create or replace function school_avales_documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_found boolean;
begin
  -- Quien carga es siempre el usuario real de la sesion, nunca lo que mande
  -- el cliente.
  if auth.uid() is not null then
    new.uploaded_by_profile_id := current_profile_id();
  end if;
  if new.uploaded_by_profile_id is not null then
    select p.full_name into new.uploaded_by_name from profiles p where p.id = new.uploaded_by_profile_id;
  end if;

  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.observations := nullif(btrim(coalesce(new.observations, '')), '');
  new.file_name := btrim(new.file_name);
  new.storage_bucket := 'school-avales';
  new.is_archived := false;
  new.archived_at := null;
  new.archived_by_profile_id := null;
  new.created_at := now();
  new.updated_at := now();

  -- La ruta queda atada al departamento y al id del documento: un usuario
  -- no puede registrar una fila de SU departamento apuntando a un archivo
  -- de otro departamento.
  if split_part(new.storage_path, '/', 1) <> new.department_id::text
     or split_part(new.storage_path, '/', 2) <> new.id::text then
    raise exception 'La ruta del archivo no corresponde al departamento y documento indicados.';
  end if;

  select o.metadata, true
  into v_metadata, v_found
  from storage.objects o
  where o.bucket_id = 'school-avales'
    and o.name = new.storage_path;

  if not coalesce(v_found, false) then
    raise exception 'No se encontró el archivo subido para este documento. Volvé a intentar la carga.';
  end if;

  if coalesce(v_metadata->>'size', '') ~ '^[0-9]+$' then
    new.file_size := (v_metadata->>'size')::bigint;
  end if;
  if coalesce(v_metadata->>'mimetype', '') <> '' then
    new.mime_type := v_metadata->>'mimetype';
  end if;

  return new;
end;
$$;

comment on function school_avales_documents_before_insert() is 'Al registrar un aval: fuerza uploaded_by al usuario real, copia su nombre, exige que storage_path sea <department_id>/<id>/..., verifica que el archivo exista en el bucket school-avales y toma tamaño/MIME reales de la metadata de Storage.';

create trigger trg_school_avales_documents_before_insert
  before insert on school_avales_documents
  for each row execute function school_avales_documents_before_insert();

create or replace function school_avales_documents_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El archivo y los datos de carga son inmutables. Excepcion: las FK a
  -- profiles pueden pasar a NULL (on delete set null al eliminar un
  -- usuario) -- sin esto, borrar a alguien que cargo avales fallaria.
  if new.id is distinct from old.id
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.file_name is distinct from old.file_name
     or new.mime_type is distinct from old.mime_type
     or new.file_size is distinct from old.file_size
     or new.uploaded_by_name is distinct from old.uploaded_by_name
     or new.created_at is distinct from old.created_at
     or (new.uploaded_by_profile_id is distinct from old.uploaded_by_profile_id and new.uploaded_by_profile_id is not null) then
    raise exception 'Solo se puede editar la metadata del documento (título, descripción, observaciones, departamento o archivado). El archivo y los datos de carga no se modifican.';
  end if;

  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.observations := nullif(btrim(coalesce(new.observations, '')), '');

  if new.is_archived is distinct from old.is_archived then
    if new.is_archived then
      new.archived_at := now();
      new.archived_by_profile_id := current_profile_id();
    else
      new.archived_at := null;
      new.archived_by_profile_id := null;
    end if;
  else
    new.archived_at := old.archived_at;
    if new.archived_by_profile_id is not null then
      new.archived_by_profile_id := old.archived_by_profile_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function school_avales_documents_before_update() is 'Solo deja cambiar metadata (titulo, descripcion, observaciones, departamento, archivado). Archivo, ruta, tamaño, MIME y quien cargo son inmutables; fecha/autor de archivado los fija el servidor.';

create trigger trg_school_avales_documents_before_update
  before update on school_avales_documents
  for each row execute function school_avales_documents_before_update();

-- ============================================================
-- 4. RLS
-- ============================================================

alter table school_departments enable row level security;
alter table school_department_members enable row level security;
alter table school_avales_documents enable row level security;

-- ---------------- school_departments ----------------

create policy "school_departments_select_scoped" on school_departments
  for select to authenticated
  using (can_view_school_avales_department(id));

comment on policy "school_departments_select_scoped" on school_departments is 'Un coordinador de departamento solo ve el/los suyos; Informatica, coordinador_escuela y secretario_escuela ven todos; el resto no ve ninguno.';

create policy "school_departments_insert_manage" on school_departments
  for insert to authenticated
  with check (can_manage_school_avales());

create policy "school_departments_update_manage" on school_departments
  for update to authenticated
  using (can_manage_school_avales())
  with check (can_manage_school_avales());

-- Sin policy de delete: los departamentos se desactivan (is_active = false).

-- ---------------- school_department_members ----------------

create policy "school_department_members_select" on school_department_members
  for select to authenticated
  using (is_informatica_r4() or profile_id = current_profile_id());

comment on policy "school_department_members_select" on school_department_members is 'Informatica ve todas las asignaciones; cada usuario ve solo las suyas. Sin policies de escritura: se escribe solo via assign_/remove_school_department_coordinator (SECURITY DEFINER, exigen can_manage_school_avales()).';

-- ---------------- school_avales_documents ----------------

create policy "school_avales_documents_select_scoped" on school_avales_documents
  for select to authenticated
  using (
    can_manage_school_avales()
    or (is_archived = false and can_view_school_avales_department(department_id))
  );

comment on policy "school_avales_documents_select_scoped" on school_avales_documents is 'Admin supremo ve todo (incluidos archivados). El resto: solo documentos no archivados de departamentos que puede ver.';

create policy "school_avales_documents_insert_scoped" on school_avales_documents
  for insert to authenticated
  with check (
    can_upload_school_avales_department(department_id)
    and uploaded_by_profile_id = current_profile_id()
    and is_archived = false
    and storage_bucket = 'school-avales'
    and storage_path like department_id::text || '/' || id::text || '/%'
  );

comment on policy "school_avales_documents_insert_scoped" on school_avales_documents is 'Cargar: solo en un departamento activo donde el usuario puede cargar, a su propio nombre, sin archivar, y con la ruta atada a ese departamento y a ese documento.';

create policy "school_avales_documents_update_manage" on school_avales_documents
  for update to authenticated
  using (can_manage_school_avales())
  with check (can_manage_school_avales());

comment on policy "school_avales_documents_update_manage" on school_avales_documents is 'Editar metadata y archivar/desarchivar: solo admin supremo (informatica_r4).';

create policy "school_avales_documents_delete_manage" on school_avales_documents
  for delete to authenticated
  using (can_manage_school_avales());

comment on policy "school_avales_documents_delete_manage" on school_avales_documents is 'Eliminar: solo admin supremo (informatica_r4). El archivo de Storage se borra por la Storage API (policy school_avales_storage_delete).';

-- Defensa adicional a nivel de privilegios de tabla.
revoke all on table school_departments from anon;
revoke all on table school_department_members from anon;
revoke all on table school_avales_documents from anon;
revoke insert, update, delete on table school_department_members from authenticated;
revoke truncate on table school_departments, school_department_members, school_avales_documents from authenticated;

-- ============================================================
-- 5. RPC: asignar / quitar coordinadores de departamento
-- ============================================================
-- Hacen las dos mitades del acceso en un solo paso: la membresia del
-- departamento y el rol coordinador_departamento_escuela. Los triggers
-- existentes de user_roles siguen corriendo igual (auditoria, aviso a
-- Informatica, proteccion de superadmin).

create or replace function assign_school_department_coordinator(p_department_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_school_avales() then
    raise exception 'Solo Informática R4 puede asignar coordinadores de departamentos de Escuela.' using errcode = '42501';
  end if;
  if p_department_id is null or not exists (select 1 from school_departments where id = p_department_id) then
    raise exception 'El departamento indicado no existe.';
  end if;
  if p_profile_id is null or not exists (select 1 from profiles where id = p_profile_id and is_active = true) then
    raise exception 'El usuario indicado no existe o está inactivo.';
  end if;

  insert into school_department_members (department_id, profile_id, member_role, is_active, created_by_profile_id)
  values (p_department_id, p_profile_id, 'coordinador', true, current_profile_id())
  on conflict (department_id, profile_id, member_role)
  do update set is_active = true
  where school_department_members.is_active = false;

  insert into user_roles (profile_id, role)
  values (p_profile_id, 'coordinador_departamento_escuela')
  on conflict (profile_id, role) do nothing;
end;
$$;

comment on function assign_school_department_coordinator(uuid, uuid) is 'Asigna (o reactiva) a un perfil activo como coordinador de un departamento interno de Escuela y le agrega el rol coordinador_departamento_escuela si no lo tenia. Solo admin supremo.';

create or replace function remove_school_department_coordinator(p_department_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_school_avales() then
    raise exception 'Solo Informática R4 puede quitar coordinadores de departamentos de Escuela.' using errcode = '42501';
  end if;

  update school_department_members
  set is_active = false
  where department_id = p_department_id
    and profile_id = p_profile_id
    and member_role = 'coordinador'
    and is_active = true;

  -- Si ya no coordina ningun departamento, el rol deja de tener sentido:
  -- se quita (minimo permiso).
  if not exists (
    select 1
    from school_department_members
    where profile_id = p_profile_id
      and member_role = 'coordinador'
      and is_active = true
  ) then
    delete from user_roles
    where profile_id = p_profile_id
      and role = 'coordinador_departamento_escuela';
  end if;
end;
$$;

comment on function remove_school_department_coordinator(uuid, uuid) is 'Desactiva la asignacion del perfil como coordinador de ese departamento interno. Si ya no coordina ninguno, le quita el rol coordinador_departamento_escuela. Solo admin supremo.';

-- ============================================================
-- 6. Storage: bucket privado + policies
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-avales',
  'school-avales',
  false,
  20 * 1024 * 1024,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Lectura (descarga, signed URLs): fila registrada + permiso de ver. La
-- segunda rama deja que quien subio un archivo lo lea/borre solo mientras
-- NO tiene fila (carga interrumpida), para poder limpiarlo.
create policy "school_avales_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'school-avales'
    and (
      can_read_school_avales_object(name)
      or (owner_id = (select auth.uid())::text and not school_avales_object_is_registered(name))
    )
  );

create policy "school_avales_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-avales'
    and can_upload_school_avales_object(name)
  );

create policy "school_avales_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-avales'
    and (
      can_manage_school_avales()
      or (owner_id = (select auth.uid())::text and not school_avales_object_is_registered(name))
    )
  );

-- Sin policy de UPDATE: ningun archivo se reemplaza ni se mueve (tampoco el
-- admin). Editar un aval es editar su metadata.

-- ============================================================
-- 7. Auditoria
-- ============================================================
-- audit_row_change() no necesita cambios: estas tablas no tienen territorio
-- y caen en su rama "else" (region/subsede/station null). Eso si obliga a
-- ajustar audit_logs_select_regional: su condicion "region_id is null" (0076)
-- le mostraria a secretario_regional la auditoria completa de avales
-- (titulos, nombres de archivo, coordinadores), que la matriz no le da. Se
-- excluyen esas 3 tablas de esa policy puntual, sin cambiar nada mas. La
-- auditoria de avales queda visible solo para Informatica
-- (audit_logs_select_admin). Las policies de cuartel/subsede/escuela no
-- matchean (station_id/subsede_id null, o tabla fuera de su allowlist).

create trigger trg_audit_school_departments
  after insert or update or delete on school_departments
  for each row execute function audit_row_change();

create trigger trg_audit_school_department_members
  after insert or update or delete on school_department_members
  for each row execute function audit_row_change();

create trigger trg_audit_school_avales_documents
  after insert or update or delete on school_avales_documents
  for each row execute function audit_row_change();

drop policy if exists "audit_logs_select_regional" on audit_logs;

create policy "audit_logs_select_regional" on audit_logs
  for select using (
    is_regional_role()
    and (region_id is null or region_id in (select my_region_ids()))
    and table_name not in ('school_departments', 'school_department_members', 'school_avales_documents')
  );

comment on policy "audit_logs_select_regional" on audit_logs is 'secretario_regional ve la auditoria completa de su(s) region(es), y los logs sin region_id resuelto (decision de 0014/0076, sin cambios). Desde 0095 excluye las tablas de Avales regionales de Escuela (sin territorio propio): su auditoria es solo de Informatica.';

-- ============================================================
-- 8. Permisos de EXECUTE
-- ============================================================

revoke all on function is_school_coordinator() from public, anon;
grant execute on function is_school_coordinator() to authenticated;

revoke all on function is_school_secretary() from public, anon;
grant execute on function is_school_secretary() to authenticated;

revoke all on function is_school_department_coordinator(uuid) from public, anon;
grant execute on function is_school_department_coordinator(uuid) to authenticated;

revoke all on function my_school_department_ids() from public, anon;
grant execute on function my_school_department_ids() to authenticated;

revoke all on function can_view_all_school_avales() from public, anon;
grant execute on function can_view_all_school_avales() to authenticated;

revoke all on function can_view_school_avales_department(uuid) from public, anon;
grant execute on function can_view_school_avales_department(uuid) to authenticated;

revoke all on function can_upload_school_avales_department(uuid) from public, anon;
grant execute on function can_upload_school_avales_department(uuid) to authenticated;

revoke all on function can_manage_school_avales() from public, anon;
grant execute on function can_manage_school_avales() to authenticated;

revoke all on function school_avales_object_is_registered(text) from public, anon;
grant execute on function school_avales_object_is_registered(text) to authenticated;

revoke all on function can_read_school_avales_object(text) from public, anon;
grant execute on function can_read_school_avales_object(text) to authenticated;

revoke all on function can_upload_school_avales_object(text) from public, anon;
grant execute on function can_upload_school_avales_object(text) to authenticated;

revoke all on function assign_school_department_coordinator(uuid, uuid) from public, anon;
grant execute on function assign_school_department_coordinator(uuid, uuid) to authenticated;

revoke all on function remove_school_department_coordinator(uuid, uuid) from public, anon;
grant execute on function remove_school_department_coordinator(uuid, uuid) to authenticated;

-- Funciones de trigger: nadie las llama directo.
revoke all on function school_departments_before_write() from public, anon, authenticated;
revoke all on function school_avales_documents_before_insert() from public, anon, authenticated;
revoke all on function school_avales_documents_before_update() from public, anon, authenticated;

-- ============================================================
-- 9. Departamentos iniciales
-- ============================================================

insert into school_departments (name, slug)
values
  ('Fuego', 'fuego'),
  ('Forestal', 'forestal'),
  ('FASME', 'fasme')
on conflict (slug) do nothing;
