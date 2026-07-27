-- SIGER4 - Mantener stations.vehicles_count sincronizado automaticamente
--
-- stations.vehicles_count es una columna almacenada que hasta ahora nunca se
-- actualizaba al cargar vehiculos reales (quedaba en el valor con el que se
-- creo el cuartel). Este trigger recalcula el conteo real desde la tabla
-- vehicles cada vez que se inserta, borra, o cambia el station_id de un
-- vehiculo.

create or replace function sync_station_vehicles_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = new.station_id)
    where id = new.station_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = new.station_id)
    where id = new.station_id;
    if (old.station_id is distinct from new.station_id) then
      update stations set vehicles_count = (select count(*) from vehicles where station_id = old.station_id)
      where id = old.station_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    update stations set vehicles_count = (select count(*) from vehicles where station_id = old.station_id)
    where id = old.station_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function sync_station_vehicles_count() is 'Recalcula stations.vehicles_count desde la tabla vehicles cada vez que cambian los vehiculos de un cuartel.';

create trigger trg_sync_station_vehicles_count
  after insert or update or delete on vehicles
  for each row execute function sync_station_vehicles_count();

-- Backfill: corregir el conteo de los cuarteles que ya tienen vehiculos
-- cargados desde antes de que existiera este trigger.
update stations s
set vehicles_count = (select count(*) from vehicles v where v.station_id = s.id);
