-- SIGER4 - Notificaciones: lectura por usuario, bandeja propia y enlace
--
-- REQUISITO: 0101_notification_type_department_report.sql (corrida antes,
-- en su propia ejecución) y 0098_department_reports.sql.
--
-- 1. Lectura por usuario.
--    Una notificación masiva (para una Regional, subsede o cuartel) es UNA
--    fila compartida con un solo is_read. Consecuencias hasta acá:
--      - La policy de UPDATE solo deja marcar las propias (profile_id = uno
--        mismo): las masivas no se podían marcar como leídas y quedaban
--        para siempre en el contador de no leídas.
--      - Informática sí podía, y al marcar una la marcaba leída para todos.
--    Ahora las masivas se marcan en notification_reads (una fila por
--    persona). Las personales siguen usando notifications.is_read.
--
-- 2. Bandeja propia: vista my_notifications.
--    is_informatica_r4() lee todas las filas de notifications, también las
--    personales de otros usuarios. La bandeja muestra solo lo dirigido a
--    quien mira (personales suyas y masivas de su alcance), con is_read ya
--    resuelto para esa persona. Es security_invoker: la RLS de
--    notifications sigue aplicando igual.
--
-- 3. mark_notifications_read(ids): marca una, varias o todas (null) como
--    leídas para quien llama. Security invoker: solo alcanza lo que la RLS
--    le deja ver.
--
-- 4. notifications.link_path: ruta interna del elemento relacionado (ej.
--    /departamentos/informes/<id>). Opcional; solo rutas internas de la app.
--    La usan los avisos nuevos; para los tipos existentes la pantalla abre
--    el módulo correspondiente.
--
-- 5. Aviso de informe nuevo en un departamento: al coordinador y a los
--    integrantes con cuenta, salvo quien lo cargó (los mismos que pueden
--    verlo, 0098). Tipo informe_departamento, con link_path al informe.
--
-- No cambia ningún trigger existente ni el envío push (que sigue saliendo
-- de cada fila insertada en notifications).

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'informe_departamento'
  ) then
    raise exception 'Falta correr 0101_notification_type_department_report.sql (en su propia ejecución) antes de 0102.';
  end if;
  if to_regclass('public.department_reports') is null then
    raise exception 'Falta correr 0098_department_reports.sql antes de 0102.';
  end if;
end;
$$;

-- ============================================================
-- 1. Enlace al elemento relacionado
-- ============================================================

alter table notifications add column if not exists link_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_link_path_internal') then
    alter table notifications
      add constraint notifications_link_path_internal
      check (link_path is null or (link_path ~ '^/[A-Za-z0-9/_?=&.-]*$' and char_length(link_path) <= 300));
  end if;
end;
$$;

comment on column notifications.link_path is 'Ruta interna de SIGER4 del elemento relacionado (ej. /departamentos/informes/<id>). Solo rutas que empiezan con "/", sin esquema ni dominio. Null: la pantalla abre el módulo según el tipo.';

-- ============================================================
-- 2. Lectura por usuario de las notificaciones masivas
-- ============================================================

create table if not exists notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

comment on table notification_reads is 'Qué notificaciones masivas (profile_id null) leyó cada usuario. Las personales siguen usando notifications.is_read.';

create index if not exists idx_notification_reads_profile on notification_reads (profile_id);

alter table notification_reads enable row level security;

drop policy if exists "notification_reads_select_own" on notification_reads;
create policy "notification_reads_select_own" on notification_reads
  for select to authenticated
  using (profile_id = current_profile_id());

-- Solo para uno mismo y sobre una notificación que puede ver (el exists
-- pasa por la RLS de notifications).
drop policy if exists "notification_reads_insert_own" on notification_reads;
create policy "notification_reads_insert_own" on notification_reads
  for insert to authenticated
  with check (
    profile_id = current_profile_id()
    and exists (select 1 from notifications n where n.id = notification_id and n.profile_id is null)
  );

revoke all on table notification_reads from anon;

-- ============================================================
-- 3. Bandeja propia
-- ============================================================

drop view if exists my_notifications;

create view my_notifications
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
  n.link_path
from notifications n
where n.profile_id = current_profile_id()
   or n.profile_id is null;

comment on view my_notifications is 'Bandeja de quien consulta: sus notificaciones personales y las masivas de su alcance (RLS de notifications), con is_read resuelto para esa persona. No incluye notificaciones personales de otros usuarios, tampoco para Informática.';

revoke all on my_notifications from anon;
grant select on my_notifications to authenticated;

-- ============================================================
-- 4. Marcar como leídas
-- ============================================================

create or replace function mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := current_profile_id();
  v_personal integer;
  v_shared integer;
begin
  if v_me is null then
    raise exception 'Tu sesión no es válida. Volvé a iniciar sesión.' using errcode = '42501';
  end if;

  update notifications n
  set is_read = true
  where n.profile_id = v_me
    and n.is_read = false
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_personal = row_count;

  insert into notification_reads (notification_id, profile_id)
  select n.id, v_me
  from notifications n
  where n.profile_id is null
    and (p_ids is null or n.id = any (p_ids))
  on conflict (notification_id, profile_id) do nothing;
  get diagnostics v_shared = row_count;

  return v_personal + v_shared;
end;
$$;

comment on function mark_notifications_read(uuid[]) is 'Marca como leídas para quien llama las notificaciones indicadas, o todas las de su bandeja si p_ids es null. Personales: notifications.is_read; masivas: notification_reads. Security invoker: solo alcanza lo que la RLS le deja ver.';

revoke all on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ============================================================
-- 5. Aviso de informe nuevo en un departamento
-- ============================================================

create or replace function notify_department_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department record;
begin
  select d.id, d.name, d.coordinator_profile_id into v_department
  from departments d where d.id = new.department_id;

  insert into notifications (profile_id, type, title, body, link_path)
  select distinct
    recipient.profile_id,
    'informe_departamento'::notification_type,
    'Nuevo informe en ' || v_department.name || ': ' || new.title,
    'Lo cargó ' || coalesce(new.created_by_name, 'un integrante') || '.',
    '/departamentos/informes/' || new.id::text
  from (
    select v_department.coordinator_profile_id as profile_id
    union
    select dm.profile_id from department_members dm where dm.department_id = new.department_id
  ) recipient
  join profiles p on p.id = recipient.profile_id and p.is_active
  where recipient.profile_id is not null
    and recipient.profile_id is distinct from new.created_by_profile_id;

  return new;
end;
$$;

comment on function notify_department_report_created() is 'Al cargar un informe de departamento, avisa al coordinador y a los integrantes con cuenta (los que pueden verlo, 0098), salvo a quien lo cargó. Notificación personal con link_path al informe.';

revoke all on function notify_department_report_created() from public, anon, authenticated;

drop trigger if exists trg_notify_department_report_created on department_reports;
create trigger trg_notify_department_report_created
  after insert on department_reports
  for each row execute function notify_department_report_created();
