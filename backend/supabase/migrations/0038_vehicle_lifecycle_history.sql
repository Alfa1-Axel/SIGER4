-- SIGER4 - Historial de vehiculos y baja/venta/transferencia con motivo obligatorio
--
-- Problema (nuevo requerimiento): cuando un movil se vende, pasa a otro
-- cuartel o se da de baja, no debe eliminarse fisicamente (se pierde
-- trazabilidad historica), pero tampoco debe seguir contando en
-- vehicles_count del cuartel. Se necesita ademas observacion obligatoria,
-- fecha, responsable y motivo registrados, con auditoria completa e
-- historial visible. Requiere los valores nuevos de vehicle_status agregados
-- en 0037_vehicle_status_new_values.sql.
--
-- Diseño:
--   1. sync_station_vehicles_count() se redefine para NO contar vehiculos en
--      vendido/transferido/baja (antes contaba TODOS los vehiculos sin
--      filtrar por estado).
--   2. vehicle_status_history: una fila por cada cambio de estado real hacia
--      un estado de baja de flota, con quien lo hizo, cuando, motivo y el
--      cuartel en el momento del cambio (por si despues se transfiere a otro
--      cuartel, no se pierde en que cuartel estaba antes).
--   3. change_vehicle_status(): unico camino soportado para cambiar el
--      estado de un vehiculo a vendido/transferido/baja. Exige un motivo no
--      vacio. Un trigger bloquea llegar a esos 3 estados por UPDATE directo
--      (sin pasar por la RPC), para que el motivo nunca quede vacio. Los
--      otros 3 estados (operativo/mantenimiento/fuera_de_servicio) se siguen
--      pudiendo editar por UPDATE directo, sin cambios (no rompe
--      VehiculoFormPage).

create or replace function sync_station_vehicles_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update stations set vehicles_count = (
      select count(*) from vehicles where station_id = new.station_id and status not in ('vendido', 'transferido', 'baja')
    ) where id = new.station_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    update stations set vehicles_count = (
      select count(*) from vehicles where station_id = new.station_id and status not in ('vendido', 'transferido', 'baja')
    ) where id = new.station_id;
    if (old.station_id is distinct from new.station_id) then
      update stations set vehicles_count = (
        select count(*) from vehicles where station_id = old.station_id and status not in ('vendido', 'transferido', 'baja')
      ) where id = old.station_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    update stations set vehicles_count = (
      select count(*) from vehicles where station_id = old.station_id and status not in ('vendido', 'transferido', 'baja')
    ) where id = old.station_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function sync_station_vehicles_count() is 'Recalcula stations.vehicles_count desde la tabla vehicles, excluyendo vehiculos en estado vendido/transferido/baja (ya no son flota activa del cuartel aunque el registro se conserva para historial).';

-- Backfill: recalcular con el criterio nuevo por si ya existian vehiculos en
-- estos estados antes de esta migracion (no deberia haber, pero por las
-- dudas).
update stations s
set vehicles_count = (
  select count(*) from vehicles v where v.station_id = s.id and v.status not in ('vendido', 'transferido', 'baja')
);

-- ============================================================
-- Historial de estado
-- ============================================================

create table vehicle_status_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  previous_status vehicle_status not null,
  new_status vehicle_status not null,
  reason text not null,
  changed_by_profile_id uuid references profiles(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table vehicle_status_history is 'Historial de cambios de estado de un vehiculo hacia vendido/transferido/baja (quien, cuando, motivo, en que cuartel estaba). Se llena via change_vehicle_status(), nunca por UPDATE directo.';

create index idx_vehicle_status_history_vehicle_id on vehicle_status_history(vehicle_id, created_at desc);

alter table vehicle_status_history enable row level security;

create policy "vehicle_status_history_select_scope" on vehicle_status_history
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- Sin policy de insert/update/delete para authenticated: solo se escribe via
-- change_vehicle_status() (SECURITY DEFINER, bypasea RLS de esta tabla).

-- ============================================================
-- Bloquear UPDATE directo hacia estados de baja de flota (sin motivo)
-- ============================================================

create or replace function block_direct_vehicle_decommission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('vendido', 'transferido', 'baja') and old.status is distinct from new.status then
    if current_setting('siger4.via_change_vehicle_status', true) is distinct from 'true' then
      raise exception 'Para dar de baja, vender o transferir un vehículo hay que usar el flujo correspondiente (requiere un motivo obligatorio).';
    end if;
  end if;
  return new;
end;
$$;

comment on function block_direct_vehicle_decommission() is 'Impide pasar vehicles.status a vendido/transferido/baja via UPDATE directo (sin motivo). Solo change_vehicle_status() puede hacerlo (setea el flag de sesion siger4.via_change_vehicle_status antes de actualizar).';

create trigger trg_block_direct_vehicle_decommission
  before update on vehicles
  for each row execute function block_direct_vehicle_decommission();

create or replace function change_vehicle_status(
  p_vehicle_id uuid,
  p_new_status vehicle_status,
  p_reason text
)
returns vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle vehicles;
  v_actor uuid;
begin
  if p_new_status not in ('vendido', 'transferido', 'baja') then
    raise exception 'change_vehicle_status solo se usa para dar de baja, vender o transferir un vehículo. Para otros estados, actualizá el vehículo normalmente.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'El motivo es obligatorio para dar de baja, vender o transferir un vehículo.';
  end if;

  select * into v_vehicle from vehicles where id = p_vehicle_id;
  if v_vehicle.id is null then
    raise exception 'Vehículo no encontrado.';
  end if;

  -- Misma autorizacion que vehicles_write_admin_regional_station (RLS): se
  -- revalida aca porque esta funcion es SECURITY DEFINER y bypasea RLS.
  if not (
    is_informatica_r4()
    or (is_regional_role() and v_vehicle.station_id in (select id from stations where region_id in (select my_region_ids())))
    or (v_vehicle.station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  ) then
    raise exception 'No tenés permiso para cambiar el estado de este vehículo.';
  end if;

  v_actor := current_profile_id();

  insert into vehicle_status_history (vehicle_id, previous_status, new_status, reason, changed_by_profile_id, station_id)
  values (p_vehicle_id, v_vehicle.status, p_new_status, trim(p_reason), v_actor, v_vehicle.station_id);

  perform set_config('siger4.via_change_vehicle_status', 'true', true);
  update vehicles set status = p_new_status, observations = coalesce(observations || E'\n', '') || '[' || p_new_status || '] ' || trim(p_reason)
  where id = p_vehicle_id
  returning * into v_vehicle;
  perform set_config('siger4.via_change_vehicle_status', 'false', true);

  return v_vehicle;
end;
$$;

comment on function change_vehicle_status(uuid, vehicle_status, text) is 'Unico camino para pasar un vehiculo a vendido/transferido/baja: exige motivo no vacio, registra vehicle_status_history (quien/cuando/motivo/cuartel) y agrega el motivo a observations para que quede visible en el detalle del vehiculo. La auditoria generica (audit_row_change, ya dispara sobre vehicles) sigue registrando el UPDATE en si.';

revoke all on function change_vehicle_status(uuid, vehicle_status, text) from public;
grant execute on function change_vehicle_status(uuid, vehicle_status, text) to authenticated;

revoke all on function block_direct_vehicle_decommission() from public;
