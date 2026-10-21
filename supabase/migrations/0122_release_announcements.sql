-- SIGER4 - Avisos de actualización publicada
--
-- REQUISITO: 0121_release_announcement_type.sql, corrida antes y sola.
--
-- Cada vez que una versión nueva llega a producción, todos los perfiles activos reciben UNA notificación interna breve
-- ("Hay una nueva actualización en Documentos."). Esta migración deja lo que hace falta en la base:
--
-- 1. app_releases: un registro por versión anunciada. La versión es única: anunciar dos veces la misma no genera nada
--    nuevo. Solo lo lee Informática (informatica_r4); nadie la escribe desde la aplicación.
--
-- 2. announce_release(version, modulos, commit): crea el registro y UNA notificación personal por cada perfil activo con
--    cuenta (tipo actualizacion_publicada, app_update_id = 'release:<version>'). Todo en una transacción. Pasa por el
--    mismo trigger de push de siempre (0085): no hay otro sistema de push ni se envía dos veces. Cada persona la marca
--    como leída por su cuenta (es una notificación personal).
--    Solo la puede ejecutar el proceso de publicación (service_role) o quien corre SQL como dueño de la base. Ni anon ni
--    authenticated, tampoco Informática por la aplicación.
--
-- 3. Candados para que nadie más cree o altere estos avisos: una política RESTRICTIVA que impide insertar el tipo desde la
--    aplicación (incluida Informática) y un trigger que impide editar título, texto o destino de uno ya creado (solo se
--    puede marcar como leído).
--
-- 4. El RPC viejo ensure_app_update_notification (0079), que dejaba a cualquier persona crearse avisos de "novedades", se
--    retira para el usuario autenticado: ya no lo usa ninguna pantalla.
--
-- No cambia ninguna notificación existente, ni la lectura por usuario (0102), ni el push (0085). Idempotente.

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'actualizacion_publicada'
  ) then
    raise exception 'Falta correr 0121_release_announcement_type.sql (en su propia ejecución) antes de 0122.';
  end if;
  if to_regclass('public.notification_reads') is null then
    raise exception 'Falta correr 0102_notification_reads_and_links.sql antes de 0122.';
  end if;
end;
$$;

-- ============================================================
-- 1. Módulos que se pueden anunciar y su destino
-- ============================================================

-- Nombres visibles, siempre en lenguaje de todos los días (nunca nombres técnicos). Es la misma lista que
-- supabase/functions/_shared/releaseAnnouncement.ts: si se agrega un módulo, se agrega en las dos.
create or replace function release_modules()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Inicio', 'Usuarios y roles', 'Cuarteles', 'Efectivos', 'Asistencia', 'Móviles', 'Departamentos', 'Informes y actas',
    'Escuela', 'Avales', 'Documentos', 'Inventario', 'Calendario', 'Mapa Regional', 'Reportes', 'Notificaciones',
    'Mi perfil', 'Seguridad', 'Asistente SIGER4'
  ]::text[];
$$;

comment on function release_modules() is 'Módulos que se pueden nombrar en un aviso de actualización, con el nombre que ve la persona. Debe coincidir con supabase/functions/_shared/releaseAnnouncement.ts.';

-- Ruta interna del módulo cuando el aviso nombra UN solo módulo y tiene un destino claro. La aplicación solo ofrece "Abrir"
-- si la persona puede entrar a esa ruta (notificationMeta.openableNotificationLink): nunca un botón que termine en "No tenés
-- permiso". Null: el aviso no trae enlace.
create or replace function release_module_route(p_module text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_module
    when 'Inicio' then '/panel'
    when 'Usuarios y roles' then '/usuarios'
    when 'Cuarteles' then '/cuarteles'
    when 'Departamentos' then '/departamentos'
    when 'Escuela' then '/escuela'
    when 'Avales' then '/escuela/avales'
    when 'Documentos' then '/documentos'
    when 'Inventario' then '/inventario'
    when 'Calendario' then '/calendario'
    when 'Mapa Regional' then '/mapa'
    when 'Reportes' then '/reportes'
    when 'Notificaciones' then '/notificaciones'
    when 'Mi perfil' then '/ajustes'
    else null
  end;
$$;

comment on function release_module_route(text) is 'Ruta interna a la que lleva un aviso que nombra un solo módulo (null si no hay una clara).';

-- "Hay una nueva actualización en Documentos." / "Hay nuevas actualizaciones en Roles, Mapa Regional y Documentos."
create or replace function release_announcement_body(p_modules text[])
returns text
language sql
immutable
set search_path = public
as $$
  select case cardinality(p_modules)
    when 1 then 'Hay una nueva actualización en ' || p_modules[1] || '.'
    else 'Hay nuevas actualizaciones en '
      || array_to_string(p_modules[1:cardinality(p_modules) - 1], ', ')
      || ' y ' || p_modules[cardinality(p_modules)] || '.'
  end;
$$;

comment on function release_announcement_body(text[]) is 'Texto del aviso de actualización a partir de los módulos nombrados (uno o varios).';

revoke all on function release_modules() from public;
revoke all on function release_module_route(text) from public;
revoke all on function release_announcement_body(text[]) from public;
grant execute on function release_modules() to authenticated, service_role;
grant execute on function release_module_route(text) to authenticated, service_role;
grant execute on function release_announcement_body(text[]) to authenticated, service_role;

-- ============================================================
-- 2. Registro de versiones anunciadas
-- ============================================================

create table if not exists app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  modules text[] not null,
  commit_sha text,
  recipients integer not null default 0,
  announced_at timestamptz not null default now(),
  constraint app_releases_version_unique unique (version),
  constraint app_releases_version_format check (version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}$'),
  constraint app_releases_modules_count check (cardinality(modules) between 1 and 6),
  constraint app_releases_commit_format check (commit_sha is null or commit_sha ~ '^[0-9a-f]{7,40}$')
);

comment on table app_releases is 'Una fila por versión de SIGER4 anunciada a las personas usuarias (aviso breve de actualización). La versión es única: anunciar la misma dos veces no genera nada. Se escribe solo con announce_release().';

alter table app_releases enable row level security;

drop policy if exists "app_releases_select_super_admin" on app_releases;
create policy "app_releases_select_super_admin" on app_releases
  for select to authenticated
  using (is_super_admin());

revoke all on table app_releases from anon;
revoke insert, update, delete, truncate on table app_releases from authenticated;

-- ============================================================
-- 3. Anunciar una versión
-- ============================================================

create or replace function announce_release(p_version text, p_modules text[], p_commit text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version text := trim(coalesce(p_version, ''));
  v_modules text[];
  v_allowed text[] := release_modules();
  v_commit text := nullif(lower(trim(coalesce(p_commit, ''))), '');
  v_release_id uuid;
  v_link text;
  v_recipients integer := 0;
begin
  -- Solo el proceso de publicación: service_role (la función de publicación) o quien corre SQL como dueño de la base.
  -- Los permisos de ejecución ya lo impiden para anon y authenticated; esto es un segundo candado.
  if not (
    session_user in ('postgres', 'supabase_admin')
    or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Solo el proceso de publicación puede anunciar una versión.' using errcode = '42501';
  end if;

  if v_version !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}$' then
    raise exception 'La versión no es válida: usá el formato 1.18.0.' using errcode = '22023';
  end if;
  if v_commit is not null and v_commit !~ '^[0-9a-f]{7,40}$' then
    raise exception 'El identificador del commit no es válido.' using errcode = '22023';
  end if;

  -- Módulos: sin repetir, en el orden en que se pasaron, todos de la lista permitida, de 1 a 6.
  select coalesce(array_agg(m order by first_pos), '{}'::text[]) into v_modules
  from (select t.m, min(t.pos) as first_pos from unnest(coalesce(p_modules, '{}'::text[])) with ordinality as t(m, pos) group by t.m) d;
  if cardinality(v_modules) < 1 or cardinality(v_modules) > 6 then
    raise exception 'Indicá entre 1 y 6 módulos actualizados.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_modules) as m where not (m = any (v_allowed))) then
    raise exception 'Hay un módulo que no figura en la lista permitida.' using errcode = '22023';
  end if;

  insert into app_releases (version, modules, commit_sha)
  values (v_version, v_modules, v_commit)
  on conflict (version) do nothing
  returning id into v_release_id;

  -- Esa versión ya se había anunciado: no se crea nada.
  if v_release_id is null then
    return jsonb_build_object('version', v_version, 'already_announced', true, 'recipients', 0);
  end if;

  v_link := case when cardinality(v_modules) = 1 then release_module_route(v_modules[1]) else null end;

  -- Una notificación personal por perfil activo con cuenta. El unique parcial (profile_id, app_update_id) de 0077 evita un
  -- segundo aviso de la misma versión a la misma persona, aunque algo se repitiera. El push sale del trigger de siempre.
  insert into notifications (profile_id, type, title, body, link_path, app_update_id)
  select p.id, 'actualizacion_publicada'::notification_type, 'Nueva actualización', release_announcement_body(v_modules), v_link,
    'release:' || v_version
  from profiles p
  where p.is_active and p.auth_user_id is not null
  on conflict (profile_id, app_update_id) where app_update_id is not null do nothing;
  get diagnostics v_recipients = row_count;

  update app_releases set recipients = v_recipients where id = v_release_id;

  return jsonb_build_object('version', v_version, 'already_announced', false, 'recipients', v_recipients, 'modules', to_jsonb(v_modules));
end;
$$;

comment on function announce_release(text, text[], text) is 'Anuncia una versión publicada: registra la versión (única) y crea UNA notificación personal breve para cada perfil activo con cuenta. Idempotente por versión. Solo service_role o el dueño de la base. El push sale del trigger de notifications (0085).';

revoke all on function announce_release(text, text[], text) from public, anon, authenticated;
grant execute on function announce_release(text, text[], text) to service_role;

-- ============================================================
-- 4. Candados: nadie crea ni altera estos avisos desde la aplicación
-- ============================================================

-- Restrictiva: se suma (AND) a las políticas de insertar que ya existen, así que ni siquiera Informática puede insertar este
-- tipo por la API. announce_release() es security definer y no pasa por la RLS.
drop policy if exists "notifications_no_release_type_from_clients" on notifications;
create policy "notifications_no_release_type_from_clients" on notifications
  as restrictive
  for insert to authenticated
  with check (type <> 'actualizacion_publicada');

-- Un aviso ya creado solo admite que su dueño lo marque como leído: no se puede cambiar su tipo, texto, destino ni dueño.
create or replace function guard_release_notification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.type = 'actualizacion_publicada' or new.type = 'actualizacion_publicada')
     and (new.type, new.title, new.body, new.profile_id, new.region_id, new.subsede_id, new.station_id, new.link_path, new.app_update_id)
         is distinct from
         (old.type, old.title, old.body, old.profile_id, old.region_id, old.subsede_id, old.station_id, old.link_path, old.app_update_id) then
    raise exception 'Los avisos de actualización no se pueden modificar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function guard_release_notification() is 'Impide cambiar o fabricar un aviso de actualización editando una notificación: solo se puede marcar como leído.';

revoke all on function guard_release_notification() from public, anon, authenticated;

drop trigger if exists trg_guard_release_notification on notifications;
create trigger trg_guard_release_notification
  before update on notifications
  for each row execute function guard_release_notification();

-- ============================================================
-- 5. Retiro del RPC viejo de novedades (0079)
-- ============================================================

do $$
begin
  if to_regprocedure('public.ensure_app_update_notification(text,text,text)') is not null then
    revoke execute on function ensure_app_update_notification(text, text, text) from public, anon, authenticated;
  end if;
end;
$$;
