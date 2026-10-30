-- SIGER4 - UI segura para configurar system_settings + diagnostico de push semanal
--
-- Seguimiento inmediato a la migracion 0073: en la practica, set_system_setting()
-- no se puede invocar desde el SQL Editor de Supabase. El SQL Editor corre
-- las queries bajo el rol de servicio del proyecto, sin JWT de usuario real
-- -- auth.uid() ahi es null, asi que current_profile_id()/is_super_admin()
-- (que dependen de auth.uid()) nunca resuelven a un profile real, y
-- set_system_setting() rechaza con "Solo informatica_r4 puede modificar la
-- configuracion del sistema." aunque el usuario real de la app SI sea
-- informatica_r4 -- el error es correcto (nadie sin sesion real de usuario
-- deberia poder tocar esto), pero deja sin forma de configurar
-- cron_shared_secret la primera vez.
--
-- Fix: exponer una UI dentro de la propia app (Ajustes, solo informatica_r4)
-- que llama a set_system_setting() bajo la sesion real del usuario logueado
-- (auth.uid() SI resuelve ahi) -- ver AjustesPage.tsx. Esta migracion agrega
-- el unico helper que faltaba para que esa UI pueda mostrar el estado actual
-- SIN arriesgar exponer el secreto: list_system_settings_status() devuelve
-- key/is_secret/updated_at/configured para todas las filas, y el VALOR real
-- unicamente para las claves NO secretas (project_url) -- para is_secret=true
-- siempre null, sin importar quien la llame (ni siquiera is_super_admin()
-- puede leer el secreto de vuelta por este camino; sigue siendo
-- "solo se puede escribir, nunca releer" a proposito).
--
-- Tambien agrega get_weekly_push_diagnostics(): para diagnosticar sin
-- ambiguedad si un envio semanal (recordatorio general o resumen admin)
-- realmente disparo el push, no solo la notificacion interna -- cruza
-- notifications (se creo) contra push_send_log (se intento/logro enviar el
-- push real), que es la unica fuente de verdad confiable para eso (net.http_post
-- es fire-and-forget desde SQL, no permite saber si el push realmente salio).

-- ============================================================
-- Estado de configuracion, sin exponer secretos
-- ============================================================

create or replace function list_system_settings_status()
returns table (key text, is_secret boolean, configured boolean, value text, updated_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.key,
    s.is_secret,
    true as configured,
    case when s.is_secret then null else s.value end as value,
    s.updated_at
  from system_settings s
  where is_super_admin();
$$;

comment on function list_system_settings_status() is 'Lista el estado de system_settings sin exponer secretos: is_secret=true siempre devuelve value=null, sin importar quien la llame -- el unico camino para escribir sigue siendo set_system_setting(), nunca hay forma de releer un secreto ya guardado. Filtra a is_super_admin() dentro de la propia query (where is_super_admin()) en vez de depender solo de la RLS de la tabla subyacente, para que quede explicito en una sola funcion. Reemplaza cualquier select directo a system_settings desde el cliente.';

revoke all on function list_system_settings_status() from public;
grant execute on function list_system_settings_status() to authenticated;

-- ============================================================
-- Diagnostico: notificacion interna vs. push real efectivamente enviado
-- ============================================================

create or replace function get_weekly_push_diagnostics(p_notification_type notification_type, p_since timestamptz default now() - interval '7 days')
returns table (
  notification_id uuid,
  profile_id uuid,
  notification_created_at timestamptz,
  push_attempted boolean,
  push_status text,
  push_sent_count integer,
  push_recipients_count integer,
  push_error_message text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    n.id as notification_id,
    n.profile_id,
    n.created_at as notification_created_at,
    (psl.id is not null) as push_attempted,
    psl.status as push_status,
    psl.sent_count as push_sent_count,
    psl.recipients_count as push_recipients_count,
    psl.error_message as push_error_message
  from notifications n
  left join push_send_log psl on psl.notification_id = n.id
  where is_informatica_r4()
    and n.type = p_notification_type
    and n.created_at >= p_since
  order by n.created_at desc;
$$;

comment on function get_weekly_push_diagnostics(notification_type, timestamptz) is 'Diagnostico de "se creo la notificacion interna pero se disparo/logro el push real" para recordatorio_semanal/alerta_admin -- cruza notifications (siempre se crea) contra push_send_log (solo tiene fila si send-push-system efectivamente respondio, exitoso o no). push_attempted=false + notificacion reciente = el net.http_post nunca llego a completarse (cron_shared_secret/project_url mal configurados, o pg_net caido) -- ver DEPLOYMENT.md seccion 33 para el playbook completo. Filtra a is_informatica_r4() dentro de la query. Reemplaza tener que cruzar notifications/push_send_log a mano.';

revoke all on function get_weekly_push_diagnostics(notification_type, timestamptz) from public;
grant execute on function get_weekly_push_diagnostics(notification_type, timestamptz) to authenticated;

-- ============================================================
-- No aparentar exito total: si falta project_url/cron_shared_secret, avisar
-- DENTRO de la app (notificacion visible a informatica_r4/integrante_informatica),
-- no solo un raise warning en los logs de Postgres que nadie mira salvo que
-- ya sospeche del problema.
-- ============================================================

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
    if not exists (
      select 1 from notifications
      where type = 'alerta_admin' and title = 'Resumen semanal: push no configurado' and created_at >= now() - interval '24 hours'
    ) then
      perform notify_informatica_staff(
        'Resumen semanal: push no configurado',
        'send_weekly_admin_summary() corrió y creó las notificaciones internas, pero no pudo disparar el push real: falta configurar project_url/cron_shared_secret en Ajustes → Configuración del sistema.'
      );
    end if;
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

comment on function send_weekly_admin_summary() is 'Resumen semanal enriquecido SOLO para informatica_r4/integrante_informatica: cuarteles en rojo/amarillo del semáforo con su % de carga, cuarteles sin actividad hace 30+ días, préstamos pendientes/vencidos, documentos nuevos, altas/bajas/eliminaciones de usuario, departamentos con actividad. Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Lee project_url/cron_shared_secret de system_settings (migracion 0073). Si faltan, ademas de la notificacion normal del resumen, avisa por separado con una notificacion visible en la app dedicada a ese problema (no solo un WARNING en los logs de Postgres). Independiente de send_weekly_reminder() (0036), que sigue siendo el recordatorio genérico para todos los usuarios. Llamado por el job de pg_cron "siger4-weekly-admin-summary".';

revoke all on function send_weekly_admin_summary() from public;

-- ============================================================
-- No aparentar exito total: si falta project_url/cron_shared_secret, avisar
-- DENTRO de la app (notificacion visible a informatica_r4/integrante_informatica),
-- no solo un raise warning en los logs de Postgres que nadie mira salvo que
-- ya sospeche del problema.
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
    if not exists (
      select 1 from notifications
      where type = 'alerta_admin' and title = 'Recordatorio semanal: push no configurado' and created_at >= now() - interval '24 hours'
    ) then
      perform notify_informatica_staff(
        'Recordatorio semanal: push no configurado',
        'send_weekly_reminder() corrió y creó las notificaciones internas, pero no pudo disparar el push real: falta configurar project_url/cron_shared_secret en Ajustes → Configuración del sistema.'
      );
    end if;
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

comment on function send_weekly_reminder() is 'Inserta el recordatorio institucional semanal (self-scope) para cada perfil activo con weekly_reminder_enabled=true, y dispara el push real via send-push-system (pg_net). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Llamado por el job de pg_cron "siger4-weekly-reminder". Lee project_url/cron_shared_secret de system_settings (migracion 0073, ver get_system_setting()) para el push real; si faltan, ademas de las notificaciones internas normales, avisa a informatica_r4/integrante_informatica con una notificacion visible en la app (no solo un WARNING en los logs de Postgres).';

revoke all on function send_weekly_reminder() from public;

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
    if not exists (
      select 1 from notifications
      where type = 'alerta_admin' and title = 'Purga de documentos: no configurada' and created_at >= now() - interval '24 hours'
    ) then
      perform notify_informatica_staff(
        'Purga de documentos: no configurada',
        'trigger_document_purge() no pudo correr: falta configurar project_url/cron_shared_secret en Ajustes → Configuración del sistema. Los documentos vencidos de la papelera siguen acumulándose sin purgarse.'
      );
    end if;
    return;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/purge-documents',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

comment on function trigger_document_purge() is 'Dispara la Edge Function purge-documents (sin documentId -> purga todos los documentos con purge_after vencido) via pg_net. Llamado por el job de pg_cron "siger4-document-purge". Lee project_url/cron_shared_secret de system_settings (migracion 0073) -- sin esas claves configuradas, no hace nada, avisa a informatica_r4/integrante_informatica con una notificacion visible en la app, y deja un WARNING en los logs.';

revoke all on function trigger_document_purge() from public;
