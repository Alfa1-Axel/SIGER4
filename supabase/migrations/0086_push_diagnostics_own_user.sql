-- SIGER4 - Diagnostico push del usuario actual (para el boton "Probar push
-- server-side" de Ajustes, seccion 7 del pedido)
--
-- get_weekly_push_diagnostics() (0074) exige un notification_type puntual
-- (pensada para recordatorio_semanal/alerta_admin) y is_informatica_r4() --
-- util para el diagnostico administrativo general, pero no sirve para que
-- CUALQUIER usuario vea el estado de sus propias suscripciones/ultimos
-- envios sin ser informatica. Esta migracion agrega
-- get_own_push_diagnostics(): mismo criterio (cruza notifications contra
-- push_send_log), pero acotado al perfil actual, sin filtro de tipo, y sin
-- requerir is_informatica_r4() -- cualquier usuario autenticado puede ver
-- su propio historial (mismo criterio de "transparencia sobre lo propio"
-- que ya usa push_send_log_select_own, 0025).

create or replace function get_own_push_diagnostics(p_limit integer default 10)
returns table (
  notification_id uuid,
  notification_title text,
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
    n.title as notification_title,
    n.created_at as notification_created_at,
    (psl.id is not null) as push_attempted,
    psl.status as push_status,
    psl.sent_count as push_sent_count,
    psl.recipients_count as push_recipients_count,
    psl.error_message as push_error_message
  from notifications n
  left join push_send_log psl on psl.notification_id = n.id
  where n.profile_id = current_profile_id()
  order by n.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

comment on function get_own_push_diagnostics(integer) is 'Diagnostico de push acotado al perfil actual (sin exigir is_informatica_r4(), a diferencia de get_weekly_push_diagnostics de 0074): las ultimas notificaciones propias (profile_id-puntual) cruzadas contra push_send_log, para que el boton "Probar push server-side" de Ajustes pueda mostrar si el push se intento/logro enviar y a cuantos dispositivos, sin esperar al cron semanal. push_attempted=false + notificacion reciente = el trigger trg_dispatch_notification_push (0085) no pudo disparar pg_net (project_url/cron_shared_secret no configurados, o pg_net con problemas).';

revoke all on function get_own_push_diagnostics(integer) from public;
grant execute on function get_own_push_diagnostics(integer) to authenticated;

-- ============================================================
-- Cantidad de suscripciones activas del usuario actual, sin depender de la
-- policy push_subscriptions_select_own_or_admin (evita un select directo
-- extra desde el cliente para un dato tan simple).
-- ============================================================

create or replace function get_own_push_subscription_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from push_subscriptions where profile_id = current_profile_id();
$$;

comment on function get_own_push_subscription_count() is 'Cantidad de dispositivos/navegadores con suscripcion push activa (push_subscriptions) del perfil actual -- usado en el diagnostico de Ajustes.';

revoke all on function get_own_push_subscription_count() from public;
grant execute on function get_own_push_subscription_count() to authenticated;
