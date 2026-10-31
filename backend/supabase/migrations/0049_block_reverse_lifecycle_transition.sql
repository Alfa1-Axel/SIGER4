-- SIGER4 - Bloquear tambien la transicion INVERSA de baja de flota/separacion
--
-- Bug encontrado en auditoria de QA: block_direct_vehicle_decommission() y
-- block_direct_personnel_separation() (0038/0040) solo bloqueaban ENTRAR a
-- vendido/transferido/baja (o renuncia/baja/pase/reserva) por UPDATE directo
-- sin motivo. La transicion inversa (sacar un vehiculo/integrante de esos
-- estados, ej. reactivar un vehiculo "de baja" a "operativo") no estaba
-- bloqueada: cualquier usuario con permiso de escritura normal sobre esa
-- tabla podia hacerlo con un UPDATE directo (ej. .from('vehicles').update(...)
-- desde la consola del navegador con su propia sesion), sin motivo
-- obligatorio y sin fila en vehicle_status_history/personnel_status_history
-- (el unico rastro quedaba en el audit_logs generico, con el motivo enterrado
-- en el JSON diff en vez del historial dedicado que muestra el detalle del
-- cuartel).
--
-- Hoy no existe ningun flujo de UI para reactivar (CuartelDetallePage oculta
-- los controles de cambio de estado cuando el vehiculo/integrante ya esta en
-- un estado de baja/separacion), asi que no hay ninguna forma legitima de
-- necesitar esta transicion por fuera de un caso excepcional que
-- informatica_r4 puede resolver directo en el SQL Editor (bypasea el
-- trigger corriendo como superusuario, o setea el flag de sesion a mano).
-- Se bloquea la transicion inversa tambien, con el mismo criterio que la de
-- entrada.

create or replace function block_direct_vehicle_decommission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and (new.status in ('vendido', 'transferido', 'baja') or old.status in ('vendido', 'transferido', 'baja'))
  then
    if current_setting('siger4.via_change_vehicle_status', true) is distinct from 'true' then
      raise exception 'Para dar de baja, vender, transferir o reactivar un vehículo hay que usar el flujo correspondiente (requiere un motivo obligatorio).';
    end if;
  end if;
  return new;
end;
$$;

comment on function block_direct_vehicle_decommission() is 'Impide pasar vehicles.status hacia O DESDE vendido/transferido/baja via UPDATE directo (sin motivo) — ver 0049. Solo change_vehicle_status() puede hacerlo (setea el flag de sesion siger4.via_change_vehicle_status antes de actualizar). No existe flujo de reactivacion por change_vehicle_status() hoy (solo acepta vendido/transferido/baja como destino): reactivar un vehiculo requiere accion directa de informatica_r4 en la base.';

create or replace function block_direct_personnel_separation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and (new.status in ('renuncia', 'baja', 'pase', 'reserva') or old.status in ('renuncia', 'baja', 'pase', 'reserva'))
  then
    if current_setting('siger4.via_change_personnel_status', true) is distinct from 'true' then
      raise exception 'Para pasar a renuncia, baja, pase, reserva o reactivar hay que usar el flujo correspondiente (requiere un motivo obligatorio).';
    end if;
  end if;
  return new;
end;
$$;

comment on function block_direct_personnel_separation() is 'Impide pasar personnel.status hacia O DESDE renuncia/baja/pase/reserva via UPDATE directo (sin motivo) — ver 0049. No existe flujo de reactivacion por change_personnel_status() hoy: reactivar un integrante requiere accion directa de informatica_r4 en la base.';
