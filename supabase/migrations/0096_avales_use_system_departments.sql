-- SIGER4 - Avales regionales: usar la tabla única de departamentos
--
-- 0095 creó school_departments, una lista de departamentos propia de
-- Escuela, separada de departments (la tabla que administra la sección
-- Departamentos, 0042). Eso duplicaba la entidad: Fuego, Forestal, FASME o
-- cualquier otro departamento podían existir dos veces, con ids distintos, y
-- un departamento creado en un lado no aparecía en el otro.
--
-- Desde esta migración la entidad Departamento es una sola: departments.
--   - school_avales_documents.department_id   -> departments(id)
--   - school_department_members.department_id -> departments(id)
--   - school_departments se elimina.
-- Crear, renombrar, desactivar o eliminar un departamento se hace solo desde
-- la sección Departamentos, con sus permisos de siempre. Escuela reutiliza
-- esa lista: Avales muestra los mismos departamentos, y la asignación de
-- coordinadores de Avales (rol coordinador_departamento_escuela +
-- school_department_members) apunta al departamento único.
--
-- Migración de datos (sin pérdida de documentos ni de coordinadores):
--   - Cada fila de school_departments se empareja con un departamento
--     existente por nombre (sin distinguir mayúsculas ni espacios de los
--     extremos). Si hay más de uno con ese nombre, se toma el activo más
--     antiguo.
--   - Si no hay coincidencia, se crea en departments conservando el MISMO id
--     de school_departments, así sus documentos y coordinadores no cambian
--     de department_id.
--   - Los documentos y coordinadores de departamentos emparejados se
--     reasignan al id existente. La ruta del archivo en Storage no cambia
--     (es inmutable): los permisos de lectura salen de department_id, nunca
--     de la ruta (ver 0095), así que los archivos siguen accesibles igual.
--
-- Funciona igual si 0095 ya estaba aplicada con datos cargados o si se
-- corren 0094, 0095 y 0096 seguidas en un proyecto nuevo. Se puede volver a
-- correr sin efecto.
--
-- Permisos: la matriz de Avales no cambia. departments mantiene su RLS de
-- siempre (lectura para cualquier usuario autenticado, como el resto de los
-- directorios institucionales): saber qué departamentos existen no da acceso
-- a ningún aval. Qué departamentos ve cada rol DENTRO de Avales, y qué
-- documentos y archivos puede leer o cargar, sigue saliendo de los helpers de
-- 0095 (can_view/can_upload_school_avales_department) y de las policies de
-- school_avales_documents y del bucket school-avales.

do $$
begin
  if to_regclass('public.school_avales_documents') is null then
    raise exception 'Falta correr 0095_school_avales_module.sql antes de 0096_avales_use_system_departments.sql.';
  end if;
end;
$$;

-- ============================================================
-- 1. Soltar las FK que apuntan a school_departments
-- ============================================================

do $$
declare
  r record;
begin
  if to_regclass('public.school_departments') is null then
    return;
  end if;
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.school_departments'::regclass
      and c.conrelid in ('public.school_avales_documents'::regclass, 'public.school_department_members'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

-- ============================================================
-- 2. Unificar: school_departments -> departments
-- ============================================================

-- updated_at de los documentos no debe cambiar por la reasignación (la UI
-- lo muestra como "Actualizado"). La auditoría sí queda registrada.
alter table school_avales_documents disable trigger trg_school_avales_documents_updated_at;

do $$
declare
  r record;
  v_target uuid;
begin
  if to_regclass('public.school_departments') is null then
    return;
  end if;

  for r in select * from school_departments order by created_at, name loop
    v_target := null;

    select d.id
    into v_target
    from departments d
    where lower(btrim(d.name)) = lower(btrim(r.name))
    order by d.is_active desc, d.created_at asc
    limit 1;

    if v_target is null then
      insert into departments (id, name, description, is_active, created_by_profile_id, created_at, updated_at)
      values (r.id, btrim(r.name), r.description, r.is_active, r.created_by_profile_id, r.created_at, r.updated_at);
      v_target := r.id;
    end if;

    if v_target <> r.id then
      update school_avales_documents set department_id = v_target where department_id = r.id;

      -- Una asignación de coordinador al mismo departamento final ya
      -- existente se fusiona (queda activa si alguna de las dos lo estaba).
      update school_department_members m
      set is_active = true
      where m.department_id = v_target
        and exists (
          select 1 from school_department_members o
          where o.department_id = r.id
            and o.profile_id = m.profile_id
            and o.member_role = m.member_role
            and o.is_active
        );
      delete from school_department_members o
      where o.department_id = r.id
        and exists (
          select 1 from school_department_members m
          where m.department_id = v_target
            and m.profile_id = o.profile_id
            and m.member_role = o.member_role
        );
      update school_department_members set department_id = v_target where department_id = r.id;
    end if;
  end loop;
end;
$$;

alter table school_avales_documents enable trigger trg_school_avales_documents_updated_at;

-- ============================================================
-- 3. FK nuevas hacia departments
-- ============================================================

do $$
begin
  if exists (
    select 1 from school_avales_documents d
    where not exists (select 1 from departments x where x.id = d.department_id)
  ) then
    raise exception 'Hay avales con un departamento inexistente; no se puede crear la relación con departments.';
  end if;
  if exists (
    select 1 from school_department_members m
    where not exists (select 1 from departments x where x.id = m.department_id)
  ) then
    raise exception 'Hay coordinadores asignados a un departamento inexistente; no se puede crear la relación con departments.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'school_avales_documents_department_id_fkey'
      and conrelid = 'public.school_avales_documents'::regclass
  ) then
    -- restrict: un departamento con avales no se puede eliminar (primero hay
    -- que mover o eliminar sus avales). Desactivarlo sí se puede.
    alter table school_avales_documents
      add constraint school_avales_documents_department_id_fkey
      foreign key (department_id) references departments(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'school_department_members_department_id_fkey'
      and conrelid = 'public.school_department_members'::regclass
  ) then
    alter table school_department_members
      add constraint school_department_members_department_id_fkey
      foreign key (department_id) references departments(id) on delete cascade;
  end if;
end;
$$;

-- ============================================================
-- 4. Helpers y RPC que leían school_departments
-- ============================================================

create or replace function can_upload_school_avales_department(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from departments d where d.id = p_department_id and d.is_active = true)
    and can_view_school_avales_department(p_department_id);
$$;

comment on function can_upload_school_avales_department(uuid) is 'Puede cargar avales en el departamento (tabla departments): mismas reglas que ver, y el departamento tiene que estar activo en la sección Departamentos.';

create or replace function assign_school_department_coordinator(p_department_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_school_avales() then
    raise exception 'Solo Informática R4 puede asignar coordinadores de Avales.' using errcode = '42501';
  end if;
  if p_department_id is null or not exists (select 1 from departments where id = p_department_id) then
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

comment on function assign_school_department_coordinator(uuid, uuid) is 'Asigna (o reactiva) a un perfil activo como coordinador de Avales de un departamento (tabla departments) y le agrega el rol coordinador_departamento_escuela si no lo tenía. Solo admin supremo.';

-- Departamentos que el usuario actual ve dentro de Avales: todos para
-- Informática / Coordinador / Secretario de Escuela, solo los propios para
-- un coordinador de departamento, ninguno para el resto. SECURITY INVOKER:
-- la lectura de departments pasa por su RLS de siempre.
create or replace function list_school_avales_departments()
returns setof departments
language sql
stable
security invoker
set search_path = public
as $$
  select d.*
  from departments d
  where can_view_school_avales_department(d.id)
  order by d.name;
$$;

comment on function list_school_avales_departments() is 'Departamentos (tabla departments) visibles para el usuario actual dentro de Avales regionales, según can_view_school_avales_department().';

revoke all on function list_school_avales_departments() from public, anon;
grant execute on function list_school_avales_departments() to authenticated;

-- ============================================================
-- 5. Eliminar la tabla duplicada
-- ============================================================
-- Sus policies, triggers (incluida la auditoría) e índices se eliminan con
-- ella. Las filas históricas de audit_logs con table_name =
-- 'school_departments' se conservan y siguen fuera de la policy regional.

drop table if exists school_departments;
drop function if exists school_departments_before_write();

-- ============================================================
-- 6. Documentación de la relación
-- ============================================================

comment on table school_department_members is 'Coordinadores de Avales regionales por departamento (tabla departments, la misma de la sección Departamentos). Da acceso a Avales SOLO si el perfil además tiene el rol coordinador_departamento_escuela. Se escribe solo vía assign_school_department_coordinator/remove_school_department_coordinator. Distinto de departments.coordinator_profile_id (coordinador del departamento en la sección Departamentos), que no da acceso a Avales.';
comment on column school_department_members.department_id is 'Departamento de la tabla departments (fuente única).';
comment on column school_avales_documents.department_id is 'Departamento de la tabla departments (fuente única). Es la fuente de los permisos de lectura y carga.';
comment on column school_avales_documents.storage_path is 'Ruta dentro del bucket school-avales: <id del departamento al cargar>/<id>/<archivo-sanitizado>. Inmutable. Si el documento cambia de departamento (edición o unificación 0096), la ruta no cambia: los permisos salen de department_id, nunca del path.';
