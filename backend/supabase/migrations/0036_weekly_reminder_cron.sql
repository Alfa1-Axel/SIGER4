-- SIGER4 - Recordatorio institucional semanal (lunes 12:00 hora Argentina)
--
-- Requiere DOS extensiones de Postgres que Supabase soporta pero que hay que
-- habilitar a mano desde el Dashboard antes de correr esta migracion (ver
-- DEPLOYMENT.md, seccion "Recordatorio semanal" para el paso a paso):
--   - pg_cron: para programar la ejecucion periodica.
--   - pg_net: para poder llamar a la Edge Function send-push-system via HTTP
--     desde dentro de una funcion de Postgres (necesario para el push real,
--     no solo la notificacion interna).
--
-- Si estas extensiones no estan habilitadas, esta migracion falla al crear
-- el job de cron o al intentar usar net.http_post — hacerlo en ese orden
-- (extensiones primero, migracion despues) evita un estado a medias.
--
-- Diseño:
--   1. profiles.weekly_reminder_enabled: cada usuario puede desactivar el
--      recordatorio desde /ajustes (true por defecto para todos).
--   2. send_weekly_reminder(): recorre los perfiles activos con el
--      recordatorio habilitado, inserta una notificacion self-scope
--      ('recordatorio_semanal') por cada uno, y dispara el push real via
--      send-push-system (pg_net, fire-and-forget: no bloquea el resto del
--      job si un pedido individual tarda o falla).
--   3. Un job de pg_cron programado para lunes 12:00 hora Argentina.
--      pg_cron programa en UTC; Argentina es UTC-3 todo el año (no tiene
--      horario de verano desde 2009), asi que 12:00 ART = 15:00 UTC.
--
-- CRON_SHARED_SECRET y la URL del proyecto se guardan como config de la
-- base (no hay forma de leer variables de entorno de Edge Functions desde
-- SQL): se setean con ALTER DATABASE ... SET, ver instrucciones en
-- DEPLOYMENT.md. Esta migracion deja placeholders que fallan con un mensaje
-- claro si no se configuraron.

alter table profiles
  add column if not exists weekly_reminder_enabled boolean not null default true;

comment on column profiles.weekly_reminder_enabled is 'Si el usuario recibe el recordatorio institucional semanal (lunes 12:00 ART). true por defecto para todos; cada usuario lo puede desactivar desde /ajustes.';

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
begin
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

comment on function send_weekly_reminder() is 'Inserta el recordatorio institucional semanal (self-scope) para cada perfil activo con weekly_reminder_enabled=true, y dispara el push real via send-push-system (pg_net). Llamado por el job de pg_cron "siger4-weekly-reminder". Requiere las config siger4.project_url / siger4.cron_shared_secret (ver DEPLOYMENT.md) para el push real; sin ellas, igual crea las notificaciones internas.';

revoke all on function send_weekly_reminder() from public;

-- El job de pg_cron corre como el rol que ejecuta esta migracion (postgres),
-- que ya tiene permiso para llamar a esta funcion SECURITY DEFINER sin
-- GRANT adicional.
select cron.schedule(
  'siger4-weekly-reminder',
  '0 15 * * 1', -- lunes 15:00 UTC = lunes 12:00 ART (Argentina es UTC-3 fijo)
  $$select send_weekly_reminder()$$
);
