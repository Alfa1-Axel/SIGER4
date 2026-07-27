-- SIGER4 - Simplificar el estado de cuarteles a solo dos valores
-- Antes: operativo | mantenimiento | alerta
-- Ahora: operativo | no_operativo
--
-- Postgres no permite eliminar valores de un enum existente, asi que se crea
-- un tipo nuevo, se migran los datos y se reemplaza la columna.

alter type station_status rename to station_status_old;

create type station_status as enum ('operativo', 'no_operativo');

alter table stations
  alter column status drop default;

alter table stations
  alter column status type station_status
  using (
    case status::text
      when 'operativo' then 'operativo'
      else 'no_operativo'
    end
  )::station_status;

alter table stations
  alter column status set default 'operativo';

drop type station_status_old;
