-- SIGER4 - Diagnostico: ¿corrio el job de pg_cron? (investigacion del
-- recordatorio semanal que no llego un lunes)
--
-- Contexto: get_weekly_push_diagnostics() (migracion 0074) responde "¿la
-- notificacion interna disparo el push real?", cruzando notifications contra
-- push_send_log -- pero da por sentado que send_weekly_reminder()/
-- send_weekly_admin_summary() efectivamente corrieron. Si el job de pg_cron
-- nunca se creo (la migracion 0036/0067 no llego a correr en produccion,
-- o alguien lo desactivo/elimino), o corrio pero la funcion lanzo una
-- excepcion antes de insertar ninguna notificacion, get_weekly_push_diagnostics
-- devuelve 0 filas -- indistinguible, desde la app, de "no habia nada que
-- notificar esa semana".
--
-- Esta migracion agrega la pieza que faltaba: get_cron_job_diagnostics(),
-- que lee cron.job (el job esta programado, con que expresion) y
-- cron.job_run_details (las ultimas corridas reales: cuando, si tuvo exito,
-- que mensaje de error dejo pg_cron si fallo). Ambas tablas viven en el
-- schema "cron" de la extension pg_cron y solo son legibles por su
-- dueño/superusuario -- una funcion SECURITY DEFINER (dueña del rol que
-- corre las migraciones, que es quien tambien creo los jobs) puede leerlas
-- sin necesidad de otorgar acceso directo al schema cron desde el cliente.

create or replace function get_cron_job_diagnostics(p_job_name text)
returns table (
  job_exists boolean,
  schedule text,
  active boolean,
  run_start timestamptz,
  run_end timestamptz,
  run_status text,
  run_message text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_informatica_r4() then
    raise exception 'Solo informatica_r4 puede consultar el diagnóstico de jobs de cron.';
  end if;

  if not exists (select 1 from cron.job where jobname = p_job_name) then
    return query select false, null::text, null::boolean, null::timestamptz, null::timestamptz, null::text, null::text;
    return;
  end if;

  return query
  select
    true as job_exists,
    j.schedule,
    j.active,
    d.start_time as run_start,
    d.end_time as run_end,
    d.status as run_status,
    d.return_message as run_message
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  where j.jobname = p_job_name
  order by d.start_time desc nulls last
  limit 10;
end;
$$;

comment on function get_cron_job_diagnostics(text) is 'Diagnostico de "¿el job de pg_cron existe, está activo, y corrió realmente?" -- complementa a get_weekly_push_diagnostics() (0074), que solo puede responder sobre lo que ya quedó en notifications/push_send_log. Si get_weekly_push_diagnostics() devuelve 0 filas para una semana dada, esta función distingue "no había nada que notificar" de "el job nunca corrió" (job_exists=false, o corrió con run_status=''failed''). Lee cron.job/cron.job_run_details (schema de la extensión pg_cron, solo legible por su dueño) vía SECURITY DEFINER -- nunca se otorga acceso directo al schema cron desde el cliente. Devuelve las últimas 10 corridas del job pedido (por nombre exacto: ''siger4-weekly-reminder'', ''siger4-weekly-admin-summary'', ''siger4-document-purge'', ''siger4-loan-return-reminders'', ''siger4-calendar-reminders''), o una fila con job_exists=false si el job no está programado.';

revoke all on function get_cron_job_diagnostics(text) from public;
grant execute on function get_cron_job_diagnostics(text) to authenticated;
