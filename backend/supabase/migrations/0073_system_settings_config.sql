-- SIGER4 - Configuracion persistente en tabla, reemplaza current_setting('siger4.*')
--
-- Bug de infraestructura real detectado en produccion (2026-08-12): el
-- procedimiento documentado desde la migracion 0036 (`alter database postgres
-- set siger4.project_url = ...` / `siger4.cron_shared_secret = ...`) requiere
-- privilegios de superusuario/owner sobre la base. El rol que usa el SQL
-- Editor de Supabase NO los tiene -- el intento falla con
-- `ERROR: 42501: permission denied to set parameter "siger4.project_url"`.
-- No hay forma de aplicar ese procedimiento en un proyecto Supabase real
-- (no es un problema de este proyecto puntual, es una limitacion de la
-- plataforma) -- asi que ninguna funcion que dependiera de
-- current_setting('siger4.project_url'/'siger4.cron_shared_secret', true)
-- podia funcionar en produccion siguiendo la documentacion tal como estaba.
--
-- Fix: reemplazar el GUC de sesion/base por una tabla real
-- (system_settings), leida via una funcion SECURITY DEFINER
-- (get_system_setting) que cualquier funcion de cron ya SECURITY DEFINER
-- puede llamar sin problema, sin depender de ningun privilegio especial de
-- base. Mismo patron ya usado en todo el sistema para "config que solo un
-- rol de confianza puede tocar, leida desde funciones de mas confianza
-- todavia" (ej. is_super_admin() + los triggers de proteccion de 0018).
--
-- Seguridad del secreto (cron_shared_secret):
--   - system_settings tiene RLS activa: solo is_super_admin() (informatica_r4,
--     el unico rol -- ni siquiera integrante_informatica, decision explicita)
--     puede hacer SELECT/INSERT/UPDATE directo sobre la tabla.
--   - Sin embargo, un SELECT directo (aunque solo lo pueda hacer
--     informatica_r4) devolveria el secreto en texto plano si se expusiera
--     alguna vez desde el frontend -- por eso NO hay ninguna pantalla que
--     liste system_settings completa. set_system_setting()/
--     get_system_setting() son el unico camino soportado, y
--     set_system_setting() nunca devuelve el valor que acaba de guardar.
--   - El cambio de un valor SI queda auditado (accion 'system_setting_updated'
--     en audit_logs), pero el valor nuevo/viejo se guarda REDACTADO
--     ('[secreto: XX caracteres]') cuando is_secret=true -- nunca el secreto
--     real. Los valores no-secretos (project_url) se auditan en claro
--     normalmente, son publicos por diseño (viajan igual en cada
--     net.http_post).
--   - No se uso el trigger generico audit_row_change() (el que usa el resto
--     de las tablas del sistema) a proposito: ese trigger hace
--     to_jsonb(new)/to_jsonb(old) de la fila completa, lo que hubiera
--     insertado el secreto en texto plano dentro de audit_logs.new_value/
--     old_value -- exactamente lo que esta migracion busca evitar. Por eso
--     system_settings usa su propia auditoria manual dentro de
--     set_system_setting(), no un trigger AFTER INSERT/UPDATE.

create table system_settings (
  key text primary key,
  value text not null,
  is_secret boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references profiles(id) on delete set null
);

comment on table system_settings is 'Configuracion persistente de infraestructura (project_url, cron_shared_secret, etc), reemplaza current_setting(''siger4.*'') -- ver migracion 0073. Nunca leer/escribir esta tabla directo desde el cliente: usar get_system_setting()/set_system_setting().';
comment on column system_settings.value is 'Texto plano. Si is_secret=true, nunca se debe mostrar completo en ningun lugar del frontend ni loguearse en claro en auditoria -- ver set_system_setting().';
comment on column system_settings.is_secret is 'Si true, set_system_setting() audita los cambios de este valor de forma redactada, nunca el texto real.';

alter table system_settings enable row level security;

create policy "system_settings_all_super_admin" on system_settings
  for all using (is_super_admin()) with check (is_super_admin());

comment on policy "system_settings_all_super_admin" on system_settings is 'Solo informatica_r4 (is_super_admin(), NO integrante_informatica) puede leer/escribir esta tabla directo -- en la practica, siempre via set_system_setting()/get_system_setting(), nunca un select/insert/update directo desde el cliente.';

-- ============================================================
-- Helpers de lectura/escritura
-- ============================================================

create or replace function get_system_setting(p_key text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select value from system_settings where key = p_key;
$$;

comment on function get_system_setting(text) is 'Lee un valor de system_settings, sin RLS (security definer) -- pensada para que la llamen otras funciones SECURITY DEFINER (send_weekly_reminder, send_weekly_admin_summary, trigger_document_purge), nunca directo desde el cliente. Devuelve null si la clave no existe (mismo comportamiento que current_setting(key, true), que reemplaza). Deliberadamente SIN grant a authenticated: si lo tuviera, cualquier usuario logueado podria hacer select get_system_setting(''cron_shared_secret'') y leer el secreto en texto plano, saltandose por completo la RLS de system_settings. Otra funcion SECURITY DEFINER puede llamarla igual sin ningun grant explicito (mismo criterio que las funciones de trigger en 0031_security_definer_execute_grants.sql).';

revoke all on function get_system_setting(text) from public;

create or replace function set_system_setting(p_key text, p_value text, p_is_secret boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_old_value text;
  v_old_is_secret boolean;
  v_audit_old text;
  v_audit_new text;
begin
  if not is_super_admin() then
    raise exception 'Solo informatica_r4 puede modificar la configuracion del sistema.';
  end if;

  v_actor := current_profile_id();

  select value, is_secret into v_old_value, v_old_is_secret
  from system_settings where key = p_key;

  insert into system_settings (key, value, is_secret, updated_at, updated_by_profile_id)
  values (p_key, p_value, p_is_secret, now(), v_actor)
  on conflict (key) do update
    set value = excluded.value,
        is_secret = excluded.is_secret,
        updated_at = excluded.updated_at,
        updated_by_profile_id = excluded.updated_by_profile_id;

  -- Auditoria manual, redactada si el valor (viejo o nuevo) es secreto --
  -- nunca to_jsonb() de la fila completa (ver comentario de cabecera).
  v_audit_old := case
    when v_old_value is null then null
    when v_old_is_secret then '[secreto: ' || length(v_old_value) || ' caracteres]'
    else v_old_value
  end;
  v_audit_new := case
    when p_is_secret then '[secreto: ' || length(p_value) || ' caracteres]'
    else p_value
  end;

  insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value)
  values (
    v_actor,
    case when v_old_value is null then 'insert' else 'update' end,
    'system_settings',
    p_key,
    case when v_audit_old is null then null else jsonb_build_object('key', p_key, 'value', v_audit_old) end,
    jsonb_build_object('key', p_key, 'value', v_audit_new)
  );
end;
$$;

comment on function set_system_setting(text, text, boolean) is 'Unico camino soportado para escribir system_settings. Revalida is_super_admin() server-side (no confiar solo en RLS de la tabla), y audita el cambio de forma redactada si is_secret=true -- nunca inserta el secreto real en audit_logs. Reemplaza los "alter database postgres set siger4.*" que requieren superusuario y no se pueden ejecutar desde el SQL Editor de un proyecto Supabase real.';

revoke all on function set_system_setting(text, text, boolean) from public;
grant execute on function set_system_setting(text, text, boolean) to authenticated;

-- ============================================================
-- Valor no-secreto: se puede dejar en la migracion (no es un dato sensible,
-- viaja en claro en cada net.http_post igual). El secreto
-- (cron_shared_secret) NO se hardcodea aca -- ver DEPLOYMENT.md para el
-- INSERT/UPDATE puntual a correr en el SQL Editor con el valor real.
-- ============================================================

insert into system_settings (key, value, is_secret)
values ('project_url', 'https://tuhynszatghlfohugexn.supabase.co', false)
on conflict (key) do nothing;

-- ============================================================
-- Actualizar las 3 funciones que dependian de current_setting('siger4.*')
-- ============================================================

create or replace function send_weekly_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_profile record;
  v_notification_id uuid;
  v_title text := 'Recordatorio semanal SIGER4';
  v_body text := 'Recordatorio semanal SIGER4: revisar cargas pendientes, novedades y documentación institucional.';
  v_lock_key bigint := hashtextextended('send_weekly_reminder', 0);
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    raise notice 'send_weekly_reminder: ya hay otra ejecucion en curso, se omite esta corrida.';
    return;
  end if;

  v_project_url := get_system_setting('project_url');
  v_cron_secret := get_system_setting('cron_shared_secret');

  if v_project_url is null or v_cron_secret is null then
    raise warning 'send_weekly_reminder: faltan las claves project_url/cron_shared_secret en system_settings (ver DEPLOYMENT.md). Se insertan las notificaciones igual, pero no se puede disparar el push real.';
  end if;

  for v_profile in
    select id from profiles where is_active = true and weekly_reminder_enabled = true
  loop
    insert into notifications (profile_id, type, title, body)
    values (v_profile.id, 'recordatorio_semanal', v_title, v_body)
    returning id into v_notification_id;

    if v_project_url is not null and v_cron_secret is not null then
      perform net.http_post(
        url := v_project_url || '/functions/v1/send-push-system',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'url', '/notificaciones',
          'tag', 'recordatorio_semanal',
          'profileId', v_profile.id,
          'notificationId', v_notification_id
        )
      );
    end if;
  end loop;
end;
$$;

comment on function send_weekly_reminder() is 'Inserta el recordatorio institucional semanal (self-scope) para cada perfil activo con weekly_reminder_enabled=true, y dispara el push real via send-push-system (pg_net). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Llamado por el job de pg_cron "siger4-weekly-reminder". Lee project_url/cron_shared_secret de system_settings (migracion 0073, ver get_system_setting()) para el push real; sin esas claves configuradas, igual crea las notificaciones internas.';

revoke all on function send_weekly_reminder() from public;

create or replace function send_weekly_admin_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_profile record;
  v_notification_id uuid;
  v_title text := 'Resumen semanal — Dpto. Informática y Estadística R4';
  v_body text;
  v_week_start timestamptz := now() - interval '7 days';
  v_lock_key bigint := hashtextextended('send_weekly_admin_summary', 0);

  v_red_stations text;
  v_yellow_stations text;
  v_inactive_stations text;
  v_pending_loans integer;
  v_overdue_loans integer;
  v_new_documents integer;
  v_users_created integer;
  v_users_deactivated integer;
  v_users_deleted integer;
  v_active_departments integer;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    raise notice 'send_weekly_admin_summary: ya hay otra ejecucion en curso, se omite esta corrida.';
    return;
  end if;

  v_project_url := get_system_setting('project_url');
  v_cron_secret := get_system_setting('cron_shared_secret');

  select string_agg(
    station_name || ' (' || round(100.0 * compliant_count / nullif(compliant_total, 0)) || '% de carga institucional)',
    e'\n'
    order by compliant_count asc
  )
  into v_red_stations
  from station_compliance
  where compliance_status = 'rojo';

  select string_agg(
    station_name || ' (' || round(100.0 * compliant_count / nullif(compliant_total, 0)) || '% de carga institucional)',
    e'\n'
    order by compliant_count asc
  )
  into v_yellow_stations
  from station_compliance
  where compliance_status = 'amarillo';

  select string_agg(station_name, ', ' order by last_relevant_update_at asc)
  into v_inactive_stations
  from station_compliance
  where last_relevant_update_at < now() - interval '30 days';

  select count(*) into v_pending_loans from inventory_loan_requests where status = 'pendiente';
  select count(*) into v_overdue_loans
  from inventory_loan_requests
  where status = 'retirada' and expected_return_at is not null and expected_return_at < now();

  select count(*) into v_new_documents from documents where created_at >= v_week_start;

  select count(*) into v_users_created from profiles where created_at >= v_week_start;
  select count(*) into v_users_deactivated
  from audit_logs
  where table_name = 'profiles' and action = 'update' and created_at >= v_week_start
    and (old_value->>'is_active') = 'true' and (new_value->>'is_active') = 'false';
  select count(*) into v_users_deleted
  from audit_logs
  where table_name = 'auth_users' and action = 'admin_delete_user' and created_at >= v_week_start;

  select count(distinct department_id) into v_active_departments
  from department_activity_reports
  where activity_date >= v_week_start::date;

  v_body :=
    'Cuarteles en rojo: ' || coalesce(nullif(v_red_stations, ''), 'ninguno') || e'\n' ||
    'Cuarteles en amarillo: ' || coalesce(nullif(v_yellow_stations, ''), 'ninguno') || e'\n' ||
    'Cuarteles sin actividad hace más de 30 días: ' || coalesce(nullif(v_inactive_stations, ''), 'ninguno') || e'\n' ||
    'Solicitudes de préstamo pendientes: ' || v_pending_loans || ' · vencidas: ' || v_overdue_loans || e'\n' ||
    'Documentos nuevos esta semana: ' || v_new_documents || e'\n' ||
    'Usuarios: ' || v_users_created || ' creados, ' || v_users_deactivated || ' desactivados, ' || v_users_deleted || ' eliminados esta semana' || e'\n' ||
    'Departamentos con actividad registrada esta semana: ' || v_active_departments;

  if v_project_url is null or v_cron_secret is null then
    raise warning 'send_weekly_admin_summary: faltan las claves project_url/cron_shared_secret en system_settings (ver DEPLOYMENT.md). Se insertan las notificaciones igual, pero no se puede disparar el push real.';
  end if;

  for v_profile in
    select p.id
    from profiles p
    join user_roles ur on ur.profile_id = p.id
    where p.is_active = true
      and p.weekly_admin_summary_enabled = true
      and ur.role in ('informatica_r4', 'integrante_informatica')
    group by p.id
  loop
    insert into notifications (profile_id, type, title, body)
    values (v_profile.id, 'alerta_admin', v_title, v_body)
    returning id into v_notification_id;

    if v_project_url is not null and v_cron_secret is not null then
      perform net.http_post(
        url := v_project_url || '/functions/v1/send-push-system',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
        body := jsonb_build_object(
          'title', v_title,
          'body', 'Tocá para ver el detalle completo del resumen semanal.',
          'url', '/notificaciones',
          'tag', 'resumen_semanal_admin',
          'profileId', v_profile.id,
          'notificationId', v_notification_id
        )
      );
    end if;
  end loop;
end;
$$;

comment on function send_weekly_admin_summary() is 'Resumen semanal enriquecido SOLO para informatica_r4/integrante_informatica: cuarteles en rojo/amarillo del semáforo con su % de carga, cuarteles sin actividad hace 30+ días, préstamos pendientes/vencidos, documentos nuevos, altas/bajas/eliminaciones de usuario, departamentos con actividad. Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Lee project_url/cron_shared_secret de system_settings (migracion 0073). Independiente de send_weekly_reminder() (0036), que sigue siendo el recordatorio genérico para todos los usuarios. Llamado por el job de pg_cron "siger4-weekly-admin-summary".';

revoke all on function send_weekly_admin_summary() from public;

create or replace function trigger_document_purge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
begin
  v_project_url := get_system_setting('project_url');
  v_cron_secret := get_system_setting('cron_shared_secret');

  if v_project_url is null or v_cron_secret is null then
    raise warning 'trigger_document_purge: faltan las claves project_url/cron_shared_secret en system_settings (ver DEPLOYMENT.md). No se purgo ningun documento en esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/purge-documents',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

comment on function trigger_document_purge() is 'Dispara la Edge Function purge-documents (sin documentId -> purga todos los documentos con purge_after vencido) via pg_net. Llamado por el job de pg_cron "siger4-document-purge". Lee project_url/cron_shared_secret de system_settings (migracion 0073) -- sin esas claves configuradas, no hace nada y deja un WARNING en los logs.';

revoke all on function trigger_document_purge() from public;
