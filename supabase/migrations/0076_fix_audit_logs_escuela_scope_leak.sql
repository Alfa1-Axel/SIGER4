-- SIGER4 - Fix real: instructor (via is_escuela_role()) veia auditoria de
-- CUALQUIER tabla sin territorio resuelto, incluidas acciones de informatica_r4
--
-- Bug reportado en produccion (2026-08-13): un usuario con roles
-- jefe_cuerpo_activo + instructor podia ver auditoria de todo el sistema,
-- incluidas acciones del admin.
--
-- Causa exacta: "audit_logs_select_regional" (redefinida en la migracion
-- 0048) es:
--
--   create policy "audit_logs_select_regional" on audit_logs
--     for select using (
--       (is_regional_role() or is_escuela_role())
--       and (region_id is null or region_id in (select my_region_ids()))
--     );
--
-- is_escuela_role() = director_escuela + instructor. La condicion
-- "region_id is null OR region_id in (...)" fue pensada originalmente en la
-- migracion 0014 (antes de que existiera is_escuela_role() como funcion
-- separada) para secretario_regional/director_escuela -- roles con
-- autoridad regional real -- con la justificacion explicita de "logs sin
-- region_id resuelto... quedan visibles igual para no ocultar informacion
-- por una limitacion de datos" (comentario original de 0014). La migracion
-- 0048 separo is_regional_role()/is_escuela_role() pero NO revaluo si esa
-- misma condicion laxa seguia siendo correcta para el rol nuevo mas
-- acotado (instructor) que paso a compartir is_escuela_role().
--
-- audit_row_change() (ver su "case tg_table_name") solo resuelve
-- region_id/subsede_id/station_id para un subconjunto de tablas -- toda
-- tabla que caiga en el "else" (departments, department_members,
-- system_settings, y cualquier tabla futura que se audite sin agregar su
-- propio "when" al case) queda con region_id = null. Con la policy vieja,
-- CUALQUIER instructor veia esas filas completas, sin importar de que
-- tabla vinieran ni el actor real -- exactamente "ve auditoria de acciones
-- del admin" reportado. jefe_cuerpo_activo (via audit_logs_select_station,
-- 0064) SI estaba correctamente acotado a su cuartel; el hueco era
-- especificamente el lado is_escuela_role() de esta policy combinada
-- (las policies RLS se combinan con OR entre si, asi que bastaba con
-- calificar para CUALQUIERA de las dos condiciones).
--
-- Fix: separar la policy en dos, con el criterio que ya documenta la matriz
-- de permisos (DEPLOYMENT.md seccion 31.4: "director_escuela / instructor:
-- Cursos, Calendario, Usuarios/roles de Escuela · Su región"):
--   - audit_logs_select_regional: SOLO is_regional_role() (secretario_regional),
--     mantiene el "region_id is null OR ..." intencional de 0014/0048 -- ese
--     rol si tiene autoridad regional real y amplia, decision sin cambios.
--   - audit_logs_select_escuela: SOLO is_escuela_role(), acotada a las
--     tablas reales de Escuela (courses, course_stations, calendar_events,
--     profiles, user_roles -- mismo set que ya usa el frontend en
--     ESCUELA_TABLES, AuditoriaPage.tsx) Y a su propia region cuando la fila
--     tiene territorio -- calendar_events de tipo escuela/capacitacion
--     (region_id/station_id null por diseño, ver calendar_events_single_scope)
--     sigue visible porque no tiene territorio que filtrar, no por un
--     "is null" generico que se cuela a otras tablas.

drop policy if exists "audit_logs_select_regional" on audit_logs;

create policy "audit_logs_select_regional" on audit_logs
  for select using (
    is_regional_role()
    and (region_id is null or region_id in (select my_region_ids()))
  );

comment on policy "audit_logs_select_regional" on audit_logs is 'secretario_regional ve la auditoria completa de su(s) region(es). Logs sin region_id resuelto (tablas sin relacion territorial, o historicos previos a 0014) quedan visibles igual -- decision de 0014, sin cambios: este rol tiene autoridad regional amplia real. NO incluye is_escuela_role() desde 0076 -- ver audit_logs_select_escuela para director_escuela/instructor, con alcance acotado.';

create policy "audit_logs_select_escuela" on audit_logs
  for select using (
    is_escuela_role()
    and table_name in ('courses', 'course_stations', 'calendar_events', 'profiles', 'user_roles')
    and (region_id is null or region_id in (select my_region_ids()))
  );

comment on policy "audit_logs_select_escuela" on audit_logs is 'director_escuela/instructor ven auditoria SOLO de las tablas de Escuela (mismo set que ESCUELA_TABLES en AuditoriaPage.tsx), acotada a su propia region cuando la fila tiene territorio -- nunca el resto del sistema (departamentos, inventario, configuracion, acciones de otros cuarteles/admin). Antes de esta migracion compartian audit_logs_select_regional con secretario_regional via is_escuela_role(), lo que dejaba ver CUALQUIER fila sin territorio resuelto de CUALQUIER tabla (bug real corregido en 0076, ver comentario de cabecera de esa migracion).';
