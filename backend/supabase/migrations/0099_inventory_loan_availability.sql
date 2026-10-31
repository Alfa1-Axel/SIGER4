-- SIGER4 - Inventario: un elemento prestado no se puede volver a pedir
--
-- REQUISITO: 0057_inventory_loan_requests.sql.
--
-- Cada elemento del Inventario Regional es una unidad (no hay cantidades).
-- Hasta acá solo se miraba inventory_items.status: un elemento entregado a
-- un cuartel seguía figurando "disponible" y otro cuartel podía pedirlo, o
-- se podían aprobar dos préstamos a la vez. Desde esta migración:
--   - No se puede crear una solicitud si el elemento tiene un préstamo
--     activo (solicitud aprobada o retirada, todavía sin devolver).
--   - Un cuartel no puede tener dos solicitudes pendientes del mismo
--     elemento.
--   - No se puede aprobar ni registrar el retiro de una solicitud si el
--     elemento ya tiene otro préstamo activo.
-- Los mensajes de error son para mostrar tal cual al usuario. Las policies
-- (quién puede solicitar y gestionar) no cambian.

create or replace function validate_inventory_loan_request_item_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_status inventory_status;
  v_active record;
begin
  select status into v_item_status from inventory_items where id = new.inventory_item_id;

  if v_item_status is null then
    raise exception 'El elemento no existe o fue eliminado del inventario.';
  end if;
  if v_item_status = 'baja' then
    raise exception 'No se puede solicitar un elemento dado de baja.';
  end if;
  if v_item_status = 'mantenimiento' then
    raise exception 'El elemento está en mantenimiento: no se puede solicitar por ahora.';
  end if;
  if v_item_status = 'no_disponible' then
    raise exception 'El elemento no está disponible para solicitar en este momento.';
  end if;

  select r.status, s.name as station_name, r.expected_return_at
  into v_active
  from inventory_loan_requests r
  join stations s on s.id = r.requesting_station_id
  where r.inventory_item_id = new.inventory_item_id
    and r.status in ('aprobada', 'retirada')
  limit 1;

  if found then
    raise exception 'El elemento ya está %: no se puede solicitar hasta que se devuelva.',
      case when v_active.status = 'retirada' then 'prestado a ' || v_active.station_name else 'reservado para ' || v_active.station_name end;
  end if;

  if exists (
    select 1 from inventory_loan_requests r
    where r.inventory_item_id = new.inventory_item_id
      and r.requesting_station_id = new.requesting_station_id
      and r.status = 'pendiente'
  ) then
    raise exception 'Ese cuartel ya tiene una solicitud pendiente de este elemento. Esperá la respuesta del responsable o cancelala antes de pedir otra.';
  end if;

  return new;
end;
$$;

comment on function validate_inventory_loan_request_item_status() is 'Al crear una solicitud: el elemento tiene que estar disponible (no de baja, en mantenimiento ni no disponible), sin un préstamo activo (aprobada o retirada) y sin otra solicitud pendiente del mismo cuartel.';

create or replace function validate_inventory_loan_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo importa al pasar a aprobada o retirada: es cuando el elemento
  -- queda comprometido para ese cuartel.
  if new.status in ('aprobada', 'retirada')
     and new.status is distinct from old.status
     and exists (
       select 1 from inventory_loan_requests r
       where r.inventory_item_id = new.inventory_item_id
         and r.id <> new.id
         and r.status in ('aprobada', 'retirada')
     ) then
    raise exception 'El elemento ya tiene otro préstamo activo. Registrá la devolución o cancelá ese préstamo antes de aprobar este.';
  end if;
  return new;
end;
$$;

comment on function validate_inventory_loan_request_transition() is 'Impide aprobar o registrar el retiro de una solicitud si el mismo elemento ya tiene otro préstamo activo.';

drop trigger if exists trg_validate_inventory_loan_request_transition on inventory_loan_requests;
create trigger trg_validate_inventory_loan_request_transition
  before update on inventory_loan_requests
  for each row execute function validate_inventory_loan_request_transition();

revoke all on function validate_inventory_loan_request_transition() from public;
