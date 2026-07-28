-- SIGER4 - Limpieza de datos de prueba
--
-- ============================================================================
-- NO EJECUTAR ESTE SCRIPT SIN LEERLO ENTERO Y CUSTOMIZARLO PRIMERO.
-- NO EJECUTAR EN SUPABASE REAL SIN HABER CORRIDO ANTES LA SECCION 0 (PREVIEW)
-- Y REVISADO QUE LOS NUMEROS TIENEN SENTIDO.
-- ============================================================================
--
-- Qué hace: borra datos de prueba cargados durante el desarrollo de SIGER4,
-- conservando la estructura del sistema, tu cuenta de administrador, y la
-- Regional 4 con sus 3 subsedes base.
--
-- Qué CONSERVA siempre (nunca se toca):
--   - Estructura del sistema: todas las tablas, funciones, triggers, RLS.
--   - Los 3 buckets de Storage (station-media, avatars, documents) — el
--     script no toca Storage, ver la sección 4 al final para eso.
--   - La fila de regions con code = 'R4' (Regional 4).
--   - Las 3 filas de subsedes con code in ('LV', 'LQ', 'RP') (Las Varillas,
--     Luque, Río Primero).
--   - El perfil, rol(es) y alcance(s) del email que pongas en la variable
--     :'admin_email' de la sección 1.
--
-- Qué BORRA (si no lo excluís explícitamente en la sección 1):
--   - stations (cuarteles) — y en cascada: vehicles, personnel,
--     attendance_summaries, intervention_summaries, documents cuyo
--     station_id apunte a esos cuarteles (todas esas FK son "on delete
--     cascade" en el schema, ver 0001_schema.sql).
--   - courses (cursos) de la Regional 4 y course_stations relacionados.
--   - documents/document_versions que no dependan de un cuartel borrado
--     (los que tengan alcance region/subsede/usuario en vez de cuartel).
--   - notifications (todas, o las de test si las identificás por título).
--   - profiles (y sus user_roles/user_scopes) que NO sean el admin que
--     conservás en la sección 1.
--   - audit_logs asociados a todo lo anterior (por record_id/actor).
--
-- Cómo revisarlo antes de correrlo:
--   1. Reemplazá 'admin@tudominio.com' en la sección 1 por tu email real.
--   2. Corré SOLO la sección 0 (los "select count(*)") primero, en el SQL
--      Editor de Supabase, y confirmá que los números de "a borrar" son los
--      que esperás (no debería incluir nada que quieras conservar).
--   3. Si hay cuarteles/usuarios REALES ya cargados que querés conservar,
--      agregalos a las listas de exclusión de la sección 1 antes de correr
--      el borrado (sección 2 en adelante).
--   4. Recién ahí, y solo si los números de la sección 0 tienen sentido,
--      corré el resto del script dentro de una transacción (ya está armado
--      con BEGIN/COMMIT) para poder hacer ROLLBACK si algo no cuadra.
--
-- Este archivo es una plantilla para revisar y ajustar — no es un comando de
-- un solo paso pensado para correr a ciegas.

-- ============================================================================
-- SECCIÓN 0: PREVIEW (correr esto primero, por separado, y mirar los números)
-- ============================================================================

-- Reemplazá este email por el tuyo antes de correr el preview.
select id as admin_profile_id, full_name, email
from profiles
where email = 'admin@tudominio.com';
-- ^ Confirmá que esto devuelve EXACTAMENTE una fila, la tuya, antes de seguir.
--   Si no devuelve nada, el email está mal o el perfil no existe todavía.

select count(*) as cuarteles_a_borrar from stations;
select count(*) as vehiculos_a_borrar from vehicles;
select count(*) as personal_a_borrar from personnel;
select count(*) as asistencias_a_borrar from attendance_summaries;
select count(*) as intervenciones_a_borrar from intervention_summaries;
select count(*) as cursos_a_borrar from courses;
select count(*) as documentos_a_borrar from documents;
select count(*) as notificaciones_a_borrar from notifications;
select count(*) as perfiles_a_borrar from profiles where email <> 'admin@tudominio.com';
select count(*) as audit_logs_totales from audit_logs;

-- ============================================================================
-- SECCIÓN 1: variables a customizar antes de correr el borrado real
-- ============================================================================
-- psql soporta \set para variables; en el SQL Editor de Supabase (que no es
-- psql) reemplazá manualmente 'admin@tudominio.com' por tu email en cada
-- lugar donde aparece más abajo (son 2 lugares, buscá el texto).

-- ============================================================================
-- SECCIÓN 2: borrado (dentro de una transacción — revisá, y recién ahí COMMIT)
-- ============================================================================

begin;

-- 2.1 — audit_logs: se borran explícitamente los que correspondan a perfiles/
-- tablas que se van a borrar. Esto hace falta porque
-- audit_logs.actor_profile_id es "on delete set null" (no cascade): si no se
-- borran acá, quedan filas de auditoría de perfiles de prueba con el actor en
-- null en vez de desaparecer. record_id/table_name son columnas de texto
-- libre (no FK), por eso el filtro por table_name cubre todo lo borrado por
-- nombre de tabla en vez de por relación.
delete from audit_logs
where actor_profile_id in (
  select id from profiles where email <> 'admin@tudominio.com'
)
or table_name in ('stations', 'vehicles', 'personnel', 'attendance_summaries',
                   'intervention_summaries', 'courses', 'course_stations',
                   'documents', 'document_versions', 'notifications');

-- 2.2 — notificaciones (no tienen datos que otra tabla dependa borrar antes).
delete from notifications;

-- 2.3 — documentos y sus versiones (document_versions tiene
-- "on delete cascade" hacia documents, así que basta con borrar documents).
delete from documents;

-- 2.4 — cursos y sus cuarteles participantes (course_stations tiene
-- "on delete cascade" hacia courses).
delete from courses;

-- 2.5 — cuarteles: esto en cascada borra vehicles, personnel,
-- attendance_summaries, intervention_summaries, y cualquier documents/
-- course_stations que todavía dependiera de station_id (por eso conviene
-- borrar stations al final de los "hijos", no antes).
delete from stations;

-- 2.6 — perfiles de prueba (todo menos el admin indicado). user_roles y
-- user_scopes tienen "on delete cascade" hacia profiles, así que se van
-- solos con esto.
delete from profiles where email <> 'admin@tudominio.com';

-- 2.7 — verificación final antes de decidir si hacer commit o rollback:
select count(*) as cuarteles_restantes from stations;
select count(*) as perfiles_restantes from profiles;
select * from profiles; -- confirmá que la única fila es tu admin
select * from regions;  -- debe seguir estando 'R4'
select * from subsedes; -- deben seguir LV, LQ, RP

-- Si todo lo de arriba se ve bien: commit;
-- Si algo no cuadra: rollback;
-- (No se deja un commit/rollback automático a propósito: la decisión la
-- tomás vos después de revisar la sección 2.7 en el SQL Editor.)

-- ============================================================================
-- SECCIÓN 3: qué NO borra este script y por qué
-- ============================================================================
-- - regions/subsedes: nunca se tocan. Si necesitás borrar una subsede de
--   prueba adicional a LV/LQ/RP, agregala manualmente con
--   `delete from subsedes where code = 'XX';` (fallará si todavía hay
--   stations apuntando a ella — borrá esas primero).
-- - Buckets y archivos de Storage: ver sección 4, este script no los toca.
-- - Migraciones aplicadas (supabase_migrations.schema_migrations o
--   equivalente interno de Supabase): no se tocan, son parte de la
--   estructura del sistema, no datos de prueba.

-- ============================================================================
-- SECCIÓN 4: archivos en Supabase Storage (station-media, avatars, documents)
-- ============================================================================
-- Este script SQL no borra archivos de Storage: borrar filas de "stations"/
-- "profiles"/"documents" NO borra los objetos ya subidos a esos 3 buckets
-- (station-media, avatars, documents) — quedan huérfanos, ocupando espacio,
-- salvo que se borren aparte. Borrar archivos de Storage por SQL no es
-- práctico ni seguro desde este script (requeriría la service_role key, que
-- nunca debe usarse desde un script como este) — se hace manualmente desde
-- el dashboard:
--
-- 1. Ir a Storage en el dashboard de Supabase.
-- 2. Bucket "station-media": cada carpeta tiene como nombre el station_id
--    del cuartel. Si ya borraste todos los cuarteles de prueba (sección
--    2.5), podés simplemente seleccionar todas las carpetas del bucket y
--    borrarlas — no va a quedar ningún cuartel real todavía apuntando a
--    ellas si corriste este script en un ambiente que recién estás
--    limpiando para empezar de cero.
-- 3. Bucket "avatars": mismo criterio, carpetas nombradas por profile_id.
--    Conservá la carpeta que corresponda a tu propio profile_id (podés
--    confirmarlo con `select id from profiles where email = 'admin@tudominio.com';`)
--    y borrá el resto.
-- 4. Bucket "documents": mismo criterio, carpetas nombradas por document_id.
--    Si borraste todos los documentos de prueba (sección 2.3), podés borrar
--    todas las carpetas de este bucket.
-- 5. Si preferís no borrar nada de Storage todavía (por ejemplo, para
--    revisar antes qué había en cada carpeta), no hace falta hacerlo ahora:
--    los archivos huérfanos no rompen nada, solo ocupan espacio de más.
