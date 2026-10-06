-- SIGER4 - Roles de departamento (rol + departamento) y avisos de departamento
--
-- Modelo:
--   - Rol (qué puede hacer): user_roles, con los roles nuevos de 0105
--     coordinador_departamento y miembro_departamento (nivel Regional).
--   - Departamento (dónde): departments.coordinator_profile_id y
--     department_members, sin cambios. No hay tablas nuevas.
--   - Acceso: rol Y departamento. Coordina Fuego quien figura como
--     coordinador de Fuego Y tiene el rol Coordinador de Departamento; es
--     miembro de Fuego quien figura en sus miembros Y tiene el rol Miembro de
--     Departamento. Informática ve todo, como antes.
--
-- Qué cambia:
--   1. Helpers con rol + departamento: coordinates_department(),
--      is_department_member(); se rehacen is_department_member_or_coordinator(),
--      my_department_ids(), can_notify_department(),
--      can_view_department_reports(), can_manage_department_report() e
--      is_school_department_coordinator() (avales).
--   2. Las policies que daban acceso solo por figurar en el departamento
--      ahora usan esos helpers (datos del departamento, miembros, integrantes
--      sin usuario, actividad y eventos).
--   3. Rol y departamento quedan sincronizados: al asignar a alguien como
--      coordinador o miembro, la base le agrega el rol; al quitarlo de su
--      último departamento, le quita el rol, salvo que sea su único rol (en
--      ese caso queda marcado en los pendientes de Informática). Se cargan
--      los roles de quienes ya coordinan o integran un departamento. Los
--      usuarios Informática R4 no se tocan: tienen acceso total y sus roles
--      solo los cambia otro Informática R4.
--   4. Avisos con origen: notifications.department_id (la vista
--      my_notifications lo expone) y relleno de los avisos ya enviados.
--   5. Avisos de departamento, solo a su coordinador y miembros con rol:
--      informe nuevo, archivado o restaurado; tu informe fue editado;
--      actividad registrada; te sumaron; ahora coordinás; aval nuevo
--      (al coordinador); eventos, recordatorios y avisos manuales.
--   6. Pendientes: departamentos de cada uno con rol, y para Informática los
--      roles de departamento sin departamento y los departamentos asignados
--      sin su rol.
--
-- Requiere 0103 y 0105 (corrida sola, antes). Se puede volver a correr.

set client_encoding = 'UTF8';

do $$
begin
  if not exists (select 1 from pg_enum where enumtypid = 'role_key'::regtype and enumlabel = 'miembro_departamento')
     or not exists (select 1 from pg_enum where enumtypid = 'role_key'::regtype and enumlabel = 'coordinador_departamento')
     or not exists (select 1 from pg_enum where enumtypid = 'notification_type'::regtype and enumlabel = 'aviso_departamento') then
    raise exception 'Falta la migración 0105 (roles y tipo de aviso de departamento). Correla sola, antes que esta.';
  end if;
  if to_regprocedure('public.can_view_department(uuid)') is null then
    raise exception 'Falta la migración 0103 (roles por división). Correla antes que esta.';
  end if;
end $$;

-- ============================================================
-- 1. Helpers: rol + departamento
-- ============================================================

create or replace function coordinates_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and current_profile_id() is not null
    and exists (select 1 from departments d where d.id = p_department_id and d.coordinator_profile_id = current_profile_id())
    and (has_role('coordinador_departamento') or is_informatica_r4());
$$;

comment on function coordinates_department(uuid) is 'Coordina el departamento: figura como su coordinador (departments.coordinator_profile_id) y tiene el rol Coordinador de Departamento (o es Informática).';

create or replace function is_department_member(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and current_profile_id() is not null
    and exists (select 1 from department_members dm where dm.department_id = p_department_id and dm.profile_id = current_profile_id())
    and (has_role('miembro_departamento') or is_informatica_r4());
$$;

comment on function is_department_member(uuid) is 'Es miembro del departamento: figura en department_members y tiene el rol Miembro de Departamento (o es Informática).';

create or replace function is_department_member_or_coordinator(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coordinates_department(p_department_id) or is_department_member(p_department_id);
$$;

create or replace function my_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id from departments d
  where d.coordinator_profile_id = current_profile_id()
    and (has_role('coordinador_departamento') or is_informatica_r4())
  union
  select dm.department_id from department_members dm
  where dm.profile_id = current_profile_id()
    and (has_role('miembro_departamento') or is_informatica_r4());
$$;

create or replace function can_notify_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (is_informatica_r4() or is_regional_role() or coordinates_department(p_department_id));
$$;

create or replace function can_view_department_reports(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (is_informatica_r4() or is_department_member_or_coordinator(p_department_id));
$$;

create or replace function can_manage_department_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from department_reports r
    where r.id = p_report_id
      and (
        is_informatica_r4()
        or coordinates_department(r.department_id)
        or (r.created_by_profile_id = current_profile_id() and can_view_department_reports(r.department_id))
      )
  );
$$;

-- Avales regionales (0097): el coordinador del departamento ve y carga los
-- suyos. Ahora también con su rol.
create or replace function is_school_department_coordinator(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coordinates_department(p_department_id);
$$;

create or replace function list_visible_departments()
returns table (
  id uuid,
  name text,
  description text,
  contact_info text,
  is_active boolean,
  coordinator_profile_id uuid,
  coordinator_name text,
  member_count integer,
  my_relation text
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
    d.contact_info,
    d.is_active,
    d.coordinator_profile_id,
    c.full_name,
    (select count(*)::integer from department_members dm where dm.department_id = d.id),
    case
      when coordinates_department(d.id) then 'coordinador'
      when is_department_member(d.id) then 'integrante'
      else null
    end
  from departments d
  left join profiles c on c.id = d.coordinator_profile_id
  where can_view_department(d.id)
  order by d.name;
$$;

-- ============================================================
-- 2. Policies: acceso por rol + departamento
-- ============================================================

drop policy if exists "departments_update_coordinator_or_admin" on departments;
create policy "departments_update_coordinator_or_admin" on departments
  for update
  using (is_informatica_r4() or (coordinator_profile_id = current_profile_id() and has_role('coordinador_departamento')))
  with check (is_informatica_r4() or (coordinator_profile_id = current_profile_id() and has_role('coordinador_departamento')));

comment on policy "departments_update_coordinator_or_admin" on departments is 'Editar: Informática o su coordinador con el rol Coordinador de Departamento. El coordinador no puede cambiar el coordinador (with check exige que siga siendo él): ese campo lo asigna Informática.';

drop policy if exists "department_members_write_coordinator_or_admin" on department_members;
create policy "department_members_write_coordinator_or_admin" on department_members
  for all
  using (is_informatica_r4() or coordinates_department(department_id))
  with check (is_informatica_r4() or coordinates_department(department_id));

drop policy if exists "department_manual_members_write_member_or_admin" on department_manual_members;
create policy "department_manual_members_write_member_or_admin" on department_manual_members
  for all
  using (is_informatica_r4() or is_regional_role() or is_department_member_or_coordinator(department_id))
  with check (is_informatica_r4() or is_regional_role() or is_department_member_or_coordinator(department_id));

drop policy if exists "department_activity_reports_write_member_or_admin" on department_activity_reports;
create policy "department_activity_reports_write_member_or_admin" on department_activity_reports
  for all
  using (is_informatica_r4() or is_regional_role() or is_department_member_or_coordinator(department_id))
  with check (is_informatica_r4() or is_regional_role() or is_department_member_or_coordinator(department_id));

drop policy if exists "calendar_events_update_department" on calendar_events;
create policy "calendar_events_update_department" on calendar_events
  for update
  using (
    department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or coordinates_department(department_id)
      or (created_by_profile_id = current_profile_id() and is_department_member_or_coordinator(department_id))
    )
  )
  with check (department_id is not null and can_work_in_department(department_id));

drop policy if exists "calendar_events_delete_department" on calendar_events;
create policy "calendar_events_delete_department" on calendar_events
  for delete using (
    department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or coordinates_department(department_id)
      or (created_by_profile_id = current_profile_id() and is_department_member_or_coordinator(department_id))
    )
  );

-- ============================================================
-- 3. Rol y departamento sincronizados
-- ============================================================

create or replace function sync_department_roles(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coordinates boolean;
  v_member boolean;
begin
  if p_profile_id is null then
    return;
  end if;
  -- Informática R4: acceso total, y sus roles solo los cambia otro
  -- Informática R4 (protect_super_admin_roles_scopes).
  if exists (select 1 from user_roles where profile_id = p_profile_id and role = 'informatica_r4') then
    return;
  end if;

  v_coordinates := exists (select 1 from departments where coordinator_profile_id = p_profile_id);
  v_member := exists (select 1 from department_members where profile_id = p_profile_id);

  if v_coordinates then
    insert into user_roles (profile_id, role) values (p_profile_id, 'coordinador_departamento')
    on conflict (profile_id, role) do nothing;
  elsif exists (select 1 from user_roles where profile_id = p_profile_id and role <> 'coordinador_departamento') then
    delete from user_roles where profile_id = p_profile_id and role = 'coordinador_departamento';
  end if;

  if v_member then
    insert into user_roles (profile_id, role) values (p_profile_id, 'miembro_departamento')
    on conflict (profile_id, role) do nothing;
  elsif exists (select 1 from user_roles where profile_id = p_profile_id and role <> 'miembro_departamento') then
    delete from user_roles where profile_id = p_profile_id and role = 'miembro_departamento';
  end if;
end;
$$;

comment on function sync_department_roles(uuid) is 'Mantiene los roles Coordinador/Miembro de Departamento de una persona según figure como coordinador o miembro de algún departamento. No quita el rol si es el único que tiene (queda en los pendientes de Informática). No toca a Informática R4.';

create or replace function departments_sync_coordinator_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_department_roles(old.coordinator_profile_id);
    return old;
  end if;
  perform sync_department_roles(new.coordinator_profile_id);
  if tg_op = 'UPDATE' and old.coordinator_profile_id is distinct from new.coordinator_profile_id then
    perform sync_department_roles(old.coordinator_profile_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_departments_sync_coordinator_role on departments;
create trigger trg_departments_sync_coordinator_role
  after insert or delete or update of coordinator_profile_id on departments
  for each row execute function departments_sync_coordinator_role();

create or replace function department_members_sync_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform sync_department_roles(old.profile_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform sync_department_roles(new.profile_id);
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_department_members_sync_role on department_members;
create trigger trg_department_members_sync_role
  after insert or delete or update of profile_id on department_members
  for each row execute function department_members_sync_role();

revoke all on function sync_department_roles(uuid) from public;
revoke all on function sync_department_roles(uuid) from anon;
revoke all on function sync_department_roles(uuid) from authenticated;
revoke all on function departments_sync_coordinator_role() from public;
revoke all on function department_members_sync_role() from public;

-- Quienes ya coordinan o integran un departamento reciben su rol.
do $$
declare
  v_profile uuid;
begin
  for v_profile in
    select coordinator_profile_id from departments where coordinator_profile_id is not null
    union
    select profile_id from department_members
  loop
    perform sync_department_roles(v_profile);
  end loop;
end $$;

-- ============================================================
-- 4. Avisos con origen de departamento
-- ============================================================

alter table notifications add column if not exists department_id uuid references departments(id) on delete set null;
create index if not exists idx_notifications_department on notifications (department_id) where department_id is not null;

comment on column notifications.department_id is 'Departamento de origen del aviso (informes, eventos, avisos del departamento). Solo informativo: quién lo ve lo decide el alcance (profile_id en los avisos de departamento).';

create or replace view my_notifications
with (security_invoker = true) as
select
  n.id,
  n.profile_id,
  n.region_id,
  n.subsede_id,
  n.station_id,
  n.type,
  n.title,
  n.body,
  case
    when n.profile_id is not null then n.is_read
    else exists (
      select 1 from notification_reads r
      where r.notification_id = n.id and r.profile_id = current_profile_id()
    )
  end as is_read,
  n.created_at,
  n.app_update_id,
  n.link_path,
  n.department_id
from notifications n
where n.profile_id = current_profile_id() or n.profile_id is null;

-- Avisos ya enviados: se completa el departamento desde su enlace.
update notifications n set department_id = r.department_id
from department_reports r
where n.department_id is null and n.link_path = '/departamentos/informes/' || r.id::text;

update notifications n set department_id = d.id
from departments d
where n.department_id is null and n.link_path = '/departamentos/' || d.id::text;

update notifications n set department_id = c.department_id
from calendar_events c
where n.department_id is null and c.department_id is not null and n.link_path = '/calendario/' || c.id::text;

-- ============================================================
-- 5. Avisos de departamento
-- ============================================================

-- Destinatarios de un departamento: su coordinador con el rol Coordinador y
-- sus miembros con el rol Miembro (o Informática), activos. Nunca otro
-- departamento.
create or replace function department_recipient_ids(p_department_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.pid
  from (
    select d.coordinator_profile_id as pid
    from departments d
    where d.id = p_department_id
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = d.coordinator_profile_id
          and ur.role in ('coordinador_departamento', 'informatica_r4', 'integrante_informatica')
      )
    union
    select dm.profile_id
    from department_members dm
    where dm.department_id = p_department_id
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = dm.profile_id
          and ur.role in ('miembro_departamento', 'informatica_r4', 'integrante_informatica')
      )
  ) r
  join profiles p on p.id = r.pid and p.is_active
  where r.pid is not null;
$$;

revoke all on function department_recipient_ids(uuid) from public;
revoke all on function department_recipient_ids(uuid) from anon;
revoke all on function department_recipient_ids(uuid) from authenticated;

-- Informe o acta nuevo.
create or replace function notify_department_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select d.name into v_name from departments d where d.id = new.department_id;

  insert into notifications (profile_id, type, title, body, link_path, department_id)
  select pid,
    'informe_departamento'::notification_type,
    'Nuevo informe en ' || v_name || ': ' || new.title,
    'Lo cargó ' || coalesce(new.created_by_name, 'un miembro') || '.',
    '/departamentos/informes/' || new.id::text,
    new.department_id
  from department_recipient_ids(new.department_id) pid
  where pid is distinct from new.created_by_profile_id;

  return new;
end;
$$;

-- Informe archivado o restaurado (a todo el departamento) y edición de un
-- informe por otra persona (solo a su autor).
create or replace function notify_department_report_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_actor uuid := current_profile_id();
  v_actor_name text;
begin
  select d.name into v_name from departments d where d.id = new.department_id;
  select p.full_name into v_actor_name from profiles p where p.id = v_actor;

  if new.is_archived is distinct from old.is_archived then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    select pid,
      'informe_departamento'::notification_type,
      case when new.is_archived then 'Informe archivado en ' else 'Informe restaurado en ' end || v_name || ': ' || new.title,
      case when new.is_archived then 'Lo archivó ' else 'Lo restauró ' end || coalesce(v_actor_name, 'Informática') || '.',
      '/departamentos/informes/' || new.id::text,
      new.department_id
    from department_recipient_ids(new.department_id) pid
    where pid is distinct from v_actor;
  elsif (new.title, new.body, new.observations, new.report_type, new.report_date)
          is distinct from (old.title, old.body, old.observations, old.report_type, old.report_date)
        and new.created_by_profile_id is not null
        and new.created_by_profile_id is distinct from v_actor
        and exists (select 1 from profiles p where p.id = new.created_by_profile_id and p.is_active) then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    values (
      new.created_by_profile_id,
      'informe_departamento',
      'Editaron tu informe en ' || v_name || ': ' || new.title,
      'Lo editó ' || coalesce(v_actor_name, 'Informática') || '.',
      '/departamentos/informes/' || new.id::text,
      new.department_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_department_report_changed on department_reports;
create trigger trg_notify_department_report_changed
  after update on department_reports
  for each row execute function notify_department_report_changed();

-- Actividad registrada (reunión, capacitación... con horas y asistentes).
create or replace function notify_department_activity_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select d.name into v_name from departments d where d.id = new.department_id;
  insert into notifications (profile_id, type, title, body, link_path, department_id)
  select pid,
    'aviso_departamento'::notification_type,
    'Actividad registrada en ' || v_name || ': ' || new.title,
    'Fecha: ' || to_char(new.activity_date, 'DD/MM/YYYY') || '.',
    '/departamentos/' || new.department_id::text,
    new.department_id
  from department_recipient_ids(new.department_id) pid
  where pid is distinct from coalesce(new.created_by_profile_id, current_profile_id());
  return new;
end;
$$;

drop trigger if exists trg_notify_department_activity_created on department_activity_reports;
create trigger trg_notify_department_activity_created
  after insert on department_activity_reports
  for each row execute function notify_department_activity_created();

-- Te sumaron a un departamento (y su coordinador se entera).
create or replace function notify_department_member_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department record;
  v_member_name text;
  v_actor uuid := current_profile_id();
begin
  select d.id, d.name, d.coordinator_profile_id into v_department from departments d where d.id = new.department_id;
  select p.full_name into v_member_name from profiles p where p.id = new.profile_id;

  if new.profile_id is distinct from v_actor and exists (select 1 from profiles p where p.id = new.profile_id and p.is_active) then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    values (
      new.profile_id,
      'aviso_departamento',
      'Te sumaron a ' || v_department.name,
      'Desde ahora ves sus informes, eventos y avisos.',
      '/departamentos/' || new.department_id::text,
      new.department_id
    );
  end if;

  if v_department.coordinator_profile_id is not null
     and v_department.coordinator_profile_id is distinct from v_actor
     and v_department.coordinator_profile_id is distinct from new.profile_id
     and v_department.coordinator_profile_id in (select department_recipient_ids(new.department_id)) then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    values (
      v_department.coordinator_profile_id,
      'aviso_departamento',
      'Nuevo miembro en ' || v_department.name || ': ' || coalesce(v_member_name, 'un usuario'),
      'Lo sumaron como miembro del departamento.',
      '/departamentos/' || new.department_id::text,
      new.department_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_department_member_added on department_members;
create trigger trg_notify_department_member_added
  after insert on department_members
  for each row execute function notify_department_member_added();

-- Ahora coordinás un departamento.
create or replace function notify_department_coordinator_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coordinator_profile_id is not null
     and (tg_op = 'INSERT' or new.coordinator_profile_id is distinct from old.coordinator_profile_id)
     and new.coordinator_profile_id is distinct from current_profile_id()
     and exists (select 1 from profiles p where p.id = new.coordinator_profile_id and p.is_active) then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    values (
      new.coordinator_profile_id,
      'aviso_departamento',
      'Ahora coordinás ' || new.name,
      'Podés gestionar sus datos, miembros, informes, eventos y avisos.',
      '/departamentos/' || new.id::text,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_department_coordinator_assigned on departments;
create trigger trg_notify_department_coordinator_assigned
  after insert or update of coordinator_profile_id on departments
  for each row execute function notify_department_coordinator_assigned();

-- Aval nuevo del departamento: al coordinador (los miembros no ven avales).
create or replace function notify_department_aval_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department record;
begin
  select d.id, d.name, d.coordinator_profile_id into v_department from departments d where d.id = new.department_id;
  if v_department.coordinator_profile_id is not null
     and v_department.coordinator_profile_id is distinct from new.uploaded_by_profile_id
     and exists (
       select 1 from user_roles ur
       where ur.profile_id = v_department.coordinator_profile_id
         and ur.role in ('coordinador_departamento', 'informatica_r4', 'integrante_informatica')
     )
     and exists (select 1 from profiles p where p.id = v_department.coordinator_profile_id and p.is_active) then
    insert into notifications (profile_id, type, title, body, link_path, department_id)
    values (
      v_department.coordinator_profile_id,
      'aviso_departamento',
      'Nuevo aval de ' || v_department.name || ': ' || new.title,
      'Lo cargó ' || coalesce(new.uploaded_by_name, 'la Escuela') || '.',
      '/escuela/avales?departamento=' || new.department_id::text,
      new.department_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_department_aval_created on school_avales_documents;
create trigger trg_notify_department_aval_created
  after insert on school_avales_documents
  for each row execute function notify_department_aval_created();

revoke all on function notify_department_report_changed() from public;
revoke all on function notify_department_activity_created() from public;
revoke all on function notify_department_member_added() from public;
revoke all on function notify_department_coordinator_assigned() from public;
revoke all on function notify_department_aval_created() from public;

-- Eventos de departamento (0103): mismos destinatarios con rol y origen.
create or replace function notify_calendar_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_region_id uuid;
  v_name text;
begin
  if new.notify_on_create then
    if new.department_id is not null then
      select d.name into v_name from departments d where d.id = new.department_id;
      insert into notifications (profile_id, type, title, body, link_path, department_id)
      select pid,
        'actividad_proxima'::notification_type,
        'Nuevo evento de ' || v_name || ': ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.',
        '/calendario/' || new.id::text,
        new.department_id
      from department_recipient_ids(new.department_id) pid
      where pid is distinct from new.created_by_profile_id;
    elsif new.region_id is null and new.subsede_id is null and new.station_id is null then
      -- Eventos de escuela/capacitacion: sin alcance territorial propio; el
      -- aviso usa la Regional de quien lo creó (0087).
      select region_id into v_creator_region_id from profiles where id = new.created_by_profile_id;
      v_creator_region_id := coalesce(v_creator_region_id, (select id from regions where code = 'R4' limit 1));

      insert into notifications (region_id, type, title, body)
      values (
        v_creator_region_id,
        'actividad_proxima',
        'Nuevo evento: ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    else
      insert into notifications (region_id, subsede_id, station_id, type, title, body)
      values (
        new.region_id,
        new.subsede_id,
        new.station_id,
        'actividad_proxima',
        'Nuevo evento: ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function send_calendar_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_creator_region_id uuid;
  v_name text;
begin
  for v_event in
    select id, title, starts_at, region_id, subsede_id, station_id, department_id, created_by_profile_id
    from calendar_events
    where status = 'programado'
      and notify_before_minutes is not null
      and reminder_sent_at is null
      and starts_at > now()
      and starts_at <= now() + (notify_before_minutes || ' minutes')::interval
  loop
    if v_event.department_id is not null then
      select d.name into v_name from departments d where d.id = v_event.department_id;
      insert into notifications (profile_id, type, title, body, link_path, department_id)
      select pid,
        'actividad_proxima'::notification_type,
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" de ' || v_name || ' es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.',
        '/calendario/' || v_event.id::text,
        v_event.department_id
      from department_recipient_ids(v_event.department_id) pid;
    elsif v_event.region_id is null and v_event.subsede_id is null and v_event.station_id is null then
      select region_id into v_creator_region_id from profiles where id = v_event.created_by_profile_id;
      v_creator_region_id := coalesce(v_creator_region_id, (select id from regions where code = 'R4' limit 1));

      insert into notifications (region_id, type, title, body)
      values (
        v_creator_region_id,
        'actividad_proxima',
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    else
      insert into notifications (region_id, subsede_id, station_id, type, title, body)
      values (
        v_event.region_id,
        v_event.subsede_id,
        v_event.station_id,
        'actividad_proxima',
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    end if;

    update calendar_events set reminder_sent_at = now() where id = v_event.id;
  end loop;
end;
$$;

-- Aviso manual a todo el departamento (0103): destinatarios con rol, origen
-- y el tipo "Aviso de departamento".
create or replace function notify_department(p_department_id uuid, p_type notification_type, p_title text, p_body text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := current_profile_id();
  v_count integer;
begin
  if v_me is null or not can_notify_department(p_department_id) then
    raise exception 'Solo el coordinador del departamento, el Secretario Regional o Informática pueden avisar a todo el departamento.' using errcode = '42501';
  end if;
  if not exists (select 1 from departments d where d.id = p_department_id and d.is_active) then
    raise exception 'El departamento está inactivo: no se pueden enviar avisos.' using errcode = 'P0001';
  end if;
  if p_type not in ('aviso_departamento', 'curso_nuevo', 'circular_nueva', 'asistencia_pendiente', 'estadisticas_nuevas', 'cambio_estado', 'actividad_proxima', 'documento_actualizado', 'reporte_generado') then
    raise exception 'Ese tipo de aviso no se puede enviar a un departamento.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Falta el título del aviso.' using errcode = '22023';
  end if;

  insert into notifications (profile_id, type, title, body, link_path, department_id)
  select pid, p_type, left(btrim(p_title), 200), nullif(btrim(coalesce(p_body, '')), ''), '/departamentos/' || p_department_id::text, p_department_id
  from department_recipient_ids(p_department_id) pid
  where pid <> v_me;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 6. Pendientes del Inicio: departamentos con rol y roles sin departamento
-- ============================================================
-- Misma función que en 0103; cambia la sección 8 (departamentos de cada uno
-- con su rol) y se suman dos pendientes de Informática a la sección 9.

create or replace function get_pending_items()
 RETURNS TABLE(item_key text, title text, description text, priority text, module text, link_path text, sort_key timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := is_informatica_r4();
  v_is_regional boolean := is_regional_role();
  v_is_escuela boolean := is_escuela_role();
  v_profile_id uuid := current_profile_id();
begin
  -- ============================================================
  -- 1. Semaforo de cuarteles en rojo/amarillo (station_compliance,
  --    migracion 0052) -- ya viene scopeado solo (security_invoker=true,
  --    hereda RLS real de stations vía stations_select_scope), asi que acá
  --    no hace falta agregar ningun filtro de alcance adicional: lo que
  --    devuelve station_compliance YA es exactamente lo que este usuario
  --    puede ver.
  -- ============================================================
  return query
  select
    'compliance_' || sc.station_id::text,
    case when sc.compliance_status = 'rojo' then 'Cuartel desactualizado: ' || sc.station_name
         else 'Cuartel con carga parcial: ' || sc.station_name end,
    case
      when not sc.has_contact_info then 'Falta cargar contacto institucional (teléfono o email).'
      when not sc.has_personnel then 'Falta cargar personal activo.'
      when not sc.has_vehicles then 'Falta cargar vehículos.'
      when not sc.attendance_recent then 'Sin asistencia registrada en los últimos 45 días.'
      when not sc.interventions_recent then 'Sin intervenciones registradas en los últimos 45 días.'
      else 'Sin documentos institucionales cargados.'
    end,
    case when sc.compliance_status = 'rojo' then 'alta' else 'media' end,
    'Cuarteles',
    '/cuarteles/' || sc.station_id::text,
    sc.last_relevant_update_at
  from station_compliance sc
  where sc.compliance_status in ('rojo', 'amarillo');

  -- ============================================================
  -- 2. Solicitudes de préstamo pendientes de aprobar -- solo para quien
  --    puede aprobarlas: admin, is_regional_role(), o responsable puntual
  --    del elemento/la solicitud (mismo criterio que
  --    inventory_loan_requests_update_managers, migración 0057).
  -- ============================================================
  return query
  select
    'loan_pending_' || l.id::text,
    'Solicitud de préstamo pendiente: ' || i.name,
    'Solicitada por ' || s.name || '. Requiere aprobación o rechazo.',
    'media',
    'Solicitudes de Préstamo',
    '/inventario/solicitudes/' || l.id::text,
    l.requested_from
  from inventory_loan_requests l
  join inventory_items i on i.id = l.inventory_item_id
  join stations s on s.id = l.requesting_station_id
  where l.status = 'pendiente'
    and (
      v_is_admin
      or v_is_regional
      or i.responsible_profile_id = v_profile_id
      or l.responsible_profile_id = v_profile_id
    );

  -- ============================================================
  -- 3. Préstamos retirados por vencer (próximas 48hs) o ya vencidos --
  --    mismo criterio de destinatarios que send_loan_return_reminders()
  --    (migración 0068): el cuartel solicitante y el responsable puntual.
  --    Acá se agranda un poco la ventana de "por vencer" (48hs en vez de
  --    24hs) porque este panel no es un recordatorio en el momento exacto,
  --    es una foto de "qué falta resolver" que alguien puede mirar en
  --    cualquier momento del día.
  -- ============================================================
  return query
  select
    'loan_overdue_' || l.id::text,
    case when l.expected_return_at < now() then 'Préstamo vencido: ' || i.name
         else 'Préstamo por vencer: ' || i.name end,
    case when l.expected_return_at < now()
      then 'Venció el ' || to_char(l.expected_return_at, 'DD/MM/YYYY HH24:MI') || ' y sigue sin devolverse.'
      else 'Vence el ' || to_char(l.expected_return_at, 'DD/MM/YYYY HH24:MI') || '.'
    end,
    case when l.expected_return_at < now() then 'alta' else 'media' end,
    'Solicitudes de Préstamo',
    '/inventario/solicitudes/' || l.id::text,
    l.expected_return_at
  from inventory_loan_requests l
  join inventory_items i on i.id = l.inventory_item_id
  join stations s on s.id = l.requesting_station_id
  where l.status = 'retirada'
    and l.expected_return_at is not null
    and l.expected_return_at <= now() + interval '48 hours'
    and (
      v_is_admin
      or v_is_regional
      or s.id in (select my_station_ids())
      or i.responsible_profile_id = v_profile_id
      or l.responsible_profile_id = v_profile_id
    );

  -- ============================================================
  -- 4. Eventos de calendario próximos (siguientes 7 días, no cancelados)
  --    dentro del alcance del usuario: su cuartel, su región (si es rol
  --    regional/escuela), o eventos de escuela/capacitación (regional-wide
  --    por definición, visibles para cualquiera). Admin ve todos los
  --    próximos.
  -- ============================================================
  return query
  select
    'event_' || c.id::text,
    'Evento próximo: ' || c.title,
    to_char(c.starts_at, 'DD/MM') || case when c.all_day then ' · todo el día' else ' · ' || to_char(c.starts_at, 'HH24:MI') end,
    'baja',
    'Calendario',
    '/calendario/' || c.id::text,
    c.starts_at
  from calendar_events c
  where c.status = 'programado'
    and c.starts_at between now() and now() + interval '7 days'
    and (
      -- Eventos de departamento (0103): solo para su coordinador e
      -- integrantes, aun para Informática (no son pendientes de todos).
      (c.department_id is not null and c.department_id in (select my_department_ids()))
      or (
        c.department_id is null
        and (
          v_is_admin
          or c.event_type in ('escuela', 'capacitacion')
          or (v_is_regional and c.region_id in (select my_region_ids()))
          or (v_is_escuela and c.region_id in (select my_region_ids()))
          or c.station_id in (select my_station_ids())
        )
      )
    );

  -- ============================================================
  -- 5. Documentos "pending" (fila creada, archivo nunca terminó de subir,
  --    ver createDocument/DocumentoFormPage.tsx) de más de 24hs -- mismo
  --    umbral que cleanup_pending_documents() (migración 0033). Solo
  --    informática puede limpiarlos, así que solo a informática le
  --    interesa como pendiente accionable.
  -- ============================================================
  if v_is_admin then
    return query
    select
      'doc_pending_' || d.id::text,
      'Documento sin archivo subido: ' || d.title,
      'Carga interrumpida hace más de 24hs. Revisar o limpiar desde Documentos.',
      'baja',
      'Documentos',
      '/documentos',
      d.created_at
    from documents d
    where d.storage_path = 'pending'
      and d.deleted_at is null
      and d.created_at < now() - interval '24 hours';
  end if;

  -- ============================================================
  -- 6. Informática: usuarios creados en los últimos 7 días (para revisar
  --    que el alta quedó bien: rol/alcance correctos) y cuarteles sin
  --    ninguna actividad relevante hace más de 30 días (mismo criterio que
  --    el resumen semanal admin, migración 0067 -- reutiliza
  --    last_relevant_update_at de station_compliance en vez de duplicar el
  --    cálculo).
  -- ============================================================
  if v_is_admin then
    return query
    select
      'new_user_' || p.id::text,
      'Usuario nuevo: ' || p.full_name,
      'Creado el ' || to_char(p.created_at, 'DD/MM/YYYY') || '. Confirmar rol y alcance asignados.',
      'baja',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active = true
      and p.created_at >= now() - interval '7 days';

    return query
    select
      'stale_station_' || sc.station_id::text,
      'Cuartel sin actividad reciente: ' || sc.station_name,
      'Sin asistencia, intervenciones ni documentos nuevos hace más de 30 días.',
      'media',
      'Cuarteles',
      '/cuarteles/' || sc.station_id::text,
      sc.last_relevant_update_at
    from station_compliance sc
    where sc.last_relevant_update_at < now() - interval '30 days';
  end if;

  -- ============================================================
  -- 7. Escuela: cursos planificados/en curso con fecha de inicio ya pasada
  --    sin haber pasado a finalizado/cancelado (indicio de que falta
  --    actualizar el estado o cargar asistencia real).
  -- ============================================================
  if v_is_admin or v_is_escuela then
    return query
    select
      'course_stale_' || co.id::text,
      'Curso sin actualizar: ' || co.title,
      case
        when co.status = 'planificado' and co.start_date < current_date then 'La fecha de inicio ya pasó y sigue como "planificado".'
        else 'Sigue "en curso" con fecha de fin ya pasada.'
      end,
      'baja',
      'Escuela',
      '/escuela',
      co.updated_at
    from courses co
    where (
      (co.status = 'planificado' and co.start_date is not null and co.start_date < current_date)
      or (co.status = 'en_curso' and co.end_date is not null and co.end_date < current_date)
    );
  end if;

  -- ============================================================
  -- 8. Departamentos: departamentos donde el usuario es coordinador o
  --    miembro, sin ningún informe de actividad cargado en los últimos 30
  --    días. Admin/is_regional_role() (autoridad total sobre
  --    Departamentos) ven esto para TODOS los departamentos activos, no
  --    solo los propios.
  -- ============================================================
  return query
  select
    'dept_stale_' || d.id::text,
    'Departamento sin actividad reciente: ' || d.name,
    'Sin informes de actividad cargados en los últimos 30 días.',
    'baja',
    'Departamentos',
    '/departamentos/' || d.id::text,
    coalesce((select max(r.created_at) from department_activity_reports r where r.department_id = d.id), d.created_at)
  from departments d
  where d.is_active = true
    and not exists (
      select 1 from department_activity_reports r
      where r.department_id = d.id and r.created_at >= now() - interval '30 days'
    )
    and (
      v_is_admin
      or v_is_regional
      -- Coordinador o miembro con su rol (0106).
      or d.id in (select my_department_ids())
    );

  -- ============================================================
  -- 9. Informática: roles sin su división (0103). Un rol de cuartel sin
  --    cuartel, o un rol de la Regional sin Regional, no ve los datos que le
  --    corresponden. Un departamento activo sin coordinador no tiene quién
  --    lo gestione ni reciba sus avisos.
  -- ============================================================
  if v_is_admin then
    return query
    select
      'role_no_station_' || p.id::text,
      'Rol de cuartel sin cuartel: ' || p.full_name,
      'Tiene un rol de cuartel pero ningún cuartel asignado: no ve los datos de ningún cuartel.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = p.id
          and ur.role in ('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'invitado')
      )
      and p.station_id is null
      and not exists (
        select 1 from user_scopes us
        where us.profile_id = p.id and (us.station_id is not null or us.subsede_id is not null)
      );

    return query
    select
      'role_no_region_' || p.id::text,
      'Rol regional sin Regional: ' || p.full_name,
      'Tiene un rol de la Regional o de la Escuela pero ninguna Regional asignada.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = p.id and ur.role in ('secretario_regional', 'director_escuela', 'instructor')
      )
      and p.region_id is null
      and not exists (select 1 from user_scopes us where us.profile_id = p.id and us.region_id is not null);

    return query
    select
      'dept_no_coordinator_' || d.id::text,
      'Departamento sin coordinador: ' || d.name,
      'Asignale un coordinador para que alguien lo gestione y reciba sus avisos.',
      'media',
      'Departamentos',
      '/departamentos/' || d.id::text,
      d.created_at
    from departments d
    where d.is_active and d.coordinator_profile_id is null;

    -- Roles de departamento (0106): con rol y sin departamento (no ven
    -- ningún departamento), o en un departamento sin su rol (no tienen
    -- acceso a ese departamento).
    return query
    select
      'dept_role_without_department_' || p.id::text,
      'Rol de departamento sin departamento: ' || p.full_name,
      'Tiene el rol Coordinador o Miembro de Departamento pero no figura en ningún departamento con ese rol.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and (
        (
          exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'coordinador_departamento')
          and not exists (select 1 from departments d where d.coordinator_profile_id = p.id)
        )
        or (
          exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'miembro_departamento')
          and not exists (select 1 from department_members dm where dm.profile_id = p.id)
        )
      );

    return query
    select
      'dept_without_role_' || p.id::text,
      'Figura en un departamento sin su rol: ' || p.full_name,
      'Está asignado a un departamento pero no tiene el rol Coordinador o Miembro de Departamento: no ve ese departamento.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role in ('informatica_r4', 'integrante_informatica'))
      and (
        (
          exists (select 1 from departments d where d.coordinator_profile_id = p.id)
          and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'coordinador_departamento')
        )
        or (
          exists (select 1 from department_members dm where dm.profile_id = p.id)
          and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'miembro_departamento')
        )
      );
  end if;
end;
$function$;
