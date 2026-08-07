-- SIGER4 - Notificaciones: corregir alcance de escritura demasiado abierto
--
-- Hueco detectado en auditoria de permisos (2026-08-07):
-- notifications_write_admin_regional_escuela (0003_rls_policies.sql) permitia
-- a secretario_regional/director_escuela/instructor (is_regional_role() OR
-- is_escuela_role()) insertar una notificacion masiva a CUALQUIER
-- region/subsede/cuartel/usuario del sistema, sin ninguna restriccion
-- territorial -- a diferencia de todas las demas tablas con escritura
-- regional/escuela (documents, calendar_events, vehicles, personnel,
-- attendance_summaries, intervention_summaries), que siempre acotan el
-- region_id/station_id de destino al propio alcance del actor
-- (my_region_ids()/my_station_ids()/my_subsede_ids()). instructor en
-- particular es institucionalmente el rol mas acotado de los tres (dicta
-- cursos, no tiene alcance regional amplio) y podia igual broadcastear a toda
-- la red regional.
--
-- Regla nueva: informatica_r4 mantiene alcance total (puede notificar a
-- cualquier region/subsede/cuartel/usuario). secretario_regional,
-- director_escuela e instructor solo pueden notificar dentro de su propia
-- region/subsede/cuartel, o a un profile puntual (el "usuario especifico" del
-- formulario no cambia, ya era 1 a 1). Notificaciones sin ningun scope
-- (broadcast a TODO el sistema, region_id/subsede_id/station_id/profile_id
-- todos null) quedan reservadas a informatica_r4 -- un envio "a todos" sin
-- acotar es, en los hechos, alcance regional completo.

drop policy if exists "notifications_write_admin_regional_escuela" on notifications;

create policy "notifications_write_regional_escuela_scoped" on notifications
  for insert with check (
    is_informatica_r4()
    or (
      (is_regional_role() or is_escuela_role())
      and (
        -- Notificacion a un usuario puntual: no requiere acotar region/subsede/cuartel.
        profile_id is not null
        or (region_id is not null and region_id in (select my_region_ids()))
        or (subsede_id is not null and subsede_id in (select my_subsede_ids()))
        or (station_id is not null and station_id in (select my_station_ids()))
        or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
        or (station_id is not null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
      )
    )
  );

comment on policy "notifications_write_regional_escuela_scoped" on notifications is 'Crear notificaciones: informatica_r4 sin restriccion. secretario_regional/director_escuela/instructor (is_regional_role() o is_escuela_role()) solo dentro de su propia region/subsede/cuartel, o a un usuario puntual (profile_id). Reemplaza a notifications_write_admin_regional_escuela (0003), que no acotaba ningun alcance territorial.';
