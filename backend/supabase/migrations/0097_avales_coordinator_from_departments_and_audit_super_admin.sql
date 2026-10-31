-- SIGER4 - Avales: coordinador único desde Departamentos + Auditoría solo
-- para informatica_r4
--
-- REQUISITO: correr antes 0096_avales_use_system_departments.sql.
--
-- 1. Coordinador de departamento: una sola fuente de verdad.
--    Hasta acá el acceso de un coordinador a Avales exigía DOS cosas
--    separadas de la sección Departamentos: el rol
--    coordinador_departamento_escuela y una fila en
--    school_department_members. Quien ya figuraba como coordinador en la
--    sección Departamentos (departments.coordinator_profile_id) no era
--    reconocido en Avales, y había que "asignarlo de nuevo" desde Escuela.
--    Desde esta migración el coordinador de un departamento es solo
--    departments.coordinator_profile_id, el mismo campo que muestra y edita
--    la sección Departamentos:
--      - is_school_department_coordinator() lee ese campo.
--      - school_department_members, sus RPC de asignación y el uso del rol
--        coordinador_departamento_escuela se eliminan. El valor del enum
--        queda (Postgres no permite borrarlo sin recrear el tipo) pero ya
--        no se asigna ni se consulta; las filas de user_roles con ese rol se
--        borran.
--      - Migración de datos: si un departamento tenía un coordinador
--        asignado en Escuela y NO tenía coordinador en Departamentos, pasa a
--        ser su coordinador. Si ya tenía otro coordinador en Departamentos,
--        manda Departamentos (la asignación de Escuela se descarta y queda
--        registrada en auditoría como borrado).
--    La matriz de Avales no cambia: Informática, Coordinador y Secretario de
--    Escuela ven todos los departamentos; el coordinador de un departamento
--    ve y carga solo en el suyo; el resto, nada.
--
-- 2. Departamentos: alta y baja solo para Informática.
--    La policy anterior (0042, "for all") dejaba que cualquier usuario
--    creara un departamento poniéndose a sí mismo como coordinador. Ahora
--    que ser coordinador da acceso a Avales, eso sería una forma de
--    autoasignarse acceso. Crear y eliminar quedan para is_informatica_r4()
--    (como ya decía la matriz de permisos y como ya hacía la UI); editar
--    sigue siendo de Informática o del coordinador, que no puede cederle el
--    departamento a otro (with check exige seguir siendo el coordinador).
--
-- 3. Auditoría: solo el admin supremo.
--    audit_logs pasa a ser legible únicamente por is_super_admin()
--    (informatica_r4). Se eliminan todas las policies de lectura por alcance
--    (regional, subsede, cuartel, Escuela) y la de integrante_informatica.
--    La escritura no cambia (triggers SECURITY DEFINER y
--    record_manual_audit_event()).

do $$
begin
  if to_regclass('public.school_avales_documents') is null then
    raise exception 'Falta correr 0095_school_avales_module.sql antes de 0097.';
  end if;
  if to_regclass('public.school_departments') is not null then
    raise exception 'Falta correr 0096_avales_use_system_departments.sql antes de 0097.';
  end if;
end;
$$;

-- ============================================================
-- 1. Coordinador único: departments.coordinator_profile_id
-- ============================================================

do $$
declare
  r record;
  v_moved integer := 0;
  v_discarded integer := 0;
begin
  if to_regclass('public.school_department_members') is null then
    return;
  end if;

  for r in
    select distinct on (m.department_id) m.department_id, m.profile_id
    from school_department_members m
    join departments d on d.id = m.department_id
    join profiles p on p.id = m.profile_id and p.is_active = true
    where m.is_active = true
      and m.member_role = 'coordinador'
      and d.coordinator_profile_id is null
    order by m.department_id, m.created_at
  loop
    update departments
    set coordinator_profile_id = r.profile_id
    where id = r.department_id
      and coordinator_profile_id is null;
    v_moved := v_moved + 1;
  end loop;

  select count(*)
  into v_discarded
  from school_department_members m
  join departments d on d.id = m.department_id
  where m.is_active = true
    and d.coordinator_profile_id is distinct from m.profile_id;

  raise notice '0097: % asignaciones de Escuela pasaron a ser coordinador en Departamentos; % descartadas porque el departamento ya tenía otro coordinador.', v_moved, v_discarded;
end;
$$;

-- Borrado explícito (no solo drop table) para que cada asignación
-- descartada quede registrada en audit_logs por su trigger de auditoría.
do $$
begin
  if to_regclass('public.school_department_members') is not null then
    delete from school_department_members;
  end if;
end;
$$;

drop function if exists assign_school_department_coordinator(uuid, uuid);
drop function if exists remove_school_department_coordinator(uuid, uuid);
drop function if exists my_school_department_ids();
-- Sus policies y triggers (incluida la auditoría) se eliminan con la tabla;
-- las filas de audit_logs ya registradas se conservan.
drop table if exists school_department_members;

-- El rol ya no da ni quita nada. Se borran sus asignaciones para que no
-- quede un permiso aparente sin efecto. El trigger de protección de
-- superadmin se suspende solo para este borrado: en una migración no hay
-- sesión, y sin esto no se podría quitar el rol a un informatica_r4 que lo
-- tuviera asignado. La auditoría y el aviso a Informática sí se registran.
alter table user_roles disable trigger trg_protect_super_admin_user_roles;
delete from user_roles where role = 'coordinador_departamento_escuela';
alter table user_roles enable trigger trg_protect_super_admin_user_roles;

create or replace function is_school_department_coordinator(p_department_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_department_id is not null
    and exists (
      select 1
      from departments d
      where d.id = p_department_id
        and d.coordinator_profile_id = current_profile_id()
    );
$$;

comment on function is_school_department_coordinator(uuid) is 'true si el usuario activo es el coordinador del departamento en la sección Departamentos (departments.coordinator_profile_id). Única fuente: no hace falta ninguna otra asignación ni rol para Avales.';

comment on function can_view_school_avales_department(uuid) is 'Puede ver el departamento y sus avales: Informatica, coordinador_escuela, secretario_escuela, o el coordinador del departamento en la sección Departamentos.';

-- RETURNS TABLE cambia respecto de 0096 (agrega el coordinador): hay que
-- borrar la función antes de recrearla.
drop function if exists list_school_avales_departments();

create function list_school_avales_departments()
returns table (
  id uuid,
  name text,
  description text,
  is_active boolean,
  coordinator_profile_id uuid,
  coordinator_name text,
  is_my_department boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.name,
    d.description,
    d.is_active,
    d.coordinator_profile_id,
    p.full_name,
    (d.coordinator_profile_id is not null and d.coordinator_profile_id = current_profile_id())
  from departments d
  left join profiles p on p.id = d.coordinator_profile_id
  where can_view_school_avales_department(d.id)
  order by d.name;
$$;

comment on function list_school_avales_departments() is 'Departamentos (tabla departments) visibles para el usuario actual dentro de Avales, con su coordinador de la sección Departamentos. SECURITY DEFINER solo para leer el nombre del coordinador; el filtro de visibilidad es can_view_school_avales_department().';

revoke all on function list_school_avales_departments() from public, anon;
grant execute on function list_school_avales_departments() to authenticated;

-- ============================================================
-- 2. departments: alta y baja solo para Informática
-- ============================================================

drop policy if exists "departments_write_coordinator_or_admin" on departments;
drop policy if exists "departments_insert_admin" on departments;
drop policy if exists "departments_update_coordinator_or_admin" on departments;
drop policy if exists "departments_delete_admin" on departments;

create policy "departments_insert_admin" on departments
  for insert to authenticated
  with check (is_informatica_r4());

create policy "departments_update_coordinator_or_admin" on departments
  for update to authenticated
  using (is_informatica_r4() or coordinator_profile_id = current_profile_id())
  with check (is_informatica_r4() or coordinator_profile_id = current_profile_id());

create policy "departments_delete_admin" on departments
  for delete to authenticated
  using (is_informatica_r4());

comment on policy "departments_update_coordinator_or_admin" on departments is 'Editar: Informática o el coordinador del departamento. El coordinador no puede cambiar el coordinador (with check exige que siga siendo él): ese campo da acceso a Avales y solo lo asigna Informática.';

-- ============================================================
-- 3. audit_logs: lectura solo para informatica_r4
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on audit_logs', r.policyname);
  end loop;
end;
$$;

create policy "audit_logs_select_super_admin" on audit_logs
  for select to authenticated
  using (is_super_admin());

comment on policy "audit_logs_select_super_admin" on audit_logs is 'La auditoría la lee solo informatica_r4 (is_super_admin()). Ningún otro rol, por alcance ni por módulo, ve registros de auditoría.';

revoke all on table audit_logs from anon;

-- ============================================================
-- 4. departments: sin nombres repetidos
-- ============================================================
-- Departamentos es la única lista (también la de Avales): un nombre
-- repetido ("Fuego" y "fuego ") mostraría dos departamentos iguales con
-- coordinadores y avales distintos. Se exige nombre único sin distinguir
-- mayúsculas ni espacios de los extremos (mismo criterio con el que 0096
-- unificó las dos listas). Si ya hubiera repetidos, el índice no se crea y
-- se avisa cuáles son: hay que unificarlos a mano y volver a correr esta
-- migración.

do $$
declare
  v_duplicates text;
begin
  select string_agg(format('%s (%s)', n, c), ', ')
  into v_duplicates
  from (
    select lower(btrim(name)) as n, count(*) as c
    from departments
    group by lower(btrim(name))
    having count(*) > 1
  ) dup;

  if v_duplicates is not null then
    raise warning '0097: hay departamentos con el mismo nombre: %. No se creó el índice único; unificalos y volvé a correr la migración.', v_duplicates;
  else
    execute 'create unique index if not exists departments_name_unique_idx on departments (lower(btrim(name)))';
  end if;
end;
$$;
