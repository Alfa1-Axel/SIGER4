-- SIGER4 - Departamentos: informes, actas y adjuntos
--
-- REQUISITO: correr antes 0097_avales_coordinator_from_departments_and_audit_super_admin.sql.
--
-- Un departamento ya podía registrar actividad para estadísticas
-- (department_activity_reports, 0061: tipo, horas, asistentes). Eso dice
-- "hubo una reunión", pero no guarda el acta ni el respaldo. Este módulo
-- agrega informes documentales:
--   - Redactado en el sistema (texto) o cargado como archivo (acta, informe
--     en PDF/Word, planilla), con fotos y videos adjuntos.
--   - Tipo, título, fecha, texto, observaciones, autor y archivado.
--   - Archivos en un bucket privado (department-reports), con nombre
--     original para descargar.
--
-- Permisos (mínimo necesario, ver DEPLOYMENT.md sección 57):
--   - Ver: Informática (informatica_r4 / integrante_informatica), el
--     coordinador del departamento y sus integrantes con cuenta
--     (department_members, que agrega el coordinador o Informática). Nadie
--     más: a diferencia del registro de actividad, los informes pueden
--     contener actas, nombres y fotos.
--   - Cargar: los mismos, solo en departamentos activos.
--   - Editar, archivar, agregar y quitar adjuntos: Informática, el
--     coordinador del departamento o quien lo cargó (mientras siga teniendo
--     acceso al departamento).
--   - Eliminar: informatica_r4 o quien lo cargó. El coordinador archiva.
--   - secretario_regional no ve informes por su rol (sí sigue con el
--     registro de actividad de 0061). Si tiene que verlos, se lo agrega como
--     integrante del departamento.

do $$
begin
  if to_regclass('public.school_department_members') is not null then
    raise exception 'Falta correr 0097_avales_coordinator_from_departments_and_audit_super_admin.sql antes de 0098.';
  end if;
end;
$$;

-- ============================================================
-- 1. Tablas
-- ============================================================

create table if not exists department_reports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete restrict,
  report_type text not null default 'otro',
  title text not null,
  body text,
  observations text,
  report_date date not null default current_date,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_by_name text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  archived_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_reports_type_check check (
    report_type in ('acta_reunion', 'informe_operativo', 'informe_administrativo', 'registro_fotografico', 'documentacion', 'otro')
  ),
  constraint department_reports_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint department_reports_body_length check (body is null or char_length(body) <= 20000),
  constraint department_reports_observations_length check (observations is null or char_length(observations) <= 2000),
  constraint department_reports_archive_consistency check (
    (is_archived and archived_at is not null)
    or (not is_archived and archived_at is null and archived_by_profile_id is null)
  )
);

comment on table department_reports is 'Informes documentales de un departamento: actas, informes operativos o administrativos, registros fotográficos. Pueden ser texto redactado en el sistema, archivos adjuntos (department_report_files) o ambos. Distinto de department_activity_reports (0061), que es el registro de actividad para estadísticas.';
comment on column department_reports.created_by_name is 'Nombre de quien lo cargó, copiado al crear: se sigue viendo aunque el perfil se elimine.';
comment on column department_reports.report_date is 'Fecha del informe o de la actividad que documenta (no la de carga, que es created_at).';

create index if not exists idx_department_reports_department on department_reports (department_id, report_date desc, created_at desc);
create index if not exists idx_department_reports_created_by on department_reports (created_by_profile_id);

create table if not exists department_report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references department_reports(id) on delete cascade,
  department_id uuid not null references departments(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  file_kind text not null,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint department_report_files_path_unique unique (storage_path),
  constraint department_report_files_path_format check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$'
  ),
  constraint department_report_files_name_length check (char_length(btrim(file_name)) between 1 and 255),
  constraint department_report_files_size_check check (file_size > 0 and file_size <= 52428800),
  constraint department_report_files_kind_check check (file_kind in ('documento', 'imagen', 'video'))
);

comment on table department_report_files is 'Adjuntos de un informe de departamento. El archivo vive en el bucket privado department-reports, en <department_id>/<report_id>/<id>/<archivo-sanitizado>. Tamaño, MIME y quién lo subió los fija la base a partir de Storage.';
comment on column department_report_files.file_name is 'Nombre original del archivo, para mostrar y descargar.';

create index if not exists idx_department_report_files_report on department_report_files (report_id, created_at);

-- ============================================================
-- 2. Helpers de permisos
-- ============================================================
-- SECURITY DEFINER + search_path fijo, igual que el resto de los helpers
-- de RLS. current_profile_id() devuelve null para perfiles inactivos, así
-- que un usuario desactivado no pasa ninguno.

create or replace function can_view_department_reports(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and (
      is_informatica_r4()
      or exists (
        select 1 from departments d
        where d.id = p_department_id and d.coordinator_profile_id = current_profile_id()
      )
      or exists (
        select 1 from department_members dm
        where dm.department_id = p_department_id and dm.profile_id = current_profile_id()
      )
    );
$$;

comment on function can_view_department_reports(uuid) is 'Ver informes del departamento: Informática, su coordinador (departments.coordinator_profile_id) o sus integrantes con cuenta (department_members).';

create or replace function can_create_department_report(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select can_view_department_reports(p_department_id)
    and exists (select 1 from departments d where d.id = p_department_id and d.is_active);
$$;

comment on function can_create_department_report(uuid) is 'Cargar un informe: quien puede verlos, solo en departamentos activos.';

create or replace function can_manage_department_report(p_report_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from department_reports r
    join departments d on d.id = r.department_id
    where r.id = p_report_id
      and (
        is_informatica_r4()
        or d.coordinator_profile_id = current_profile_id()
        or (
          r.created_by_profile_id = current_profile_id()
          and can_view_department_reports(r.department_id)
        )
      )
  );
$$;

comment on function can_manage_department_report(uuid) is 'Editar, archivar y administrar adjuntos de un informe: Informática, el coordinador del departamento o quien lo cargó (si sigue teniendo acceso al departamento).';

-- Helpers de Storage: parsean la ruta y nunca lanzan error por una ruta mal
-- formada (devuelven false), para no romper consultas de otros buckets.

create or replace function department_report_object_is_registered(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from department_report_files f where f.storage_path = p_name);
$$;

create or replace function can_read_department_report_object(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from department_report_files f
    where f.storage_path = p_name
      and can_view_department_reports(f.department_id)
  );
$$;

comment on function can_read_department_report_object(text) is 'Descargar un archivo del bucket department-reports: la ruta tiene que pertenecer a un adjunto registrado de un departamento que el usuario puede ver. No depende de conocer la ruta.';

create or replace function can_delete_department_report_object(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from department_report_files f
    where f.storage_path = p_name
      and (is_super_admin() or can_manage_department_report(f.report_id))
  );
$$;

create or replace function can_upload_department_report_object(p_name text)
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
  if coalesce(array_length(v_parts, 1), 0) <> 4 then
    return false;
  end if;
  if v_parts[1] !~ v_uuid_re or v_parts[2] !~ v_uuid_re or v_parts[3] !~ v_uuid_re then
    return false;
  end if;
  if v_parts[4] !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$' then
    return false;
  end if;

  -- El informe tiene que existir, ser de ese departamento y el usuario
  -- tiene que poder administrarlo. La carpeta del adjunto tiene que ser
  -- nueva.
  if not exists (
    select 1 from department_reports r
    where r.id = v_parts[2]::uuid and r.department_id = v_parts[1]::uuid
  ) then
    return false;
  end if;
  if exists (select 1 from department_report_files f where f.id = v_parts[3]::uuid) then
    return false;
  end if;

  return can_manage_department_report(v_parts[2]::uuid);
end;
$$;

comment on function can_upload_department_report_object(text) is 'Subida al bucket department-reports: ruta exacta <department_id>/<report_id>/<file_id nuevo>/<archivo-sanitizado>, de un informe existente de ese departamento que el usuario puede administrar.';

-- ============================================================
-- 3. Triggers de integridad
-- ============================================================

create or replace function department_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Autor: siempre el usuario real de la sesión.
  if auth.uid() is not null then
    new.created_by_profile_id := current_profile_id();
  end if;
  if new.created_by_profile_id is not null then
    select p.full_name into new.created_by_name from profiles p where p.id = new.created_by_profile_id;
  end if;

  new.title := btrim(new.title);
  new.body := nullif(btrim(coalesce(new.body, '')), '');
  new.observations := nullif(btrim(coalesce(new.observations, '')), '');
  new.is_archived := false;
  new.archived_at := null;
  new.archived_by_profile_id := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_department_reports_before_insert on department_reports;
create trigger trg_department_reports_before_insert
  before insert on department_reports
  for each row execute function department_reports_before_insert();

create or replace function department_reports_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Departamento, autor y fecha de carga no cambian. Las FK a profiles sí
  -- pueden pasar a null (on delete set null al eliminar un usuario).
  if new.id is distinct from old.id
     or new.department_id is distinct from old.department_id
     or new.created_by_name is distinct from old.created_by_name
     or new.created_at is distinct from old.created_at
     or (new.created_by_profile_id is distinct from old.created_by_profile_id and new.created_by_profile_id is not null) then
    raise exception 'Solo se pueden editar los datos del informe (tipo, título, fecha, texto, observaciones o archivado). El departamento y quién lo cargó no cambian.';
  end if;

  new.title := btrim(new.title);
  new.body := nullif(btrim(coalesce(new.body, '')), '');
  new.observations := nullif(btrim(coalesce(new.observations, '')), '');
  new.updated_at := now();

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

drop trigger if exists trg_department_reports_before_update on department_reports;
create trigger trg_department_reports_before_update
  before update on department_reports
  for each row execute function department_reports_before_update();

create or replace function department_report_files_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_found boolean;
  v_department_id uuid;
begin
  select r.department_id into v_department_id from department_reports r where r.id = new.report_id;
  if v_department_id is null then
    raise exception 'El informe indicado no existe.';
  end if;
  new.department_id := v_department_id;

  if auth.uid() is not null then
    new.uploaded_by_profile_id := current_profile_id();
  end if;
  new.file_name := btrim(new.file_name);
  new.created_at := now();

  -- La ruta queda atada al departamento, al informe y al id del adjunto.
  if split_part(new.storage_path, '/', 1) <> new.department_id::text
     or split_part(new.storage_path, '/', 2) <> new.report_id::text
     or split_part(new.storage_path, '/', 3) <> new.id::text then
    raise exception 'La ruta del archivo no corresponde al informe indicado.';
  end if;

  select o.metadata, true
  into v_metadata, v_found
  from storage.objects o
  where o.bucket_id = 'department-reports'
    and o.name = new.storage_path;

  if not coalesce(v_found, false) then
    raise exception 'No se encontró el archivo subido. Volvé a intentar la carga.';
  end if;

  if coalesce(v_metadata->>'size', '') ~ '^[0-9]+$' then
    new.file_size := (v_metadata->>'size')::bigint;
  end if;
  if coalesce(v_metadata->>'mimetype', '') <> '' then
    new.mime_type := v_metadata->>'mimetype';
  end if;

  new.file_kind := case
    when new.mime_type like 'image/%' then 'imagen'
    when new.mime_type like 'video/%' then 'video'
    else 'documento'
  end;

  return new;
end;
$$;

comment on function department_report_files_before_insert() is 'Al registrar un adjunto: toma el departamento del informe, fuerza quién lo subió, exige la ruta <department_id>/<report_id>/<id>/..., verifica que el archivo exista en department-reports y toma tamaño y MIME reales de Storage.';

drop trigger if exists trg_department_report_files_before_insert on department_report_files;
create trigger trg_department_report_files_before_insert
  before insert on department_report_files
  for each row execute function department_report_files_before_insert();

-- ============================================================
-- 4. RLS
-- ============================================================

alter table department_reports enable row level security;
alter table department_report_files enable row level security;

drop policy if exists "department_reports_select" on department_reports;
create policy "department_reports_select" on department_reports
  for select to authenticated
  using (can_view_department_reports(department_id));

drop policy if exists "department_reports_insert" on department_reports;
create policy "department_reports_insert" on department_reports
  for insert to authenticated
  with check (can_create_department_report(department_id) and is_archived = false);

drop policy if exists "department_reports_update" on department_reports;
create policy "department_reports_update" on department_reports
  for update to authenticated
  using (can_manage_department_report(id))
  with check (can_manage_department_report(id));

drop policy if exists "department_reports_delete" on department_reports;
create policy "department_reports_delete" on department_reports
  for delete to authenticated
  using (
    is_super_admin()
    or (created_by_profile_id = current_profile_id() and can_view_department_reports(department_id))
  );

drop policy if exists "department_report_files_select" on department_report_files;
create policy "department_report_files_select" on department_report_files
  for select to authenticated
  using (can_view_department_reports(department_id));

drop policy if exists "department_report_files_insert" on department_report_files;
create policy "department_report_files_insert" on department_report_files
  for insert to authenticated
  with check (can_manage_department_report(report_id));

drop policy if exists "department_report_files_delete" on department_report_files;
create policy "department_report_files_delete" on department_report_files
  for delete to authenticated
  using (is_super_admin() or can_manage_department_report(report_id));

-- Sin policy de UPDATE en adjuntos: un archivo no se reemplaza ni se mueve;
-- se quita y se sube otro.

revoke all on table department_reports from anon;
revoke all on table department_report_files from anon;

-- ============================================================
-- 5. Storage: bucket privado + policies
-- ============================================================
-- 50 MB por archivo para admitir videos cortos. Es también el límite por
-- defecto de subida de un proyecto Supabase: si se baja en Project Settings
-- → Storage, bajar también los límites de la app (DEPLOYMENT.md 57).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'department-reports',
  'department-reports',
  false,
  50 * 1024 * 1024,
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
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Lectura: adjunto registrado de un departamento visible. La segunda rama
-- deja que quien subió un archivo lo lea o borre mientras todavía no está
-- registrado (carga interrumpida), para poder limpiarlo.
drop policy if exists "department_reports_storage_select" on storage.objects;
create policy "department_reports_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'department-reports'
    and (
      can_read_department_report_object(name)
      or (owner_id = (select auth.uid())::text and not department_report_object_is_registered(name))
    )
  );

drop policy if exists "department_reports_storage_insert" on storage.objects;
create policy "department_reports_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'department-reports'
    and can_upload_department_report_object(name)
  );

drop policy if exists "department_reports_storage_delete" on storage.objects;
create policy "department_reports_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'department-reports'
    and (
      can_delete_department_report_object(name)
      or (owner_id = (select auth.uid())::text and not department_report_object_is_registered(name))
    )
  );

-- ============================================================
-- 6. Auditoría
-- ============================================================
-- Sin territorio propio: caen en la rama "else" de audit_row_change().
-- Auditoría la lee solo informatica_r4 (0097).

drop trigger if exists trg_audit_department_reports on department_reports;
create trigger trg_audit_department_reports
  after insert or update or delete on department_reports
  for each row execute function audit_row_change();

drop trigger if exists trg_audit_department_report_files on department_report_files;
create trigger trg_audit_department_report_files
  after insert or update or delete on department_report_files
  for each row execute function audit_row_change();
