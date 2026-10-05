-- SIGER4 - Roles por división: alcance de Departamentos, calendario e
-- historial de cuarteles
--
-- Modelo (sin tablas nuevas, cada dato tiene una sola fuente):
--   - Rol (qué puede hacer): user_roles.
--   - División (dónde lo hace):
--       Informática        -> todo el sistema;
--       Regional / Escuela -> la Regional (profiles.region_id, user_scopes);
--       Cuartel            -> el cuartel (profiles.station_id, user_scopes);
--       Departamento       -> departments.coordinator_profile_id (coordinador)
--                             y department_members (integrantes).
--   - Alcance (qué datos ve): lo deciden las policies con los helpers de
--     abajo y los que ya existían (my_station_ids(), my_region_ids(),
--     my_subsede_ids()).
--
-- Qué cambia:
--   1. Helpers de departamento: my_department_ids(), can_view_department(),
--      can_work_in_department(), can_notify_department().
--   2. Departamentos, integrantes, integrantes sin usuario y registro de
--      actividad dejan de ser legibles por cualquier usuario: los ve su
--      coordinador, sus integrantes y los roles con visión regional
--      (Informática, Secretario Regional y Director de Escuela, los mismos
--      que ya generan los reportes de Departamentos).
--   3. department_member_directory(): nombre, cuartel y contacto de los
--      integrantes para quien ve el departamento (profiles está limitado por
--      cuartel y la ficha quedaba sin datos de integrantes de otro cuartel).
--   4. list_visible_departments(): departamentos visibles con coordinador,
--      cantidad de integrantes y la relación del usuario con cada uno.
--   5. Calendario: eventos de departamento (calendar_events.department_id) y
--      lectura por alcance. Antes cualquier usuario veía los eventos de todos
--      los cuarteles. Ahora: los de su cuartel, su subsede y su Regional, los
--      de Escuela y capacitación (toda la Regional), y los de sus
--      departamentos. Los roles regionales y de Escuela siguen viendo los de
--      toda su Regional.
--   6. Avisos y recordatorios de eventos de departamento: solo al coordinador
--      y a los integrantes, nunca a toda la Regional.
--   7. Historial institucional de cuarteles: con el mismo alcance que el
--      cuartel (antes era legible por cualquier usuario).
--   8. notify_department(): aviso del coordinador (o Informática / Secretario
--      Regional) a su departamento, como notificación personal a cada
--      integrante (el push sale por el envío que ya existe).
--   9. get_pending_items(): eventos de departamento solo para su gente y,
--      para Informática, usuarios con un rol sin su división y
--      departamentos sin coordinador.
--  10. coordinating_profile_ids(): para que las pantallas del Jefe de Cuerpo
--      Activo sigan ocultando a los coordinadores de su cuartel.
--
-- Requiere 0102. Se puede volver a correr.

-- Los textos tienen tildes: si se corre con psql desde una consola de Windows,
-- esto evita que se guarden mal codificados. En el SQL Editor no cambia nada.
set client_encoding = 'UTF8';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'link_path'
  ) then
    raise exception 'Falta la migración 0102 (notifications.link_path). Correla antes que esta.';
  end if;
  if to_regclass('public.department_reports') is null then
    raise exception 'Falta la migración 0098 (department_reports). Correla antes que esta.';
  end if;
end $$;

-- ============================================================
-- 1. Helpers
-- ============================================================

create or replace function is_department_member_or_coordinator(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and current_profile_id() is not null
    and (
      exists (select 1 from departments d where d.id = p_department_id and d.coordinator_profile_id = current_profile_id())
      or exists (select 1 from department_members dm where dm.department_id = p_department_id and dm.profile_id = current_profile_id())
    );
$$;

comment on function is_department_member_or_coordinator(uuid) is 'true si el usuario es el coordinador (departments.coordinator_profile_id) o un integrante con cuenta (department_members) del departamento. current_profile_id() es null para perfiles inactivos.';

create or replace function my_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id from departments d where d.coordinator_profile_id = current_profile_id()
  union
  select dm.department_id from department_members dm where dm.profile_id = current_profile_id();
$$;

comment on function my_department_ids() is 'Departamentos del usuario: los que coordina y los que integra.';

create or replace function can_view_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or has_role('director_escuela')
      or is_department_member_or_coordinator(p_department_id)
    );
$$;

comment on function can_view_department(uuid) is 'Ver un departamento (datos, integrantes, integrantes sin usuario, actividad y eventos): Informática, Secretario Regional y Director de Escuela (visión regional, los mismos que generan los reportes de Departamentos), o su coordinador e integrantes. Los informes y actas (0098) siguen con su propia regla: can_view_department_reports().';

create or replace function can_work_in_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or is_department_member_or_coordinator(p_department_id)
    );
$$;

comment on function can_work_in_department(uuid) is 'Cargar en un departamento (eventos): Informática, Secretario Regional (ya edita actividad e integrantes sin usuario desde 0061/0062), su coordinador o sus integrantes.';

create or replace function can_notify_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or exists (select 1 from departments d where d.id = p_department_id and d.coordinator_profile_id = current_profile_id())
    );
$$;

comment on function can_notify_department(uuid) is 'Avisar a todo un departamento: Informática, Secretario Regional o su coordinador.';

-- Regionales del usuario: las propias (perfil y alcances) más las de sus
-- cuarteles y subsedes. Un usuario creado por un Jefe de Cuerpo Activo no
-- tiene region_id en el perfil, pero su cuartel sí pertenece a una Regional.
create or replace function my_effective_region_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r from my_region_ids() r
  union
  select s.region_id from stations s where s.id in (select my_station_ids())
  union
  select sb.region_id from subsedes sb where sb.id in (select my_subsede_ids());
$$;

-- ============================================================
-- 2. Departamentos: lectura por división
-- ============================================================

drop policy if exists "departments_select_authenticated" on departments;
drop policy if exists "departments_select_scoped" on departments;
create policy "departments_select_scoped" on departments
  for select using (can_view_department(id));

comment on policy "departments_select_scoped" on departments is 'Ve el departamento su coordinador, sus integrantes, Informática, Secretario Regional y Director de Escuela. Avales regionales usa list_school_avales_departments(), con su propia regla.';

drop policy if exists "department_members_select_authenticated" on department_members;
drop policy if exists "department_members_select_scoped" on department_members;
create policy "department_members_select_scoped" on department_members
  for select using (profile_id = current_profile_id() or can_view_department(department_id));

drop policy if exists "department_manual_members_select_authenticated" on department_manual_members;
drop policy if exists "department_manual_members_select_scoped" on department_manual_members;
create policy "department_manual_members_select_scoped" on department_manual_members
  for select using (can_view_department(department_id));

drop policy if exists "department_activity_reports_select_authenticated" on department_activity_reports;
drop policy if exists "department_activity_reports_select_scoped" on department_activity_reports;
create policy "department_activity_reports_select_scoped" on department_activity_reports
  for select using (can_view_department(department_id));

-- ============================================================
-- 3. Directorio de integrantes
-- ============================================================

create or replace function department_member_directory(p_department_id uuid)
returns table (
  member_id uuid,
  profile_id uuid,
  full_name text,
  rank text,
  email text,
  phone text,
  station_id uuid,
  station_name text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select dm.id, p.id, p.full_name, p.rank, p.email, p.phone, p.station_id, s.name, p.is_active
  from department_members dm
  join profiles p on p.id = dm.profile_id
  left join stations s on s.id = p.station_id
  where dm.department_id = p_department_id
    and can_view_department(p_department_id)
  order by p.full_name;
$$;

comment on function department_member_directory(uuid) is 'Integrantes con cuenta de un departamento (nombre, jerarquía, contacto y cuartel) para quien puede ver el departamento. Vacío para el resto.';

revoke all on function department_member_directory(uuid) from public;
revoke all on function department_member_directory(uuid) from anon;
grant execute on function department_member_directory(uuid) to authenticated;

-- ============================================================
-- 4. Departamentos visibles, con coordinador y relación del usuario
-- ============================================================

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
      when d.coordinator_profile_id is not null and d.coordinator_profile_id = current_profile_id() then 'coordinador'
      when exists (select 1 from department_members dm where dm.department_id = d.id and dm.profile_id = current_profile_id()) then 'integrante'
      else null
    end
  from departments d
  left join profiles c on c.id = d.coordinator_profile_id
  where can_view_department(d.id)
  order by d.name;
$$;

comment on function list_visible_departments() is 'Departamentos que el usuario puede ver, con el nombre del coordinador, la cantidad de integrantes con cuenta y su relación: coordinador, integrante o null (visión regional).';

revoke all on function list_visible_departments() from public;
revoke all on function list_visible_departments() from anon;
grant execute on function list_visible_departments() to authenticated;

-- ============================================================
-- 5. Calendario: eventos de departamento y lectura por alcance
-- ============================================================

alter table calendar_events add column if not exists department_id uuid references departments(id) on delete cascade;
create index if not exists idx_calendar_events_department on calendar_events (department_id) where department_id is not null;

comment on column calendar_events.department_id is 'Evento de un departamento: lo ven y reciben su coordinador e integrantes (más Informática, Secretario Regional y Director de Escuela). Sin alcance territorial propio.';

-- Un evento de departamento no lleva Regional, subsede ni cuartel. El resto
-- mantiene la regla de 0051.
alter table calendar_events drop constraint if exists calendar_events_single_scope;
alter table calendar_events add constraint calendar_events_single_scope check (
  (
    department_id is not null
    and region_id is null and subsede_id is null and station_id is null
  )
  or (
    department_id is null
    and (
      (event_type in ('escuela', 'capacitacion') and region_id is null and subsede_id is null and station_id is null)
      or (
        event_type not in ('escuela', 'capacitacion')
        and ((region_id is not null)::int + (subsede_id is not null)::int + (station_id is not null)::int) = 1
      )
    )
  )
);

-- Autor del evento: lo completa la base (el formulario nunca lo enviaba). En
-- los eventos de departamento es quien lo carga, para que pueda editarlo.
create or replace function calendar_events_set_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.department_id is not null and not is_informatica_r4() then
      new.created_by_profile_id := current_profile_id();
    else
      new.created_by_profile_id := coalesce(new.created_by_profile_id, current_profile_id());
    end if;
  else
    new.created_by_profile_id := old.created_by_profile_id;
  end if;
  return new;
end;
$$;

revoke all on function calendar_events_set_creator() from public;
revoke all on function calendar_events_set_creator() from anon;
revoke all on function calendar_events_set_creator() from authenticated;

drop trigger if exists trg_calendar_events_set_creator on calendar_events;
create trigger trg_calendar_events_set_creator
  before insert or update on calendar_events
  for each row execute function calendar_events_set_creator();

drop policy if exists "calendar_events_select_authenticated" on calendar_events;
drop policy if exists "calendar_events_select_scoped" on calendar_events;
create policy "calendar_events_select_scoped" on calendar_events
  for select using (
    current_profile_id() is not null
    and (
      is_informatica_r4()
      or (department_id is not null and can_view_department(department_id))
      or (
        department_id is null
        and (
          event_type in ('escuela', 'capacitacion')
          or region_id in (select my_effective_region_ids())
          or station_id in (select my_station_ids())
          or subsede_id in (select my_subsede_ids())
          or subsede_id in (select s.subsede_id from stations s where s.id in (select my_station_ids()))
          or station_id in (select s.id from stations s where s.subsede_id in (select my_subsede_ids()))
          or (
            (is_regional_role() or is_escuela_role())
            and (
              station_id in (select s.id from stations s where s.region_id in (select my_region_ids()))
              or subsede_id in (select sb.id from subsedes sb where sb.region_id in (select my_region_ids()))
            )
          )
        )
      )
    )
  );

comment on policy "calendar_events_select_scoped" on calendar_events is 'Con sesión de un perfil activo: eventos de su cuartel, su subsede y su Regional; Escuela y capacitación para toda la Regional; los de sus departamentos. Roles regionales y de Escuela: todos los de su Regional. Informática: todos.';

-- Eventos de departamento: además de las policies permisivas, una barrera
-- restrictiva para que ninguna otra regla (por ejemplo la de Escuela para
-- eventos de capacitación) los abra fuera del departamento.
drop policy if exists "calendar_events_department_read" on calendar_events;
create policy "calendar_events_department_read" on calendar_events
  as restrictive for select using (department_id is null or can_view_department(department_id));

drop policy if exists "calendar_events_department_insert_guard" on calendar_events;
create policy "calendar_events_department_insert_guard" on calendar_events
  as restrictive for insert with check (department_id is null or can_work_in_department(department_id));

drop policy if exists "calendar_events_department_update_guard" on calendar_events;
create policy "calendar_events_department_update_guard" on calendar_events
  as restrictive for update
  using (department_id is null or can_work_in_department(department_id))
  with check (department_id is null or can_work_in_department(department_id));

drop policy if exists "calendar_events_department_delete_guard" on calendar_events;
create policy "calendar_events_department_delete_guard" on calendar_events
  as restrictive for delete using (department_id is null or can_work_in_department(department_id));

-- Quién carga y gestiona eventos de departamento: cualquier integrante o el
-- coordinador los crea (departamento activo); los edita o borra quien lo
-- cargó, el coordinador, Secretario Regional o Informática.
drop policy if exists "calendar_events_insert_department" on calendar_events;
create policy "calendar_events_insert_department" on calendar_events
  for insert with check (
    department_id is not null
    and can_work_in_department(department_id)
    and exists (select 1 from departments d where d.id = department_id and d.is_active)
  );

drop policy if exists "calendar_events_update_department" on calendar_events;
create policy "calendar_events_update_department" on calendar_events
  for update
  using (
    department_id is not null
    and (
      is_informatica_r4()
      or is_regional_role()
      or exists (select 1 from departments d where d.id = department_id and d.coordinator_profile_id = current_profile_id())
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
      or exists (select 1 from departments d where d.id = department_id and d.coordinator_profile_id = current_profile_id())
      or (created_by_profile_id = current_profile_id() and is_department_member_or_coordinator(department_id))
    )
  );

-- ============================================================
-- 6. Avisos de eventos de departamento: solo a su gente
-- ============================================================

create or replace function notify_calendar_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_region_id uuid;
begin
  if new.notify_on_create then
    if new.department_id is not null then
      -- Evento de departamento: aviso personal al coordinador y a los
      -- integrantes activos, salvo a quien lo cargó. Nunca a la Regional.
      insert into notifications (profile_id, type, title, body, link_path)
      select distinct r.pid,
        'actividad_proxima'::notification_type,
        'Nuevo evento de ' || d.name || ': ' || new.title,
        'Se agendó "' || new.title || '" para el ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI') || '.',
        '/calendario/' || new.id::text
      from departments d
      join lateral (
        select d.coordinator_profile_id as pid
        union
        select dm.profile_id from department_members dm where dm.department_id = d.id
      ) r on true
      join profiles p on p.id = r.pid and p.is_active
      where d.id = new.department_id
        and r.pid is not null
        and r.pid is distinct from new.created_by_profile_id;
    elsif new.region_id is null and new.subsede_id is null and new.station_id is null then
      -- Eventos de escuela/capacitacion no llevan alcance territorial propio
      -- (regional-wide por definicion, ver calendar_events_single_scope) --
      -- para que la notificacion asociada siga cumpliendo
      -- notifications_scope_not_ambiguous (0087, exige exactamente una fuente
      -- de alcance), se usa la region del perfil que creo el evento como
      -- alcance de la notificacion. Si no se puede resolver (perfil sin
      -- region, o created_by_profile_id null), cae a Regional 4 (unica region
      -- del sistema hoy).
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
      insert into notifications (profile_id, type, title, body, link_path)
      select distinct r.pid,
        'actividad_proxima'::notification_type,
        'Recordatorio: ' || v_event.title,
        'El evento "' || v_event.title || '" de ' || d.name || ' es el ' || to_char(v_event.starts_at, 'DD/MM/YYYY HH24:MI') || '.',
        '/calendario/' || v_event.id::text
      from departments d
      join lateral (
        select d.coordinator_profile_id as pid
        union
        select dm.profile_id from department_members dm where dm.department_id = d.id
      ) r on true
      join profiles p on p.id = r.pid and p.is_active
      where d.id = v_event.department_id
        and r.pid is not null;
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

-- ============================================================
-- 7. Historial institucional: mismo alcance que el cuartel
-- ============================================================

drop policy if exists "station_history_events_select_authenticated" on station_history_events;
drop policy if exists "station_history_events_select_scoped" on station_history_events;
create policy "station_history_events_select_scoped" on station_history_events
  for select using (exists (select 1 from stations s where s.id = station_history_events.station_id));

comment on policy "station_history_events_select_scoped" on station_history_events is 'El historial de un cuartel lo ve quien ve el cuartel: la subconsulta a stations aplica stations_select_scope.';

-- ============================================================
-- 8. Aviso a un departamento
-- ============================================================

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
  if p_type not in ('curso_nuevo', 'circular_nueva', 'asistencia_pendiente', 'estadisticas_nuevas', 'cambio_estado', 'actividad_proxima', 'documento_actualizado', 'reporte_generado') then
    raise exception 'Ese tipo de aviso no se puede enviar a un departamento.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Falta el título del aviso.' using errcode = '22023';
  end if;

  insert into notifications (profile_id, type, title, body, link_path)
  select distinct r.pid, p_type, left(btrim(p_title), 200), nullif(btrim(coalesce(p_body, '')), ''), '/departamentos/' || p_department_id::text
  from (
    select d.coordinator_profile_id as pid from departments d where d.id = p_department_id
    union
    select dm.profile_id from department_members dm where dm.department_id = p_department_id
  ) r
  join profiles p on p.id = r.pid and p.is_active
  where r.pid is not null and r.pid <> v_me;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function notify_department(uuid, notification_type, text, text) is 'Aviso a todo un departamento: una notificación personal por integrante activo y su coordinador, salvo quien envía. Lo pueden enviar su coordinador, el Secretario Regional o Informática.';

revoke all on function notify_department(uuid, notification_type, text, text) from public;
revoke all on function notify_department(uuid, notification_type, text, text) from anon;
grant execute on function notify_department(uuid, notification_type, text, text) to authenticated;

-- ============================================================
-- 9. Pendientes del Inicio: eventos de departamento y roles sin división
-- ============================================================
-- Misma función que 0075 (con los ajustes posteriores); cambian la condición
-- de eventos (sección 4) y se agrega la sección 9.

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
      or d.coordinator_profile_id = v_profile_id
      or exists (select 1 from department_members dm where dm.department_id = d.id and dm.profile_id = v_profile_id)
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
  end if;
end;
$function$;

-- ============================================================
-- 10. ¿Coordina algún departamento? (pantallas del Jefe de Cuerpo Activo)
-- ============================================================
-- El Jefe de Cuerpo Activo no gestiona a quien coordina un departamento
-- (admin-update-user lo valida con service_role). Sus pantallas lo reflejan
-- ocultando a esos usuarios; como departments ahora se lee por división, se
-- pregunta acá. Solo responde por perfiles de los cuarteles de quien pregunta
-- (o para Informática).
create or replace function coordinating_profile_ids(p_profile_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct d.coordinator_profile_id
  from departments d
  join profiles p on p.id = d.coordinator_profile_id
  where d.coordinator_profile_id = any(p_profile_ids)
    and (is_informatica_r4() or p.station_id in (select my_station_ids()));
$$;

revoke all on function coordinating_profile_ids(uuid[]) from public;
revoke all on function coordinating_profile_ids(uuid[]) from anon;
grant execute on function coordinating_profile_ids(uuid[]) to authenticated;
