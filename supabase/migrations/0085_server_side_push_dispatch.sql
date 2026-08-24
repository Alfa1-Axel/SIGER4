-- SIGER4 - Push real server-side para TODA notificacion, no solo el
-- recordatorio semanal
--
-- Problema real detectado en produccion: la campanita muestra la
-- notificacion (la fila en "notifications" se crea siempre, via trigger o
-- insert directo), pero el push real (Web Push, llega aunque la PWA este
-- cerrada) nunca se dispara si nadie tiene el navegador abierto en ese
-- momento. Causa exacta: el UNICO disparador de push para notificaciones que
-- no son el recordatorio/resumen semanal era NotificationPushBridge
-- (src/components/NotificationPushBridge.tsx) -- un listener de Realtime que
-- vive en el navegador y llama a la Edge Function send-push. Si no hay
-- ninguna pestaña con sesion abierta escuchando ese canal cuando se inserta
-- la notificacion, nadie llama a send-push, y el push real jamas sale --
-- aunque la fila en notifications exista perfectamente y la campanita la
-- muestre la proxima vez que alguien abra la app.
--
-- send_weekly_reminder()/send_weekly_admin_summary() (0036/0067/0073) ya
-- eran la excepcion correcta: llaman a pg_net -> send-push-system
-- directamente desde SQL, sin depender de que el frontend este abierto. Esta
-- migracion generaliza ESE mismo patron a TODA la tabla notifications, con
-- un unico trigger central, en vez de tener que acordarse de agregar la
-- llamada a pg_net en cada trigger/funcion nueva que inserte una
-- notificacion (courses, documents, calendar, prestamos, cambios de estado,
-- alertas admin, notificaciones manuales -- todos los que hoy dependen
-- 100% de NotificationPushBridge).
--
-- Diseño:
--   1. dispatch_notification_push(): trigger AFTER INSERT ON notifications,
--      security definer. Lee project_url/cron_shared_secret de
--      system_settings (0073/get_system_setting()) y dispara
--      net.http_post a send-push-system con el ID de la notificacion y su
--      alcance completo (profile_id o region/subsede/station). Fire-and-
--      forget, igual que send_weekly_reminder(): si pg_net falla o no esta
--      configurado, la notificacion interna ya quedo guardada de todas
--      formas (nunca bloquea el insert).
--   2. send-push-system (Edge Function) se generaliza para aceptar
--      CUALQUIER alcance (antes solo profileId puntual, pensado nada mas
--      para el recordatorio semanal) -- resuelve destinatarios exactamente
--      igual que send-push ya hace, reutilizando la misma logica.
--   3. send_weekly_reminder()/send_weekly_admin_summary() dejan de llamar a
--      pg_net manualmente: como ahora insertan en notifications igual que
--      siempre, el trigger nuevo las cubre automaticamente -- se simplifican
--      para no disparar el push DOS veces (una del trigger, otra de su
--      propio net.http_post).
--   4. NotificationPushBridge (frontend) deja de llamar a send-push: pasa a
--      ser solo sonido interno / actualizacion visual mientras la app esta
--      abierta (ver cambios en el codigo del frontend, fuera de esta
--      migracion). El push real ya no depende de que exista.
--   5. Deduplicacion: push_send_log YA tenia (migracion 0025) un indice
--      unico parcial sobre notification_id where status='ok' -- sigue
--      siendo la misma tabla, mismo indice, asi que dos intentos por la
--      misma notificacion (ej. un reintento de pg_net, o si en el futuro
--      volviera a existir un camino client-side) siguen colapsando en un
--      solo envio real. No hace falta un constraint nuevo.
--
-- Seguridad: el trigger corre SECURITY DEFINER (mismo patron que
-- send_weekly_reminder), nunca expone VAPID_PRIVATE_KEY ni
-- SUPABASE_SERVICE_ROLE_KEY (esas siguen siendo secretos exclusivos de la
-- Edge Function). cron_shared_secret se lee de system_settings, nunca se
-- devuelve al cliente (ver get_system_setting(), 0073 -- sin grant a
-- authenticated a proposito).

create or replace function dispatch_notification_push()
returns trigger
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

  -- Sin configuracion, no hay forma de disparar el push real -- la
  -- notificacion interna (new, ya insertada) sigue existiendo igual, la
  -- campanita la va a mostrar. No se avisa acá con notify_informatica_staff
  -- en cada insert (seria spam extremo, notifications se inserta
  -- constantemente) -- el aviso de "push no configurado" ya existe en
  -- send_weekly_reminder/send_weekly_admin_summary/trigger_document_purge
  -- (0074), y el diagnostico de Ajustes (ver migracion siguiente) permite
  -- confirmarlo en cualquier momento sin esperar al cron semanal.
  if v_project_url is null or v_cron_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/send-push-system',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := jsonb_build_object(
      'title', new.title,
      'body', coalesce(new.body, ''),
      'url', '/notificaciones',
      'tag', new.type::text,
      'profileId', new.profile_id,
      'regionId', new.region_id,
      'subsedeId', new.subsede_id,
      'stationId', new.station_id,
      'notificationId', new.id
    )
  );

  return new;
end;
$$;

comment on function dispatch_notification_push() is 'Trigger AFTER INSERT ON notifications: dispara el push real (Web Push, funciona aunque la PWA este cerrada) via pg_net -> send-push-system para CUALQUIER notificacion, sin importar si la creo un trigger de Postgres, una funcion de cron, o el frontend directamente. Reemplaza la dependencia exclusiva de NotificationPushBridge (listener de Realtime en el navegador, que solo funciona con una pestaña abierta). Fire-and-forget: si pg_net falla o project_url/cron_shared_secret no estan configurados en system_settings, la notificacion interna ya quedo guardada igual (el insert nunca se bloquea). send-push-system deduplica por notification_id (indice unico parcial en push_send_log, migracion 0025), asi que no hay riesgo de doble envio si en el futuro volviera a existir tambien un camino client-side.';

revoke all on function dispatch_notification_push() from public;

create trigger trg_dispatch_notification_push
  after insert on notifications
  for each row execute function dispatch_notification_push();

comment on trigger trg_dispatch_notification_push on notifications is 'Dispara dispatch_notification_push() en cada notificacion nueva -- ver comentario de la funcion. Corre DESPUES de trg_audit_notifications (ambos AFTER INSERT, Postgres los ejecuta en orden alfabetico por nombre de trigger: trg_audit_notifications antes que trg_dispatch_notification_push), asi que el insert ya quedo auditado antes de intentar el push.';

-- ============================================================
-- send_weekly_reminder() / send_weekly_admin_summary(): ya no llaman a
-- pg_net manualmente -- el trigger nuevo las cubre automaticamente porque
-- ambas insertan en notifications igual que siempre. Se simplifican para no
-- disparar el push dos veces (una del trigger AFTER INSERT, otra de su
-- propio net.http_post con el mismo notificationId -- aunque
-- send-push-system dedupilica igual por notification_id, es una llamada a
-- pg_net completamente innecesaria en cada perfil, el doble en cada corrida
-- semanal).
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
    -- El push real ya no se dispara aca: trg_dispatch_notification_push (ver
    -- arriba) lo hace automaticamente con este mismo insert.
    insert into notifications (profile_id, type, title, body)
    values (v_profile.id, 'recordatorio_semanal', v_title, v_body);
  end loop;
end;
$$;

comment on function send_weekly_reminder() is 'Inserta el recordatorio institucional semanal (self-scope) para cada perfil activo con weekly_reminder_enabled=true. El push real lo dispara automaticamente trg_dispatch_notification_push (0085) en cada insert -- esta funcion ya no llama a pg_net directamente (antes lo hacia, duplicaba el disparo). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen las notificaciones. Llamado por el job de pg_cron "siger4-weekly-reminder". Si faltan project_url/cron_shared_secret en system_settings, igual crea las notificaciones internas y avisa a informatica_r4/integrante_informatica.';

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
    -- El push real ya no se dispara aca: trg_dispatch_notification_push (ver
    -- arriba) lo hace automaticamente con este mismo insert.
    insert into notifications (profile_id, type, title, body)
    values (v_profile.id, 'alerta_admin', v_title, v_body);
  end loop;
end;
$$;

comment on function send_weekly_admin_summary() is 'Resumen semanal enriquecido SOLO para informatica_r4/integrante_informatica. El push real lo dispara automaticamente trg_dispatch_notification_push (0085) en cada insert -- esta funcion ya no llama a pg_net directamente (antes lo hacia, duplicaba el disparo). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen las notificaciones. Lee project_url/cron_shared_secret de system_settings (migracion 0073) solo para decidir si avisar del problema, no para el push en si. Independiente de send_weekly_reminder() (0036), que sigue siendo el recordatorio genérico para todos los usuarios. Llamado por el job de pg_cron "siger4-weekly-admin-summary".';

revoke all on function send_weekly_admin_summary() from public;
