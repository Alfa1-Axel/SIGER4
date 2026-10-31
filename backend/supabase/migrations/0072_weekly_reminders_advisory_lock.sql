-- SIGER4 - Proteccion contra solapamiento de pg_cron en los recordatorios semanales
--
-- Investigacion del problema "no llegaron los recordatorios del lunes"
-- (2026-08-12): send_weekly_reminder() (0036) y send_weekly_admin_summary()
-- (0067) nunca tuvieron proteccion contra dos ejecuciones solapadas del mismo
-- job -- el mismo riesgo teorico que ya se corrigio puntualmente en
-- send_loan_return_reminders() (migracion 0070), cuyo propio comentario de
-- cabecera ya señalaba esta deuda pendiente en ambas funciones semanales.
-- No es la causa del problema reportado (los jobs corren una sola vez por
-- semana, nada que se solape en el uso normal), pero es la misma clase de
-- bug -- duplicados, no ausencias -- y conviene cerrarla por consistencia
-- ahora que se identifico de nuevo en la auditoria.
--
-- Fix identico al de 0070: pg_try_advisory_xact_lock al inicio de cada
-- funcion. Si otra ejecucion ya tiene el lock, la corrida actual no hace
-- nada y retorna de inmediato. El lock se libera solo al terminar la
-- transaccion (scope "xact"), que es exactamente el ciclo de vida de una
-- invocacion de pg_cron -- no hace falta un unlock manual. hashtextextended
-- usa el nombre de cada funcion para no chocar por casualidad con otro lock
-- del sistema (mismo criterio que 0070).
--
-- El resto de cada funcion es copia exacta de 0036/0067 -- no cambia ningun
-- calculo, filtro, cron.schedule (los jobs "siger4-weekly-reminder" y
-- "siger4-weekly-admin-summary" siguen con el mismo nombre/horario/body) ni
-- ninguna otra logica.

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

  v_project_url := current_setting('siger4.project_url', true);
  v_cron_secret := current_setting('siger4.cron_shared_secret', true);

  if v_project_url is null or v_cron_secret is null then
    raise warning 'send_weekly_reminder: faltan siger4.project_url / siger4.cron_shared_secret (ver DEPLOYMENT.md). Se insertan las notificaciones igual, pero no se puede disparar el push real.';
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

comment on function send_weekly_reminder() is 'Inserta el recordatorio institucional semanal (self-scope) para cada perfil activo con weekly_reminder_enabled=true, y dispara el push real via send-push-system (pg_net). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Llamado por el job de pg_cron "siger4-weekly-reminder". Requiere las config siger4.project_url / siger4.cron_shared_secret (ver DEPLOYMENT.md) para el push real; sin ellas, igual crea las notificaciones internas.';

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

  v_project_url := current_setting('siger4.project_url', true);
  v_cron_secret := current_setting('siger4.cron_shared_secret', true);

  -- Cuarteles en rojo (compliance_status='rojo'), con su % de carga
  -- institucional (compliant_count/compliant_total), el mismo dato que ya
  -- se muestra en /cuarteles — nombrado tal cual pide el ejemplo del pedido
  -- ("BV Villa del Rosario está al 43% de carga institucional").
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

  -- Cuarteles sin ninguna actividad relevante (asistencia/intervenciones/
  -- documentos/datos propios) hace más de 30 días — usa
  -- last_relevant_update_at, ya calculado por la vista.
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
    raise warning 'send_weekly_admin_summary: faltan siger4.project_url / siger4.cron_shared_secret (ver DEPLOYMENT.md). Se insertan las notificaciones igual, pero no se puede disparar el push real.';
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

comment on function send_weekly_admin_summary() is 'Resumen semanal enriquecido SOLO para informatica_r4/integrante_informatica: cuarteles en rojo/amarillo del semáforo con su % de carga, cuarteles sin actividad hace 30+ días, préstamos pendientes/vencidos, documentos nuevos, altas/bajas/eliminaciones de usuario, departamentos con actividad. Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron no dupliquen el envio. Independiente de send_weekly_reminder() (0036), que sigue siendo el recordatorio genérico para todos los usuarios. Llamado por el job de pg_cron "siger4-weekly-admin-summary".';

revoke all on function send_weekly_admin_summary() from public;
