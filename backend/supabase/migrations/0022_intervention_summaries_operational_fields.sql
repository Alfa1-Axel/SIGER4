-- SIGER4 - Intervenciones: campos operativos minimos para estadistica real
--
-- intervention_summaries solo tenia periodo/cuartel/categoria/cantidad total.
-- Para poder responder preguntas institucionales reales (que subsede tiene
-- mas actividad, que horarios concentran mas salidas, relacion entre dotacion
-- e intervenciones, evolucion mensual) hacen falta datos operativos basicos
-- por resumen. Se agregan como columnas nuevas, todas opcionales salvo
-- personnel_count/vehicles_count/work_hours que tienen default 0 (si no se
-- cargan, no rompen resumenes ya existentes).
--
-- Deliberadamente NO se agrega nada que identifique victimas, direcciones
-- exactas o personas involucradas: esto sigue siendo un resumen agregado por
-- periodo/cuartel, no un registro individual de siniestro.

create type intervention_time_of_day as enum ('diurno', 'nocturno', 'mixto');

alter table intervention_summaries
  add column if not exists time_of_day intervention_time_of_day,
  add column if not exists observations text,
  add column if not exists personnel_count integer not null default 0,
  add column if not exists vehicles_count integer not null default 0,
  add column if not exists work_hours numeric(6, 1) not null default 0;

comment on column intervention_summaries.time_of_day is 'Franja horaria predominante de las intervenciones del resumen: diurno, nocturno, o mixto si hubo de ambas.';
comment on column intervention_summaries.observations is 'Notas libres del resumen (sin datos de victimas ni direcciones exactas).';
comment on column intervention_summaries.personnel_count is 'Cantidad de personal que participo de las intervenciones del periodo (para relacionar dotacion vs. actividad operativa).';
comment on column intervention_summaries.vehicles_count is 'Cantidad de moviles/vehiculos que participaron de las intervenciones del periodo.';
comment on column intervention_summaries.work_hours is 'Horas de trabajo totales dedicadas a las intervenciones del periodo.';
