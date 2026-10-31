-- SIGER4 - Corrige violacion de notifications_scope_not_ambiguous en las
-- notificaciones de solicitudes de prestamo
--
-- Bug real reportado: crear una solicitud de prestamo (y, por el mismo bug,
-- registrar una devolucion) fallaba con un error generico. Causa exacta:
-- notify_loan_request_created() y notify_loan_request_status_change()
-- (0059_loan_request_notifications.sql) copiaron el patron de
-- notify_document_created() (0056) para armar el alcance territorial de una
-- notificacion masiva (profile_id null) cuando no hay un responsable puntual
-- a quien avisar -- pero ese patron SOLO es seguro en "documents" porque esa
-- tabla tiene el constraint documents_single_scope, que garantiza que como
-- mucho UNA de region_id/subsede_id/station_id/profile_id viene seteada en
-- el origen. inventory_items NO tiene una garantia asi: region_id es NOT
-- NULL siempre, y station_id (donde esta fisicamente el elemento) tambien
-- suele estar seteado al mismo tiempo -- asi que el trigger insertaba una
-- notificacion con DOS columnas de alcance territorial no nulas a la vez
-- (region_id Y station_id), violando notifications_scope_not_ambiguous
-- (0032_data_consistency_constraints.sql: profile_id null exige que como
-- mucho UNA de region/subsede/station este seteada). Esa violacion aborta
-- toda la transaccion del INSERT/UPDATE que disparo el trigger -- por eso
-- crear una solicitud sobre un item con station_id asignado, o registrar su
-- devolucion, fallaba siempre con un error de constraint que el frontend
-- terminaba mostrando como mensaje generico.
--
-- Fix: elegir UN solo nivel de alcance, el mas especifico disponible
-- (station > subsede > region), en vez de copiar los tres campos a la vez.

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
    -- Un solo nivel de alcance territorial, el mas especifico disponible --
    -- nunca mas de una columna no nula a la vez (ver notifications_scope_not_ambiguous).
    if v_item.station_id is not null then
      v_station_id := v_item.station_id;
    elsif v_item.subsede_id is not null then
      v_subsede_id := v_item.subsede_id;
    else
      v_region_id := v_item.region_id;
    end if;
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

comment on function notify_loan_request_created() is 'Notifica al responsable de la solicitud (o del elemento, o a un unico nivel de alcance territorial del elemento -- el mas especifico disponible -- si no hay responsable asignado) cuando se crea una solicitud de prestamo nueva. Corregido: antes podia setear mas de una columna de alcance a la vez y violar notifications_scope_not_ambiguous.';

create or replace function notify_loan_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_name text;
  v_item record;
  v_notify_profile_id uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_item from inventory_items where id = new.inventory_item_id;
  v_item_name := v_item.name;

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
    v_notify_profile_id := coalesce(new.responsible_profile_id, v_item.responsible_profile_id);

    if v_notify_profile_id is null then
      if v_item.station_id is not null then
        v_station_id := v_item.station_id;
      elsif v_item.subsede_id is not null then
        v_subsede_id := v_item.subsede_id;
      else
        v_region_id := v_item.region_id;
      end if;
    end if;

    insert into notifications (profile_id, region_id, subsede_id, station_id, type, title, body)
    values (
      v_notify_profile_id,
      v_region_id, v_subsede_id, v_station_id,
      'prestamo_devuelto',
      'Devolución registrada: ' || v_item_name,
      'Se registró la devolución de "' || v_item_name || '".'
    );
  end if;

  return new;
end;
$$;

comment on function notify_loan_request_status_change() is 'Notifica al solicitante cuando su solicitud se aprueba/rechaza, y al responsable (o a un unico nivel de alcance territorial, el mas especifico disponible) cuando se confirma la devolucion. Guardado con old.status is distinct from new.status para no reenviar en updates que no cambian el estado. Corregido: el branch de devuelta antes podia violar notifications_scope_not_ambiguous igual que notify_loan_request_created().';
