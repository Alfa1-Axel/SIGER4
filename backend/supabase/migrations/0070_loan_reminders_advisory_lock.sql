-- SIGER4 - QA: evitar notificaciones duplicadas por solapamiento de pg_cron
--
-- Bug encontrado en auditoria de QA (2026-08-09): send_loan_return_reminders()
-- (migracion 0068) no tenia ninguna proteccion contra dos ejecuciones
-- solapadas del mismo job (pg_cron no serializa por defecto: si una corrida
-- tarda mas de una hora, la siguiente arranca igual). Sin proteccion, dos
-- ejecuciones concurrentes pueden leer la misma fila con
-- overdue_notified_at is null ANTES de que cualquiera de las dos la
-- actualice, generando notificaciones "vencido" duplicadas (alcance +
-- puntual + aviso a informatica, todo por duplicado) para una misma
-- solicitud. Mismo riesgo teorico ya existente en
-- send_calendar_event_reminders() (0051) y send_weekly_reminder()/
-- send_weekly_admin_summary() (0036/0067), pero se corrige puntualmente aca
-- porque es el caso senalado explicitamente en el pedido de QA
-- ("Confirmar que no se repite sin control").
--
-- Fix: pg_try_advisory_xact_lock al inicio de la funcion -- si otra
-- ejecucion ya tiene el lock, esta corrida no hace nada y retorna de
-- inmediato (en vez de arriesgarse a leer filas que la otra ejecucion
-- todavia no actualizo). El lock se libera solo al terminar la transaccion
-- (scope "xact", no hace falta un unlock manual), que es exactamente el
-- ciclo de vida de una invocacion de pg_cron. El numero de lock es
-- arbitrario pero fijo (hashtext del nombre de la funcion, para no chocar
-- por casualidad con otro lock del sistema).

create or replace function send_loan_return_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_item_name text;
  v_notify_profile_id uuid;
  v_lock_key bigint := hashtextextended('send_loan_return_reminders', 0);
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    raise notice 'send_loan_return_reminders: ya hay otra ejecucion en curso, se omite esta corrida.';
    return;
  end if;

  -- Aviso "por vencer": vence dentro de las próximas 24hs, todavía no se avisó.
  for v_loan in
    select l.*, i.name as item_name, i.responsible_profile_id as item_responsible_profile_id
    from inventory_loan_requests l
    join inventory_items i on i.id = l.inventory_item_id
    where l.status = 'retirada'
      and l.expected_return_at is not null
      and l.reminder_sent_at is null
      and l.expected_return_at > now()
      and l.expected_return_at <= now() + interval '24 hours'
  loop
    v_item_name := v_loan.item_name;
    v_notify_profile_id := coalesce(v_loan.responsible_profile_id, v_loan.item_responsible_profile_id);

    insert into notifications (station_id, type, title, body)
    values (
      v_loan.requesting_station_id,
      'prestamo_por_vencer',
      'Préstamo por vencer: ' || v_item_name,
      'El préstamo de "' || v_item_name || '" vence el ' || to_char(v_loan.expected_return_at, 'DD/MM/YYYY HH24:MI') || '. Coordiná la devolución.'
    );

    if v_notify_profile_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (
        v_notify_profile_id,
        'prestamo_por_vencer',
        'Préstamo por vencer: ' || v_item_name,
        'El préstamo de "' || v_item_name || '" vence el ' || to_char(v_loan.expected_return_at, 'DD/MM/YYYY HH24:MI') || '.'
      );
    end if;

    update inventory_loan_requests set reminder_sent_at = now() where id = v_loan.id;
  end loop;

  -- Aviso "vencido": ya pasó expected_return_at, sigue en retirada, todavía no se avisó.
  for v_loan in
    select l.*, i.name as item_name, i.responsible_profile_id as item_responsible_profile_id
    from inventory_loan_requests l
    join inventory_items i on i.id = l.inventory_item_id
    where l.status = 'retirada'
      and l.expected_return_at is not null
      and l.overdue_notified_at is null
      and l.expected_return_at <= now()
  loop
    v_item_name := v_loan.item_name;
    v_notify_profile_id := coalesce(v_loan.responsible_profile_id, v_loan.item_responsible_profile_id);

    insert into notifications (station_id, type, title, body)
    values (
      v_loan.requesting_station_id,
      'prestamo_vencido',
      'Préstamo vencido: ' || v_item_name,
      'El préstamo de "' || v_item_name || '" venció el ' || to_char(v_loan.expected_return_at, 'DD/MM/YYYY HH24:MI') || ' y todavía no fue devuelto.'
    );

    if v_notify_profile_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (
        v_notify_profile_id,
        'prestamo_vencido',
        'Préstamo vencido: ' || v_item_name,
        'El préstamo de "' || v_item_name || '" venció el ' || to_char(v_loan.expected_return_at, 'DD/MM/YYYY HH24:MI') || ' y todavía no fue devuelto.'
      );
    end if;

    perform notify_informatica_staff(
      'Préstamo vencido: ' || v_item_name,
      'El préstamo de "' || v_item_name || '" (cuartel solicitante incluido) venció el ' || to_char(v_loan.expected_return_at, 'DD/MM/YYYY HH24:MI') || ' y sigue sin devolverse.'
    );

    update inventory_loan_requests set overdue_notified_at = now() where id = v_loan.id;
  end loop;
end;
$$;

comment on function send_loan_return_reminders() is 'Recorre inventory_loan_requests con status=retirada: notifica "por vencer" 24hs antes de expected_return_at (una sola vez, reminder_sent_at), y "vencido" una vez pasado ese plazo sin devolución (una sola vez, overdue_notified_at). Destinatarios: cuartel solicitante (alcance), responsable del elemento (puntual), e informática (solo en el aviso de vencido). Usa pg_try_advisory_xact_lock para que dos ejecuciones solapadas del cron (ej. si una corrida tarda más de una hora) no generen notificaciones duplicadas -- la segunda simplemente no hace nada. Llamado por el job de pg_cron "siger4-loan-return-reminders" cada hora.';

revoke all on function send_loan_return_reminders() from public;
