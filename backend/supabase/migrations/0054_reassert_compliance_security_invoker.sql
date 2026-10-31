-- SIGER4 - Reafirmar security_invoker en station_compliance (defensivo)
--
-- Contexto (QA de visibilidad de Calendario/Semaforo para usuarios de
-- cuartel, ciclo 2026-08): se investigo si station_compliance (0052) podia
-- estar mostrando datos incorrectos/incompletos a usuarios no-informatica
-- por un problema de RLS. La semantica de "security_invoker = true" en
-- Postgres 15+ es correcta y SI propaga el RLS real del usuario que consulta
-- a cada subquery/EXISTS dentro de la vista (documentado en CREATE VIEW,
-- confirmado sin bugs abiertos conocidos para esta version de Postgres) —
-- no es la causa de ningun problema de visibilidad.
--
-- Sin embargo, hay un riesgo real y documentado del lado de las
-- herramientas de Supabase (no de Postgres en si): el Dashboard/CLI de
-- Supabase puede DROPEAR silenciosamente la opcion security_invoker de una
-- vista si esta se llega a editar/recrear desde el Table Editor del
-- Dashboard, o via ciertos flujos de "declarative schema"/`db diff`/`db
-- pull` (ver supabase/supabase#35823, supabase/cli#3973, supabase/cli#2264
-- en GitHub — bugs conocidos de esas herramientas, no de este proyecto). Si
-- eso llegara a pasar, la vista pasaria a correr como su dueño (bypassea
-- RLS), lo que en la practica significa que TODOS verian el cumplimiento de
-- TODOS los cuarteles (mas visibilidad, no menos) — el sintoma contrario al
-- reportado, pero de todos modos vale la pena blindarlo con una migracion
-- idempotente que reafirma la opcion explicitamente, sin tocar la logica de
-- la vista.
--
-- Esta migracion es un ALTER VIEW puntual, no un CREATE OR REPLACE VIEW
-- completo: no repite la definicion de station_compliance (evita duplicar
-- la logica de 0052 y el riesgo de que diverjan si alguna se edita a mano
-- sin la otra).

alter view station_compliance set (security_invoker = true);

comment on view station_compliance is 'Semaforo de carga por cuartel (verde/amarillo/rojo), 100% derivado de datos reales existentes -- nunca inventa ni estima. security_invoker=true (reafirmado en 0054 por el riesgo documentado de que el Dashboard/CLI de Supabase lo dropee silenciosamente al editar la vista fuera de una migracion SQL): hereda el RLS real de stations/personnel/vehicles/attendance_summaries/intervention_summaries/documents/station_history_events/calendar_events segun quien consulta (mismo alcance que stations_select_scope). Criterios criticos (cualquiera ausente = rojo): contacto institucional, personal activo cargado, vehiculos cargados. Criterios no criticos (ausentes con criticos OK = amarillo): asistencia reciente (45 dias), intervenciones recientes (45 dias), al menos un documento cargado. Ver DEPLOYMENT.md para la consulta de verificacion (pg_class.reloptions) que confirma que la opcion sigue activa en la base real.';
