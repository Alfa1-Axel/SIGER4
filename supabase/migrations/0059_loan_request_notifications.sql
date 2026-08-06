-- SIGER4 - Notificaciones automaticas de solicitudes de prestamo del Inventario Regional
--
-- Mismo patron ya establecido para el resto del sistema (ver
-- 0023_automatic_notifications.sql y 0056_document_notification_on_confirm.sql):
-- se inserta en "notifications" desde un trigger de Postgres, nunca desde el
-- frontend -- NotificationPushBridge.tsx ya escucha CUALQUIER insert en esa
-- tabla via Realtime y dispara el push correspondiente solo, asi que no hace
-- falta (ni conviene) que el cliente dispare nada aparte.
--
-- Dos triggers, cada uno guardado contra reenvios innecesarios:
--   1) trg_notify_loan_request_created (after insert): avisa a quien debe
--      resolver la solicitud -- el responsable puntual de la solicitud si
--      se cargo, si no el responsable del elemento, si no un aviso de
--      alcance regional/territorial del elemento (nadie asignado
--      puntualmente, pero el equipo regional necesita enterarse igual).
--   2) trg_notify_loan_request_status_change (after update, guardado con
--      "old.status is distinct from new.status"): avisa al solicitante
--      cuando su solicitud se aprueba o se rechaza, y al responsable cuando
--      se confirma la devolucion. No notifica en retirada/cancelada a
--      proposito -- retirada ya la sabe quien la retiro (accion propia),
--      cancelada es igual una decision del propio solicitante o del
--      responsable, no aporta enterarse por notificacion de algo que uno
--      mismo acaba de hacer.

create or replace function notify_loan_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_notify_profile_id uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
begin
  select * into v_item from inventory_items where id = new.inventory_item_id;

  v_notify_profile_id := coalesce(new.responsible_profile_id, v_item.responsible_profile_id);

  if v_notify_profile_id is null then
    v_region_id := v_item.region_id;
    v_subsede_id := v_item.subsede_id;
    v_station_id := v_item.station_id;
  end if;

  insert into notifications (profile_id, region_id, subsede_id, station_id, type, title, body)
  values (
    v_notify_profile_id,
    v_region_id, v_subsede_id, v_station_id,
    'prestamo_solicitado',
    'Nueva solicitud de préstamo: ' || v_item.name,
    'Se solicitó "' || v_item.name || '" para el cuartel correspondiente. Revisá la solicitud para aprobar o rechazar.'
  );
  return new;
end;
$$;

comment on function notify_loan_request_created() is 'Notifica al responsable de la solicitud (o del elemento, o al alcance territorial del elemento si no hay responsable asignado) cuando se crea una solicitud de prestamo nueva.';

create trigger trg_notify_loan_request_created
  after insert on inventory_loan_requests
  for each row execute function notify_loan_request_created();

create or replace function notify_loan_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_name text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select name into v_item_name from inventory_items where id = new.inventory_item_id;

  if new.status = 'aprobada' then
    insert into notifications (profile_id, type, title, body)
    values (new.requested_by_profile_id, 'prestamo_aprobado',
            'Solicitud aprobada: ' || v_item_name,
            'Tu solicitud de préstamo de "' || v_item_name || '" fue aprobada. Coordiná el retiro.');
  elsif new.status = 'rechazada' then
    insert into notifications (profile_id, type, title, body)
    values (new.requested_by_profile_id, 'prestamo_rechazado',
            'Solicitud rechazada: ' || v_item_name,
            'Tu solicitud de préstamo de "' || v_item_name || '" fue rechazada.'
              || case when new.rejection_reason is not null and length(trim(new.rejection_reason)) > 0
                       then ' Motivo: ' || new.rejection_reason
                       else '' end);
  elsif new.status = 'devuelta' then
    insert into notifications (
      profile_id, region_id, subsede_id, station_id, type, title, body
    )
    select
      coalesce(new.responsible_profile_id, ii.responsible_profile_id),
      case when coalesce(new.responsible_profile_id, ii.responsible_profile_id) is null then ii.region_id else null end,
      case when coalesce(new.responsible_profile_id, ii.responsible_profile_id) is null then ii.subsede_id else null end,
      case when coalesce(new.responsible_profile_id, ii.responsible_profile_id) is null then ii.station_id else null end,
      'prestamo_devuelto',
      'Devolución registrada: ' || ii.name,
      'Se registró la devolución de "' || ii.name || '".'
    from inventory_items ii
    where ii.id = new.inventory_item_id;
  end if;

  return new;
end;
$$;

comment on function notify_loan_request_status_change() is 'Notifica al solicitante cuando su solicitud se aprueba/rechaza, y al responsable cuando se confirma la devolucion. Guardado con old.status is distinct from new.status para no reenviar en updates que no cambian el estado.';

create trigger trg_notify_loan_request_status_change
  after update on inventory_loan_requests
  for each row execute function notify_loan_request_status_change();
