-- SIGER4 - Semaforo de Carga / Cumplimiento por Cuartel
--
-- Nuevo modulo (ciclo funcional 2026-08): indicador visual (verde/amarillo/
-- rojo) de que tan al dia esta la carga de datos de cada cuartel. NO inventa
-- datos ni estima nada: cada criterio se deriva de filas/columnas que ya
-- existen (contacto institucional, personal activo, vehiculos, asistencia/
-- intervenciones recientes, documentos, historial institucional, eventos de
-- calendario). Si algo no esta cargado, cuenta como pendiente — nunca se
-- asume "probablemente esta bien".
--
-- Implementacion: VISTA SQL (station_compliance), no una tabla ni una
-- funcion que traiga filas al frontend para calcular ahi — todo el agregado
-- (EXISTS/COUNT/MAX) corre en Postgres, la vista devuelve una fila resumen
-- por cuartel. "security_invoker = true" es explicito porque Postgres 15+
-- NO lo pone por default en las vistas (corren como el dueno de la vista si
-- no se especifica) — sin esto, la vista bypasearia el RLS de stations/
-- personnel/vehicles/etc. y cualquier usuario veria el cumplimiento de
-- CUALQUIER cuartel. Con security_invoker=true, la vista respeta el RLS de
-- cada tabla que referencia con la identidad real de quien consulta: mismo
-- alcance que ya tiene stations_select_scope (informatica_r4 todo,
-- secretario_regional/is_escuela_role() su region, cualquiera con
-- my_station_ids() o my_subsede_ids() su cuartel/subsede, invitado su
-- cuartel) — no hace falta una policy de RLS propia porque la vista no es
-- una tabla con su propio RLS, hereda el de las tablas subyacentes.
--
-- Umbrales (ajustables editando esta vista en una migracion futura, no hay
-- tabla de configuracion separada para mantener esto simple en esta primera
-- version):
--   - Asistencia "reciente": al menos un attendance_summaries con created_at
--     dentro de los ultimos 45 dias.
--   - Intervenciones "recientes": al menos un intervention_summaries con
--     created_at dentro de los ultimos 45 dias.
--   (45 dias cubre el ciclo mensual de carga esperado con margen; se puede
--   ajustar cambiando el "interval '45 days'" mas abajo).
--
-- Criterios "criticos" (si falta cualquiera, el cuartel es ROJO sin
-- importar el resto):
--   - datos institucionales basicos: phone o email cargados.
--   - personal activo cargado (stations.personnel_count > 0, ya mantenido
--     por trigger, solo cuenta status='activo').
--   - vehiculos cargados (stations.vehicles_count > 0, ya mantenido por
--     trigger).
--
-- Criterios "no criticos" (si falta alguno pero los criticos estan OK, el
-- cuartel es AMARILLO):
--   - asistencia reciente cargada.
--   - intervenciones recientes cargadas.
--   - al menos un documento institucional cargado para ese cuartel
--     (documents.station_id = ese cuartel; no cuenta documentos de
--     region/subsede que no sean especificos del cuartel).
--
-- Verde: todos los criticos Y todos los no criticos cumplidos.
--
-- Historial institucional (station_history_events) y eventos de calendario
-- (calendar_events) se informan como columnas separadas (has_history_events,
-- has_calendar_events) pero NO entran en el calculo del color: son
-- opcionales por naturaleza (un cuartel puede no tener hechos historicos
-- relevantes para cargar todavia, o ningun evento programado, sin que eso
-- signifique que esta "desactualizado") — se muestran informativamente en
-- la UI, no penalizan el semaforo.

create view station_compliance
with (security_invoker = true) as
select
  s.id as station_id,
  s.name as station_name,
  s.region_id,
  s.subsede_id,

  -- criterios criticos
  (s.phone is not null or s.email is not null) as has_contact_info,
  (s.personnel_count > 0) as has_personnel,
  (s.vehicles_count > 0) as has_vehicles,

  -- criterios no criticos
  exists (
    select 1 from attendance_summaries a
    where a.station_id = s.id and a.created_at >= now() - interval '45 days'
  ) as attendance_recent,
  exists (
    select 1 from intervention_summaries i
    where i.station_id = s.id and i.created_at >= now() - interval '45 days'
  ) as interventions_recent,
  exists (
    select 1 from documents d where d.station_id = s.id
  ) as has_documents,

  -- informativos, no afectan el color
  exists (
    select 1 from station_history_events h where h.station_id = s.id
  ) as has_history_events,
  exists (
    select 1 from calendar_events c where c.station_id = s.id and c.status <> 'cancelado'
  ) as has_calendar_events,

  -- ultima fecha relevante de actualizacion (la mas reciente entre
  -- asistencia/intervenciones/documentos/la propia fila de stations)
  greatest(
    coalesce((select max(a.created_at) from attendance_summaries a where a.station_id = s.id), 'epoch'::timestamptz),
    coalesce((select max(i.created_at) from intervention_summaries i where i.station_id = s.id), 'epoch'::timestamptz),
    coalesce((select max(d.created_at) from documents d where d.station_id = s.id), 'epoch'::timestamptz),
    s.updated_at
  ) as last_relevant_update_at,

  -- cantidad de criterios "core" cumplidos sobre 6 (los 3 criticos + los 3
  -- no criticos) -- porcentaje exacto, sin redondear, lo calcula el
  -- frontend a partir de compliant_count/6.
  (
    (s.phone is not null or s.email is not null)::int
    + (s.personnel_count > 0)::int
    + (s.vehicles_count > 0)::int
    + (exists (select 1 from attendance_summaries a where a.station_id = s.id and a.created_at >= now() - interval '45 days'))::int
    + (exists (select 1 from intervention_summaries i where i.station_id = s.id and i.created_at >= now() - interval '45 days'))::int
    + (exists (select 1 from documents d where d.station_id = s.id))::int
  ) as compliant_count,
  6 as compliant_total,

  case
    when not (s.phone is not null or s.email is not null)
      or s.personnel_count = 0
      or s.vehicles_count = 0
    then 'rojo'
    when not exists (select 1 from attendance_summaries a where a.station_id = s.id and a.created_at >= now() - interval '45 days')
      or not exists (select 1 from intervention_summaries i where i.station_id = s.id and i.created_at >= now() - interval '45 days')
      or not exists (select 1 from documents d where d.station_id = s.id)
    then 'amarillo'
    else 'verde'
  end as compliance_status
from stations s;

comment on view station_compliance is 'Semaforo de carga por cuartel (verde/amarillo/rojo), 100% derivado de datos reales existentes -- nunca inventa ni estima. security_invoker=true: hereda el RLS real de stations/personnel/vehicles/attendance_summaries/intervention_summaries/documents/station_history_events/calendar_events segun quien consulta (mismo alcance que stations_select_scope). Criterios criticos (cualquiera ausente = rojo): contacto institucional, personal activo cargado, vehiculos cargados. Criterios no criticos (ausentes con criticos OK = amarillo): asistencia reciente (45 dias), intervenciones recientes (45 dias), al menos un documento cargado. historial institucional y calendario se informan pero no afectan el color (son opcionales por naturaleza). compliant_count/compliant_total es la fraccion exacta de criterios core cumplidos, sin redondear -- el frontend decide el formato de presentacion.';

-- attendance_summaries/intervention_summaries no tenian created_at indexado
-- por cuartel -- se agregan para que los EXISTS con filtro de fecha de esta
-- vista no hagan sequential scan a medida que crecen esas tablas.
-- documents.station_id tampoco tenia indice propio (las policies de RLS lo
-- usan pero nunca se habia creado un indice explicito) -- se agrega por el
-- mismo motivo, lo usa el EXISTS de has_documents.

create index if not exists idx_attendance_summaries_station_created on attendance_summaries(station_id, created_at desc);
create index if not exists idx_intervention_summaries_station_created on intervention_summaries(station_id, created_at desc);
create index if not exists idx_documents_station_id on documents(station_id) where station_id is not null;
