-- SIGER4 - Recordatorio automatico de devolucion de prestamos
--
-- Para solicitudes con status='retirada' (el elemento esta fisicamente
-- afuera del inventario regional) y expected_return_at definido:
--   - 24hs antes del vencimiento: notificacion "por vencer" una sola vez
--     (reminder_sent_at se marca para no repetirla en cada corrida del cron).
--   - ya vencido y todavia no devuelto: notificacion "vencido" una sola vez
--     (overdue_notified_at se marca, mismo criterio -- no se repite
--     indefinidamente, evita spam).
--
-- Mismo patron que send_calendar_event_reminders() (0051): funcion +
-- pg_cron, sin pg_net (inserta en notifications y deja que
-- NotificationPushBridge dispare el push si el destinatario tiene la app
-- abierta) -- salvo para el aviso a informatica de un prestamo vencido, que
-- ademas de la notificacion interna usa notify_informatica_staff (0066),
-- ya que es la via ya establecida para alertas administrativas.
--
-- Destinatarios (segun el pedido: "cuartel solicitante, responsable del
-- elemento e informatica si corresponde"):
--   - requesting_station_id (notificacion de alcance = ese cuartel, sin
--     profile_id -- la ve cualquiera con ese alcance, igual que el resto de
--     notificaciones de alcance territorial del sistema).
--   - responsible_profile_id (o inventory_items.responsible_profile_id si
--     la solicitud no tiene uno propio) -- notificacion puntual, si existe.
--   - informatica_r4/integrante_informatica: SOLO en el aviso de vencido (no
--     en el de "por vencer" -- evita que informatica reciba un aviso por
--     cada prestamo de cada cuartel que todavia esta en plazo; solo se
--     escala cuando ya es un problema real).

alter type notification_type add value if not exists 'prestamo_por_vencer';
alter type notification_type add value if not exists 'prestamo_vencido';

alter table inventory_loan_requests
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists overdue_notified_at timestamptz;

comment on column inventory_loan_requests.reminder_sent_at is 'Cuándo se envió el recordatorio de "préstamo por vencer" (24hs antes de expected_return_at). Null = todavía no se envió. Evita reenviar el mismo aviso en cada corrida del cron.';
comment on column inventory_loan_requests.overdue_notified_at is 'Cuándo se envió el aviso de "préstamo vencido" (expected_return_at ya pasado y status sigue en retirada). Null = todavía no se envió.';

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
begin
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

comment on function send_loan_return_reminders() is 'Recorre inventory_loan_requests con status=retirada: notifica "por vencer" 24hs antes de expected_return_at (una sola vez, reminder_sent_at), y "vencido" una vez pasado ese plazo sin devolución (una sola vez, overdue_notified_at). Destinatarios: cuartel solicitante (alcance), responsable del elemento (puntual), e informática (solo en el aviso de vencido). Llamado por el job de pg_cron "siger4-loan-return-reminders" cada hora.';

revoke all on function send_loan_return_reminders() from public;

select cron.schedule(
  'siger4-loan-return-reminders',
  '0 * * * *', -- cada hora, en punto
  $$select send_loan_return_reminders()$$
);
