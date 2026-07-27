-- SIGER4 - Nuevos campos de vehiculos: capacidad y observaciones
--
-- La capacidad se separa en dos columnas porque litros de agua y cantidad de
-- tripulantes son magnitudes distintas que no deben mezclarse en un solo campo
-- (una autobomba carga agua, una ambulancia carga personal, y algunos
-- vehiculos pueden tener ambos datos).

alter table vehicles
  add column if not exists water_capacity_liters integer,
  add column if not exists crew_capacity integer,
  add column if not exists observations text;

comment on column vehicles.water_capacity_liters is 'Capacidad de agua en litros (si aplica al tipo de vehiculo).';
comment on column vehicles.crew_capacity is 'Capacidad de personal/tripulantes (si aplica al tipo de vehiculo).';
comment on column vehicles.observations is 'Observaciones libres sobre el estado/uso del vehiculo.';
