-- SIGER4 - Avales: carga amplia, gestión solo de la autoridad del área, renovación
-- manual, motivo obligatorio y auditoría por áreas (v1.15.0)
--
-- REQUISITO: correr antes 0112 (versión por registro), 0114 (map_name_key) y 0116
-- (seguridad). Se corre sola, en una ejecución del SQL Editor.
--
-- Qué cambia (modelo de permisos de Avales):
--
--   CARGAR (can_load_school_avales): cualquier persona activa con un rol operativo o
--   institucional válido carga SU aval en cualquier departamento activo: Informática (los
--   dos roles), Director e Instructor de Escuela, Coordinador y Secretario de Escuela,
--   Secretario Regional, Coordinador y Miembro de Departamento, Jefe de Cuerpo Activo y
--   Usuario de carga de cuartel. NO cargan: Invitado, Presidente de CD
--   (presidente_cuartel), Secretario de CD (secretario_comision), el rol retirado
--   administrativo ni quien no tiene rol. La lista es explícita: un rol nuevo no entra solo.
--
--   VER / EDITAR / RENOVAR POR OTRA PERSONA / ARCHIVAR / ELIMINAR: solo la autoridad del
--   área, y cada una dentro de lo suyo:
--     - Informática R4 (informatica_r4): todos los avales.
--     - Coordinador de Escuela (coordinador_escuela): todos los avales (los avales viven en
--       Escuela > Avales regionales; es la autoridad máxima del módulo).
--     - Coordinador de un departamento (el que figura en la sección Departamentos): los
--       avales de SU departamento, y de ningún otro.
--   Integrante de Informática conserva lo que ya tenía (ve todo y carga, sin editar,
--   archivar ni eliminar). Secretario de Escuela deja de ver los avales ajenos: como
--   cualquier otra persona, ve y renueva solo el suyo.
--
--   Quien carga su aval ve SOLO el suyo (para renovarlo): nunca el de otra persona.
--
--   RENOVACIÓN MANUAL: un aval vigente se mantiene hasta que una autoridad lo archive o
--   elimine, o hasta que se renueve. Cada aval es de una persona dentro de un departamento
--   y hay UNO solo vigente por (persona, departamento): la base lo garantiza con un índice
--   único. Renovar reemplaza el archivo del mismo aval (no se acumulan archivos viejos),
--   deja quién lo cargó, quién lo renovó, cuándo y cuántas veces. Nada se borra por
--   antigüedad ni al cambiar de año. Los avales anteriores a esta migración quedan tal
--   cual (sin persona ni clave de renovación): no se tocan.
--
--   MOTIVO OBLIGATORIO: archivar y eliminar solo se hacen con archive_school_aval() y
--   delete_school_aval(), que exigen un motivo de 3 a 500 caracteres y lo guardan en la
--   auditoría. Por la API directa ya no se puede borrar ni archivar (ni cambiar el
--   archivo): el disparador y los permisos de tabla lo impiden.
--
--   AUDITORÍA POR ÁREAS: audit_logs gana department_id. Informática R4 sigue viendo toda la
--   auditoría; el Coordinador de Escuela ve los movimientos de Avales de todo el módulo y
--   cada coordinador de departamento, los del suyo. Los demás, nada. La auditoría de Avales
--   ya no guarda la ruta interna del archivo.
--
-- Es idempotente: se puede volver a correr. No modifica ni borra datos de avales; solo
-- agrega columnas y limpia la ruta interna en filas viejas de audit_logs.

do $$
begin
  if to_regclass('public.school_avales_documents') is null then
    raise exception 'Falta correr 0095, 0096 y 0097 (Avales) antes de 0117.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'school_avales_documents' and column_name = 'row_version'
  ) then
    raise exception 'Falta correr 0112_edit_concurrency.sql antes de 0117.';
  end if;
  if to_regprocedure('public.map_name_key(text)') is null then
    raise exception 'Falta correr 0114_map_point_sheets.sql antes de 0117.';
  end if;
  if to_regprocedure('public.protect_author_column()') is null then
    raise exception 'Falta correr 0116_security_hardening.sql antes de 0117.';
  end if;
end;
$$;

-- ============================================================
-- 1. Columnas e índices
-- ============================================================

alter table school_avales_documents
  add column if not exists person_profile_id uuid references profiles(id) on delete set null,
  add column if not exists person_name text,
  add column if not exists reference_year smallint,
  add column if not exists renewal_key text,
  add column if not exists renewed_at timestamptz,
  add column if not exists renewed_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists renewed_by_name text,
  add column if not exists renewal_count integer not null default 0,
  add column if not exists archive_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_avales_documents_person_name_length' and conrelid = 'public.school_avales_documents'::regclass) then
    alter table school_avales_documents add constraint school_avales_documents_person_name_length
      check (person_name is null or char_length(btrim(person_name)) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_avales_documents_reference_year_range' and conrelid = 'public.school_avales_documents'::regclass) then
    alter table school_avales_documents add constraint school_avales_documents_reference_year_range
      check (reference_year is null or reference_year between 2000 and 2100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_avales_documents_archive_reason_length' and conrelid = 'public.school_avales_documents'::regclass) then
    alter table school_avales_documents add constraint school_avales_documents_archive_reason_length
      check (archive_reason is null or char_length(archive_reason) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_avales_documents_renewal_count_check' and conrelid = 'public.school_avales_documents'::regclass) then
    alter table school_avales_documents add constraint school_avales_documents_renewal_count_check
      check (renewal_count >= 0);
  end if;
end;
$$;

comment on column school_avales_documents.person_profile_id is 'Persona de SIGER4 a la que corresponde el aval. Quien carga su propio aval queda acá; lo fija el disparador, no el cliente. Vacío en los avales anteriores a 0117 y en los que una autoridad carga a nombre de otra persona (ver person_name).';
comment on column school_avales_documents.person_name is 'Nombre de la persona del aval, copiado al cargar (se sigue viendo aunque el usuario se elimine). Una autoridad puede cargar el aval de otra persona escribiendo su nombre.';
comment on column school_avales_documents.reference_year is 'Año al que corresponde el aval. Vacío en los avales anteriores a 0117 (la pantalla muestra el año de carga). No vence nada: un aval sigue vigente hasta que se renueve, archive o elimine.';
comment on column school_avales_documents.renewal_key is 'Identifica "de quién" es el aval para que haya uno solo vigente por departamento: p:<perfil> o n:<nombre normalizado>. La calcula el disparador. Vacía en los avales anteriores a 0117.';
comment on column school_avales_documents.renewed_at is 'Última renovación del archivo (renew_school_aval). Vacío si nunca se renovó.';
comment on column school_avales_documents.renewed_by_profile_id is 'Quién hizo la última renovación.';
comment on column school_avales_documents.renewed_by_name is 'Nombre de quien hizo la última renovación, copiado al renovar.';
comment on column school_avales_documents.renewal_count is 'Cantidad de veces que se renovó el archivo del aval.';
comment on column school_avales_documents.archive_reason is 'Motivo con el que una autoridad archivó el aval (obligatorio al archivar). Vacío si está vigente.';

-- Un solo aval vigente por persona y departamento. Los avales anteriores (sin clave) y los
-- archivados no cuentan.
create unique index if not exists idx_school_avales_vigente_unico
  on school_avales_documents (department_id, renewal_key)
  where is_archived = false and renewal_key is not null;

create index if not exists idx_school_avales_documents_person
  on school_avales_documents (person_profile_id)
  where person_profile_id is not null;

-- La auditoría gana el departamento (contexto de área, como region_id/station_id).
alter table audit_logs
  add column if not exists department_id uuid references departments(id) on delete set null;

comment on column audit_logs.department_id is 'Departamento al que pertenece el movimiento (hoy, los avales). Permite que cada coordinador de departamento vea la auditoría de lo suyo (policy audit_logs_select_avales_scope).';

create index if not exists idx_audit_logs_department
  on audit_logs (department_id, created_at desc)
  where department_id is not null;

-- ============================================================
-- 2. Helpers de permisos
-- ============================================================
-- SECURITY DEFINER + search_path fijo, igual que el resto de los helpers de RLS (0002/0026).
-- Todos respetan profiles.is_active a través de has_role()/current_profile_id().

create or replace function can_load_school_avales()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role in (
        'informatica_r4', 'integrante_informatica',
        'director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela',
        'secretario_regional',
        'coordinador_departamento', 'miembro_departamento',
        'jefe_cuerpo_activo', 'usuario_carga_cuartel'
      )
  );
$$;

comment on function can_load_school_avales() is 'Puede cargar SU aval: persona activa con alguno de los roles operativos o institucionales de la lista (Informática, Escuela, Secretario Regional, departamentos, Jefe de Cuerpo Activo y Usuario de carga). No pueden: Invitado, Presidente de CD, Secretario de CD (secretario_comision), roles retirados ni quien no tiene rol. La lista es explícita a propósito.';

-- Ven todos los departamentos de Avales: Informática y el Coordinador de Escuela (sin el
-- Secretario de Escuela, que desde 0117 ve solo el suyo).
create or replace function can_view_all_school_avales()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_informatica_r4() or is_school_coordinator();
$$;

comment on function can_view_all_school_avales() is 'Ve los avales de todos los departamentos: Informática (informatica_r4 e integrante_informatica) y el Coordinador de Escuela. Desde 0117 el Secretario de Escuela ya no (ve solo el suyo, como cualquier persona que carga).';

-- Gestionan TODOS los avales: Informática R4 (admin supremo, no el integrante) y el
-- Coordinador de Escuela.
create or replace function can_manage_school_avales()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_super_admin() or is_school_coordinator();
$$;

comment on function can_manage_school_avales() is 'Autoridad sobre todos los avales: Informática R4 (informatica_r4) y el Coordinador de Escuela. Pueden editar, renovar por otra persona, archivar y eliminar. Para sumar al integrante de Informática, cambiar is_super_admin() por is_informatica_r4() acá y en can_audit_school_avales().';

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

comment on function can_view_school_avales_department(uuid) is 'Ve todos los avales del departamento: Informática, el Coordinador de Escuela o el coordinador de ese departamento en la sección Departamentos.';

create or replace function can_manage_school_avales_department(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and (can_manage_school_avales() or is_school_department_coordinator(p_department_id));
$$;

comment on function can_manage_school_avales_department(uuid) is 'Autoridad sobre los avales del departamento: Informática R4, el Coordinador de Escuela o el coordinador de ESE departamento. Es quien edita, renueva por otra persona, archiva y elimina, y ve los archivados.';

create or replace function can_upload_school_avales_department(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from departments d where d.id = p_department_id and d.is_active = true)
    and can_load_school_avales();
$$;

comment on function can_upload_school_avales_department(uuid) is 'Puede cargar un aval en el departamento: tiene un rol que carga (can_load_school_avales) y el departamento está activo en la sección Departamentos.';

-- Auditoría de Avales por área. Informática R4 ya la ve toda por audit_logs_select_super_admin;
-- el integrante de Informática sigue sin ver Auditoría.
create or replace function can_audit_school_avales(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and (is_super_admin() or is_school_coordinator() or is_school_department_coordinator(p_department_id));
$$;

comment on function can_audit_school_avales(uuid) is 'Puede ver la auditoría de Avales del departamento: Informática R4, el Coordinador de Escuela o el coordinador de ese departamento. Nadie más.';

-- Helpers de Storage
create or replace function can_read_school_avales_object(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from school_avales_documents d
    where d.storage_path = p_name
      and (
        can_manage_school_avales_department(d.department_id)
        or (d.is_archived = false and can_view_school_avales_department(d.department_id))
        or (
          d.is_archived = false
          and current_profile_id() is not null
          and (d.person_profile_id = current_profile_id() or d.uploaded_by_profile_id = current_profile_id())
        )
      )
  );
$$;

comment on function can_read_school_avales_object(text) is 'Lectura de un archivo del bucket school-avales: solo si la ruta pertenece a un aval registrado que la persona puede ver (la autoridad del área; cada quien, el suyo). Sin fila registrada no hay lectura por esta vía. No depende del path.';

-- Tope de archivos subidos y todavía sin registrar por persona: evita llenar el bucket con
-- archivos sueltos ahora que carga mucha más gente.
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
  v_uid text := (select auth.uid())::text;
begin
  if p_name is null or v_uid is null then
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

  -- La carpeta <document_id> tiene que ser nueva: no se puede subir dentro de la carpeta de
  -- un aval ya registrado.
  if exists (select 1 from school_avales_documents d where d.id = v_parts[2]::uuid) then
    return false;
  end if;

  if (
    select count(*)
    from storage.objects o
    where o.bucket_id = 'school-avales'
      and o.owner_id = v_uid
      and not school_avales_object_is_registered(o.name)
  ) >= 10 then
    return false;
  end if;

  return can_upload_school_avales_department(v_parts[1]::uuid);
end;
$$;

comment on function can_upload_school_avales_object(text) is 'Subida al bucket school-avales: ruta exacta <department_id>/<carpeta nueva>/<archivo-sanitizado>, permiso de carga en ese departamento y menos de 10 archivos propios sin registrar.';

-- Archivos "sueltos" del bucket (sin aval registrado: carga interrumpida, aval ya eliminado o
-- archivo reemplazado al renovar). Los ve y los quita quien los subió o la autoridad del
-- departamento de su ruta. Un archivo registrado no se puede quitar por la API: primero se
-- elimina o renueva el aval, con motivo y auditoría. La misma función sirve a la policy de
-- lectura y a la de borrado porque en Postgres un DELETE con WHERE exige también poder leer
-- la fila.
create or replace function can_access_loose_school_avales_object(p_name text, p_owner_id text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_first text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if p_name is null or school_avales_object_is_registered(p_name) then
    return false;
  end if;
  if p_owner_id is not null and p_owner_id = (select auth.uid())::text then
    return true;
  end if;
  -- CASE: el casteo a uuid solo se evalúa si la ruta empieza con un uuid.
  return case
    when v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then can_manage_school_avales_department(v_first::uuid)
    else false
  end;
end;
$$;

comment on function can_access_loose_school_avales_object(text, text) is 'Lectura y borrado de archivos sueltos del bucket school-avales (sin aval registrado): quien los subió o la autoridad del departamento de su ruta. Un archivo registrado nunca se borra por la API (primero se elimina o renueva el aval con motivo).';

-- ============================================================
-- 3. Disparadores
-- ============================================================

-- Alta
create or replace function school_avales_documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_found boolean;
  v_me uuid := current_profile_id();
begin
  -- Quien carga es siempre el usuario real de la sesión, nunca lo que mande el cliente.
  if auth.uid() is not null then
    new.uploaded_by_profile_id := v_me;
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
  new.archive_reason := null;
  new.renewed_at := null;
  new.renewed_by_profile_id := null;
  new.renewed_by_name := null;
  new.renewal_count := 0;
  new.created_at := now();
  new.updated_at := now();

  -- De quién es el aval. Quien no es autoridad del departamento carga el SUYO: queda a su
  -- nombre diga lo que diga el cliente. La autoridad puede cargar el suyo o el de otra persona
  -- (escribiendo su nombre).
  if auth.uid() is not null then
    if not can_manage_school_avales_department(new.department_id) then
      new.person_profile_id := v_me;
      new.person_name := null;
    elsif new.person_profile_id is not null and new.person_profile_id is distinct from v_me then
      raise exception 'El aval de otra persona se carga con su nombre, no con su usuario.' using errcode = '42501';
    elsif new.person_profile_id is null and nullif(btrim(coalesce(new.person_name, '')), '') is null then
      -- Sin indicar de quién es, el aval es de quien lo carga.
      new.person_profile_id := v_me;
    end if;
  end if;
  if new.person_profile_id is not null then
    select p.full_name into new.person_name from profiles p where p.id = new.person_profile_id;
  else
    new.person_name := nullif(btrim(coalesce(new.person_name, '')), '');
  end if;

  new.reference_year := coalesce(new.reference_year, extract(year from now())::smallint);

  new.renewal_key := case
    when new.person_profile_id is not null then 'p:' || new.person_profile_id::text
    when new.person_name is not null then 'n:' || map_name_key(new.person_name)
    else null
  end;
  if new.renewal_key = 'n:' then
    raise exception 'Escribí el nombre de la persona del aval (con letras o números).' using errcode = '23514';
  end if;

  -- La ruta queda atada al departamento y al id del aval.
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

comment on function school_avales_documents_before_insert() is 'Al registrar un aval: fuerza uploaded_by al usuario real, deja el aval a nombre de quien carga (salvo que una autoridad cargue el de otra persona), calcula la clave de renovación, exige que storage_path sea <department_id>/<id>/..., verifica que el archivo exista en el bucket y toma tamaño/MIME reales de Storage.';

-- Cambios. El archivo, el archivado y los datos de renovación solo los mueven las funciones
-- de abajo (que avisan con siger.aval_op); la edición común toca la metadata.
create or replace function school_avales_documents_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op text := coalesce(current_setting('siger.aval_op', true), '');
  v_renewing boolean := v_op = 'renew:' || old.id::text;
  v_archiving boolean := v_op = 'archive:' || old.id::text;
begin
  -- Datos de carga inmutables. Excepción: las FK a profiles pueden pasar a NULL (on delete set
  -- null al eliminar un usuario); sin eso, borrar a alguien que cargó avales fallaría.
  if new.id is distinct from old.id
     or new.storage_bucket is distinct from old.storage_bucket
     or new.uploaded_by_name is distinct from old.uploaded_by_name
     or new.created_at is distinct from old.created_at
     or (new.uploaded_by_profile_id is distinct from old.uploaded_by_profile_id and new.uploaded_by_profile_id is not null)
     or (new.person_profile_id is distinct from old.person_profile_id and new.person_profile_id is not null) then
    raise exception 'Solo se puede editar la metadata del aval (título, descripción, observaciones, año, departamento o nombre de la persona). El archivo y los datos de carga no se modifican.';
  end if;

  if not v_renewing
     and (new.storage_path is distinct from old.storage_path
          or new.file_name is distinct from old.file_name
          or new.mime_type is distinct from old.mime_type
          or new.file_size is distinct from old.file_size) then
    raise exception 'El archivo de un aval no se cambia editando: se renueva con "Renovar aval".';
  end if;

  if not v_archiving and new.is_archived is distinct from old.is_archived then
    raise exception 'Un aval se archiva o se vuelve a activar desde "Archivar" / "Volver a activar", que piden un motivo.';
  end if;

  -- Lo que escriben solo las funciones. Las FK a profiles sí pueden pasar a NULL (on delete set
  -- null), por eso solo se restituye el valor viejo cuando el nuevo no es nulo.
  new.renewal_key := old.renewal_key;
  if not v_renewing then
    new.renewed_at := old.renewed_at;
    if new.renewed_by_profile_id is not null then
      new.renewed_by_profile_id := old.renewed_by_profile_id;
    end if;
    new.renewed_by_name := old.renewed_by_name;
    new.renewal_count := old.renewal_count;
  end if;
  if not v_archiving then
    new.archived_at := old.archived_at;
    if new.archived_by_profile_id is not null then
      new.archived_by_profile_id := old.archived_by_profile_id;
    end if;
    new.archive_reason := old.archive_reason;
  elsif new.is_archived then
    new.archived_at := now();
    new.archived_by_profile_id := current_profile_id();
  else
    new.archived_at := null;
    new.archived_by_profile_id := null;
    new.archive_reason := null;
  end if;

  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.observations := nullif(btrim(coalesce(new.observations, '')), '');

  -- El nombre solo se corrige en los avales cargados a nombre de otra persona; la clave de
  -- renovación sigue al nombre.
  if old.person_profile_id is not null then
    new.person_name := old.person_name;
  else
    new.person_name := nullif(btrim(coalesce(new.person_name, '')), '');
    if new.person_name is distinct from old.person_name and new.person_name is not null then
      new.renewal_key := 'n:' || map_name_key(new.person_name);
      if new.renewal_key = 'n:' then
        raise exception 'Escribí el nombre de la persona del aval (con letras o números).' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function school_avales_documents_before_update() is 'Solo deja cambiar metadata. El archivo cambia únicamente al renovar, el archivado únicamente al archivar/volver a activar (las funciones lo avisan con siger.aval_op), y la renovación y el motivo los escriben solo ellas. Quien cargó, la persona y la fecha de carga son inmutables.';

-- Auditoría propia de Avales: guarda el departamento, el motivo (cuando lo hay) y NO la ruta
-- interna del archivo. Reemplaza al disparador genérico audit_row_change() en esta tabla.
create or replace function audit_school_aval_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := current_profile_id();
  v_reason text := nullif(btrim(coalesce(current_setting('siger.aval_reason', true), '')), '');
  v_action text;
  v_old jsonb;
  v_new jsonb;
  rec record;
begin
  rec := coalesce(new, old);
  -- Sin la ruta interna del archivo (NULL - 'clave' sigue siendo NULL).
  v_old := to_jsonb(old) - 'storage_path' - 'storage_bucket';
  v_new := to_jsonb(new) - 'storage_path' - 'storage_bucket';

  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  elsif new.is_archived is distinct from old.is_archived then
    v_action := case when new.is_archived then 'archive' else 'unarchive' end;
  elsif new.storage_path is distinct from old.storage_path then
    v_action := 'renew';
  else
    v_action := 'update';
  end if;

  insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, reason, department_id)
  values (
    v_actor,
    v_action,
    tg_table_name,
    rec.id::text,
    v_old,
    v_new,
    case when tg_op = 'INSERT' then null else v_reason end,
    rec.department_id
  );

  return rec;
end;
$$;

comment on function audit_school_aval_change() is 'Auditoría de school_avales_documents: acciones insert, update, renew, archive, unarchive y delete, con el departamento y el motivo (siger.aval_reason, que fijan archive_school_aval/delete_school_aval). No guarda storage_path ni storage_bucket.';

drop trigger if exists trg_audit_school_avales_documents on school_avales_documents;
create trigger trg_audit_school_avales_documents
  after insert or update or delete on school_avales_documents
  for each row execute function audit_school_aval_change();

-- ============================================================
-- 4. Funciones de Avales (archivar, volver a activar, eliminar, renovar, buscar)
-- ============================================================

create or replace function archive_school_aval(p_id uuid, p_reason text, p_expected_version integer default null)
returns school_avales_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row school_avales_documents;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_row from school_avales_documents where id = p_id for update;
  if not found or not can_manage_school_avales_department(v_row.department_id) then
    raise exception 'No tenés permiso para archivar este aval.' using errcode = '42501';
  end if;
  if v_row.is_archived then
    raise exception 'Este aval ya está archivado.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'Escribí el motivo del archivado (al menos 3 letras).' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.' using errcode = '23514';
  end if;

  perform set_config('siger.aval_op', 'archive:' || p_id::text, true);
  perform set_config('siger.aval_reason', v_reason, true);
  update school_avales_documents
  set is_archived = true,
      archive_reason = v_reason,
      row_version = coalesce(p_expected_version, row_version)
  where id = p_id
  returning * into v_row;
  perform set_config('siger.aval_op', '', true);
  perform set_config('siger.aval_reason', '', true);
  return v_row;
end;
$$;

comment on function archive_school_aval(uuid, text, integer) is 'Archiva un aval con motivo obligatorio (3 a 500 caracteres). Solo la autoridad del departamento. Queda en la auditoría con el motivo.';

create or replace function restore_school_aval(p_id uuid, p_reason text default null, p_expected_version integer default null)
returns school_avales_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row school_avales_documents;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_row from school_avales_documents where id = p_id for update;
  if not found or not can_manage_school_avales_department(v_row.department_id) then
    raise exception 'No tenés permiso para volver a activar este aval.' using errcode = '42501';
  end if;
  if not v_row.is_archived then
    raise exception 'Este aval no está archivado.' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.' using errcode = '23514';
  end if;

  perform set_config('siger.aval_op', 'archive:' || p_id::text, true);
  perform set_config('siger.aval_reason', coalesce(v_reason, ''), true);
  begin
    update school_avales_documents
    set is_archived = false,
        row_version = coalesce(p_expected_version, row_version)
    where id = p_id
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Ya hay otro aval vigente de la misma persona en este departamento: no se puede volver a activar este.' using errcode = '23505';
  end;
  perform set_config('siger.aval_op', '', true);
  perform set_config('siger.aval_reason', '', true);
  return v_row;
end;
$$;

comment on function restore_school_aval(uuid, text, integer) is 'Vuelve a activar un aval archivado (motivo opcional). Falla si ya hay otro vigente de la misma persona en el departamento.';

-- Devuelve la ruta del archivo para que la pantalla lo quite del bucket: después de esta
-- función el archivo ya no está registrado y quien lo subió o la autoridad pueden borrarlo.
create or replace function delete_school_aval(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row school_avales_documents;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_row from school_avales_documents where id = p_id for update;
  if not found or not can_manage_school_avales_department(v_row.department_id) then
    raise exception 'No tenés permiso para eliminar este aval.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'Escribí el motivo de la eliminación (al menos 3 letras).' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.' using errcode = '23514';
  end if;

  perform set_config('siger.aval_reason', v_reason, true);
  delete from school_avales_documents where id = p_id;
  perform set_config('siger.aval_reason', '', true);
  return v_row.storage_path;
end;
$$;

comment on function delete_school_aval(uuid, text) is 'Elimina un aval con motivo obligatorio (3 a 500 caracteres). Solo la autoridad del departamento. Queda en la auditoría con el motivo. Devuelve la ruta del archivo, que la pantalla quita del bucket.';

-- Renovar: reemplaza el archivo del MISMO aval (no crea otro). Lo hace la autoridad del
-- departamento o la persona dueña del aval. El archivo nuevo se sube antes a una carpeta
-- nueva <departamento>/<carpeta>/<archivo>; la pantalla quita después el archivo anterior.
create or replace function renew_school_aval(
  p_id uuid,
  p_new_path text,
  p_file_name text,
  p_reference_year integer default null,
  p_title text default null,
  p_description text default null,
  p_observations text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row school_avales_documents;
  v_old_path text;
  v_me uuid := current_profile_id();
  v_metadata jsonb;
  v_found boolean;
  v_is_owner boolean;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into v_row from school_avales_documents where id = p_id for update;
  if not found then
    raise exception 'No tenés permiso para renovar este aval.' using errcode = '42501';
  end if;

  v_is_owner := v_me is not null
    and (
      v_row.person_profile_id = v_me
      or (v_row.person_profile_id is null and v_row.person_name is null and v_row.uploaded_by_profile_id = v_me)
    );
  if not (can_manage_school_avales_department(v_row.department_id) or (v_is_owner and can_load_school_avales())) then
    raise exception 'No tenés permiso para renovar este aval.' using errcode = '42501';
  end if;
  if v_row.is_archived then
    raise exception 'Este aval está archivado: pedile a la autoridad del área que lo vuelva a activar o cargá uno nuevo.' using errcode = '22023';
  end if;

  if p_new_path is null
     or split_part(p_new_path, '/', 1) <> v_row.department_id::text
     or split_part(p_new_path, '/', 2) !~ v_uuid_re
     or split_part(p_new_path, '/', 3) !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$'
     or array_length(string_to_array(p_new_path, '/'), 1) <> 3 then
    raise exception 'La ruta del archivo nuevo no es válida.' using errcode = '22023';
  end if;
  if exists (select 1 from school_avales_documents d where d.storage_path = p_new_path or d.id = split_part(p_new_path, '/', 2)::uuid) then
    raise exception 'Ese archivo ya está registrado en otro aval.' using errcode = '22023';
  end if;

  -- El archivo tiene que existir en el bucket y haberlo subido quien renueva.
  select o.metadata, true
  into v_metadata, v_found
  from storage.objects o
  where o.bucket_id = 'school-avales'
    and o.name = p_new_path
    and o.owner_id = (select auth.uid())::text;
  if not coalesce(v_found, false) then
    raise exception 'No se encontró el archivo nuevo. Volvé a intentar la carga.' using errcode = '22023';
  end if;

  v_old_path := v_row.storage_path;
  perform set_config('siger.aval_op', 'renew:' || p_id::text, true);
  update school_avales_documents
  set storage_path = p_new_path,
      file_name = left(btrim(coalesce(nullif(btrim(p_file_name), ''), v_row.file_name)), 255),
      mime_type = coalesce(nullif(v_metadata->>'mimetype', ''), v_row.mime_type),
      file_size = case when coalesce(v_metadata->>'size', '') ~ '^[0-9]+$' and (v_metadata->>'size')::bigint > 0 then (v_metadata->>'size')::bigint else v_row.file_size end,
      reference_year = coalesce(p_reference_year, reference_year),
      title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
      description = case when p_description is null then description else nullif(btrim(p_description), '') end,
      observations = case when p_observations is null then observations else nullif(btrim(p_observations), '') end,
      renewed_at = now(),
      renewed_by_profile_id = v_me,
      renewed_by_name = (select p.full_name from profiles p where p.id = v_me),
      renewal_count = renewal_count + 1,
      row_version = coalesce(p_expected_version, row_version)
  where id = p_id
  returning * into v_row;
  perform set_config('siger.aval_op', '', true);

  return jsonb_build_object('old_storage_path', v_old_path, 'row', to_jsonb(v_row));
end;
$$;

comment on function renew_school_aval(uuid, text, text, integer, text, text, text, integer) is 'Renueva un aval: reemplaza el archivo del mismo registro (no se acumulan archivos), sube el contador de renovaciones y deja quién y cuándo. Lo hace la autoridad del departamento o la persona dueña del aval. Devuelve el aval y la ruta del archivo anterior, que la pantalla quita del bucket.';

-- ¿Ya existe un aval vigente de esa persona en el departamento? SECURITY INVOKER: solo
-- encuentra lo que quien consulta puede ver (el suyo, o cualquiera si es autoridad). Sin
-- nombre, busca el aval propio.
create or replace function find_school_aval_to_renew(p_department_id uuid, p_person_name text default null)
returns setof school_avales_documents
language sql
stable
security invoker
set search_path = public
as $$
  select d.*
  from school_avales_documents d
  where d.department_id = p_department_id
    and d.is_archived = false
    and d.renewal_key = case
      when nullif(btrim(coalesce(p_person_name, '')), '') is null then 'p:' || current_profile_id()::text
      else 'n:' || map_name_key(p_person_name)
    end
  limit 1;
$$;

comment on function find_school_aval_to_renew(uuid, text) is 'Devuelve el aval vigente de la persona (la que consulta, o la del nombre indicado) en el departamento, si quien consulta lo puede ver. Sirve para proponer renovar en vez de cargar uno duplicado.';

-- Movimientos de Avales (la auditoría de esta área, en forma legible): quién hizo qué, cuándo,
-- sobre qué aval y con qué motivo. Cada autoridad recibe solo los de su área (los mismos
-- permisos que audit_logs_select_avales_scope). No devuelve el JSON crudo ni la ruta del
-- archivo. SECURITY DEFINER solo para leer el nombre de quien hizo el movimiento.
create or replace function list_school_aval_movements(p_department_id uuid default null, p_limit integer default 200)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  department_id uuid,
  department_name text,
  record_id text,
  aval_title text,
  person_name text,
  file_name text,
  previous_file_name text,
  reference_year integer,
  changed_fields text[],
  reason text,
  actor_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.created_at,
    a.action,
    a.department_id,
    d.name,
    a.record_id,
    coalesce(a.new_value, a.old_value) ->> 'title',
    coalesce(a.new_value, a.old_value) ->> 'person_name',
    coalesce(a.new_value, a.old_value) ->> 'file_name',
    case when a.action = 'renew' then a.old_value ->> 'file_name' end,
    nullif(coalesce(a.new_value, a.old_value) ->> 'reference_year', '')::integer,
    case when a.action = 'update' then (
      select coalesce(array_agg(k order by k), array[]::text[])
      from unnest(array['title', 'description', 'observations', 'department_id', 'reference_year', 'person_name']) as k
      where (a.old_value -> k) is distinct from (a.new_value -> k)
    ) end,
    a.reason,
    p.full_name
  from audit_logs a
  left join departments d on d.id = a.department_id
  left join profiles p on p.id = a.actor_profile_id
  where a.table_name = 'school_avales_documents'
    and can_audit_school_avales(a.department_id)
    and (p_department_id is null or a.department_id = p_department_id)
  order by a.created_at desc, a.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

comment on function list_school_aval_movements(uuid, integer) is 'Movimientos de Avales legibles (cargas, renovaciones, ediciones, archivados, reactivaciones y eliminaciones, con su motivo) de las áreas que la persona audita: Informática R4 y el Coordinador de Escuela, todas; cada coordinador, la suya. Hasta 500 filas. Sin JSON crudo ni rutas.';

-- Departamentos que se ven dentro de Avales. Quien solo carga ve los departamentos activos (nombre y
-- estado); la autoridad ve además la descripción y el coordinador, y si gestiona el área.
drop function if exists list_school_avales_departments();

create function list_school_avales_departments()
returns table (
  id uuid,
  name text,
  description text,
  is_active boolean,
  coordinator_profile_id uuid,
  coordinator_name text,
  is_my_department boolean,
  can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.name,
    case when can_view_school_avales_department(d.id) then d.description end,
    d.is_active,
    case when can_view_school_avales_department(d.id) then d.coordinator_profile_id end,
    case when can_view_school_avales_department(d.id) then p.full_name end,
    is_department_member_or_coordinator(d.id),
    can_manage_school_avales_department(d.id)
  from departments d
  left join profiles p on p.id = d.coordinator_profile_id
  where can_view_school_avales_department(d.id)
     or (d.is_active and can_load_school_avales())
  order by d.name;
$$;

comment on function list_school_avales_departments() is 'Departamentos (tabla departments) visibles dentro de Avales: todos para Informática y el Coordinador de Escuela, el propio para el coordinador de un departamento y los activos para quien solo carga su aval. can_manage dice si la persona es autoridad de ese departamento.';

-- ============================================================
-- 5. RLS de school_avales_documents
-- ============================================================

drop policy if exists "school_avales_documents_select_scoped" on school_avales_documents;
create policy "school_avales_documents_select_scoped" on school_avales_documents
  for select to authenticated
  using (
    can_manage_school_avales_department(department_id)
    or (is_archived = false and can_view_school_avales_department(department_id))
    or (
      is_archived = false
      and (person_profile_id = current_profile_id() or uploaded_by_profile_id = current_profile_id())
    )
  );

comment on policy "school_avales_documents_select_scoped" on school_avales_documents is 'La autoridad del departamento ve todo (incluidos archivados); Informática y el Coordinador de Escuela ven los vigentes de todos; cualquier otra persona ve solo SU aval vigente.';

drop policy if exists "school_avales_documents_insert_scoped" on school_avales_documents;
create policy "school_avales_documents_insert_scoped" on school_avales_documents
  for insert to authenticated
  with check (
    can_upload_school_avales_department(department_id)
    and uploaded_by_profile_id = current_profile_id()
    and is_archived = false
    and storage_bucket = 'school-avales'
    and storage_path like department_id::text || '/' || id::text || '/%'
  );

comment on policy "school_avales_documents_insert_scoped" on school_avales_documents is 'Cargar: quien tiene un rol que carga, en un departamento activo, a su propio nombre, sin archivar y con la ruta atada al departamento y al aval. De quién es el aval lo fija el disparador.';

drop policy if exists "school_avales_documents_update_manage" on school_avales_documents;
create policy "school_avales_documents_update_manage" on school_avales_documents
  for update to authenticated
  using (can_manage_school_avales_department(department_id))
  with check (can_manage_school_avales_department(department_id));

comment on policy "school_avales_documents_update_manage" on school_avales_documents is 'Editar la metadata: solo la autoridad del departamento (y debe serlo también del departamento de destino si lo mueve). El archivo, el archivado y la renovación van por las funciones.';

-- Eliminar solo por delete_school_aval() (motivo obligatorio): sin policy y sin privilegio.
drop policy if exists "school_avales_documents_delete_manage" on school_avales_documents;
revoke delete on table school_avales_documents from authenticated;

-- ============================================================
-- 6. Storage: bucket privado, policies
-- ============================================================

drop policy if exists "school_avales_storage_select" on storage.objects;
create policy "school_avales_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'school-avales'
    and (
      can_read_school_avales_object(name)
      or can_access_loose_school_avales_object(name, owner_id)
    )
  );

drop policy if exists "school_avales_storage_insert" on storage.objects;
create policy "school_avales_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-avales'
    and can_upload_school_avales_object(name)
  );

drop policy if exists "school_avales_storage_delete" on storage.objects;
create policy "school_avales_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-avales'
    and can_access_loose_school_avales_object(name, owner_id)
  );

-- Sin policy de UPDATE: ningún archivo se reemplaza ni se mueve (renovar sube uno nuevo).

-- ============================================================
-- 7. Auditoría por áreas
-- ============================================================

drop policy if exists "audit_logs_select_avales_scope" on audit_logs;
create policy "audit_logs_select_avales_scope" on audit_logs
  for select to authenticated
  using (
    table_name = 'school_avales_documents'
    and department_id is not null
    and can_audit_school_avales(department_id)
  );

comment on policy "audit_logs_select_avales_scope" on audit_logs is 'Auditoría de Avales acotada al área: el Coordinador de Escuela ve la de todo el módulo y cada coordinador de departamento, la del suyo (Informática R4 ya ve toda la auditoría por audit_logs_select_super_admin). Ninguna otra tabla de la auditoría se abre.';

-- Filas anteriores de la auditoría de Avales: se les pone el departamento (para que cada área
-- vea lo suyo) y se les quita la ruta interna del archivo.
update audit_logs a
set department_id = coalesce(
      a.department_id,
      (select d.id from departments d where d.id::text = coalesce(a.new_value, a.old_value) ->> 'department_id')
    ),
    old_value = case when a.old_value is null then null else a.old_value - 'storage_path' - 'storage_bucket' end,
    new_value = case when a.new_value is null then null else a.new_value - 'storage_path' - 'storage_bucket' end
where a.table_name = 'school_avales_documents'
  and (
    a.department_id is null
    or a.old_value ->> 'storage_path' is not null
    or a.new_value ->> 'storage_path' is not null
  );

-- ============================================================
-- 8. Permisos de EXECUTE
-- ============================================================

revoke all on function can_load_school_avales() from public, anon;
grant execute on function can_load_school_avales() to authenticated;

revoke all on function can_manage_school_avales_department(uuid) from public, anon;
grant execute on function can_manage_school_avales_department(uuid) to authenticated;

revoke all on function can_audit_school_avales(uuid) from public, anon;
grant execute on function can_audit_school_avales(uuid) to authenticated;

revoke all on function can_access_loose_school_avales_object(text, text) from public, anon;
grant execute on function can_access_loose_school_avales_object(text, text) to authenticated;

revoke all on function archive_school_aval(uuid, text, integer) from public, anon;
grant execute on function archive_school_aval(uuid, text, integer) to authenticated;

revoke all on function restore_school_aval(uuid, text, integer) from public, anon;
grant execute on function restore_school_aval(uuid, text, integer) to authenticated;

revoke all on function delete_school_aval(uuid, text) from public, anon;
grant execute on function delete_school_aval(uuid, text) to authenticated;

revoke all on function renew_school_aval(uuid, text, text, integer, text, text, text, integer) from public, anon;
grant execute on function renew_school_aval(uuid, text, text, integer, text, text, text, integer) to authenticated;

revoke all on function find_school_aval_to_renew(uuid, text) from public, anon;
grant execute on function find_school_aval_to_renew(uuid, text) to authenticated;

revoke all on function list_school_avales_departments() from public, anon;
grant execute on function list_school_avales_departments() to authenticated;

revoke all on function list_school_aval_movements(uuid, integer) from public, anon;
grant execute on function list_school_aval_movements(uuid, integer) to authenticated;

-- Funciones de disparador: nadie las llama directo.
revoke all on function school_avales_documents_before_insert() from public, anon, authenticated;
revoke all on function school_avales_documents_before_update() from public, anon, authenticated;
revoke all on function audit_school_aval_change() from public, anon, authenticated;
