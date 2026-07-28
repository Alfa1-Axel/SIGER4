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
--   - El perfil, rol(es) y alcance(s) del email que pongas en la sección 1.
--
-- Qué BORRA (si no lo excluís explícitamente en la sección 1):
--   - stations (cuarteles) — y en cascada: vehicles, personnel,
--     attendance_summaries, intervention_summaries, documents cuyo
--     station_id apunte a esos cuarteles (todas esas FK son "on delete
--     cascade" en el schema, ver 0001_schema.sql).
--   - courses (cursos) de la Regional 4 y course_stations relacionados.
--   - documents/document_versions que no dependan de un cuartel borrado
--     (los que tengan alcance region/subsede/usuario en vez de cuartel).
--   - notifications (todas).
--   - profiles (y sus user_roles/user_scopes) que NO sean el admin indicado.
--   - audit_logs asociados a todo lo anterior.
--
-- ----------------------------------------------------------------------------
-- Por qué se desactivan triggers (IMPORTANTE, leer antes de correr)
-- ----------------------------------------------------------------------------
-- Cada alta/baja/modificación en las tablas operativas dispara triggers de
-- auditoría automática (audit_row_change(), ver 0004_audit_triggers.sql) y,
-- en varias tablas, también triggers de notificaciones automáticas
-- (notify_*, ver 0023_automatic_notifications.sql). Esos triggers corren
-- "AFTER DELETE" e insertan una fila nueva en audit_logs (o notifications)
-- que reference el registro recién borrado (ej. audit_logs.station_id
-- apuntando al station_id de un cuartel que la transacción ya está
-- borrando). Como esa fila de auditoría se inserta DESPUÉS de que el borrado
-- en cascada ya quitó la fila padre, la foreign key
-- (audit_logs_station_id_fkey y similares) falla, aunque todo esté dentro de
-- la misma transacción.
--
-- La solución correcta para una limpieza masiva de datos de prueba (no para
-- el uso normal del sistema) es desactivar temporalmente esos triggers antes
-- de borrar, y volver a activarlos apenas termina el borrado — nunca se
-- dejan desactivados. `ALTER TABLE ... DISABLE TRIGGER USER` desactiva TODOS
-- los triggers definidos por el usuario en esa tabla (auditoría +
-- notificaciones + sync de contadores como vehicles_count/personnel_count),
-- pero no toca triggers internos de Postgres/Supabase (como los de RLS), así
-- que es seguro. Se listan explícitamente las tablas afectadas en vez de
-- desactivar a nivel de base completa, para que quede claro el alcance.
--
-- Cómo revisarlo antes de correrlo:
--   1. Reemplazá 'admin@tudominio.com' en la sección 1 por tu email real (y
--      en cualquier otro lugar del archivo donde aparezca ese texto).
--   2. Corré SOLO la sección 0 (los "select count(*)") primero, en el SQL
--      Editor de Supabase, y confirmá que los números de "a borrar" son los
--      que esperás (no debería incluir nada que quieras conservar).
--   3. Si hay cuarteles/usuarios REALES ya cargados que querés conservar,
--      agregalos a las listas de exclusión de la sección 2 antes de correr
--      el borrado.
--   4. Recién ahí, y solo si los números de la sección 0 tienen sentido,
--      corré el resto del script dentro de una transacción (ya está armado
--      con BEGIN/COMMIT) para poder hacer ROLLBACK si algo no cuadra.
--
-- Este archivo es una plantilla para revisar y ajustar — no es un comando de
-- un solo paso pensado para correr a ciegas. Ninguna sección se ejecuta sola:
-- vos decidís cuándo correr cada bloque en el SQL Editor.

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
-- El SQL Editor de Supabase no es psql (no soporta \set), así que reemplazá
-- manualmente 'admin@tudominio.com' por tu email en cada lugar donde aparece
-- en la sección 2 (buscá el texto — son 2 apariciones).

-- ============================================================================
-- SECCIÓN 2: borrado (dentro de una transacción — revisá, y recién ahí COMMIT)
-- ============================================================================

begin;

-- 2.1 — desactivar triggers de usuario (auditoría, notificaciones automáticas,
-- sync de contadores) en todas las tablas que se van a tocar. Ver la nota
-- larga al principio del archivo sobre por qué hace falta esto.
alter table stations disable trigger user;
alter table vehicles disable trigger user;
alter table personnel disable trigger user;
alter table attendance_summaries disable trigger user;
alter table intervention_summaries disable trigger user;
alter table courses disable trigger user;
alter table course_stations disable trigger user;
alter table documents disable trigger user;
alter table document_versions disable trigger user;
alter table notifications disable trigger user;
alter table profiles disable trigger user;
alter table user_roles disable trigger user;
alter table user_scopes disable trigger user;

-- 2.2 — audit_logs: se borran explícitamente los que correspondan a perfiles/
-- tablas de prueba. Con los triggers ya desactivados (2.1), este delete no
-- genera audit_logs nuevos, así que el orden respecto de los borrados de más
-- abajo ya no importa (a diferencia de antes: ahora se puede borrar en
-- cualquier momento dentro de la transacción). record_id/table_name son
-- columnas de texto libre (no FK), por eso el filtro por table_name cubre lo
-- borrado por nombre de tabla en vez de por relación.
delete from audit_logs
where actor_profile_id in (
  select id from profiles where email <> 'admin@tudominio.com'
)
or table_name in ('stations', 'vehicles', 'personnel', 'attendance_summaries',
                   'intervention_summaries', 'courses', 'course_stations',
                   'documents', 'document_versions', 'notifications');

-- 2.3 — notificaciones (no tienen datos que otra tabla dependa borrar antes).
delete from notifications;

-- 2.4 — documentos y sus versiones (document_versions tiene
-- "on delete cascade" hacia documents, así que basta con borrar documents).
delete from documents;

-- 2.5 — cursos y sus cuarteles participantes (course_stations tiene
-- "on delete cascade" hacia courses).
delete from courses;

-- 2.6 — cuarteles: esto en cascada borra vehicles, personnel,
-- attendance_summaries, intervention_summaries, y cualquier documents/
-- course_stations que todavía dependiera de station_id.
delete from stations;

-- 2.7 — perfiles de prueba (todo menos el admin indicado). user_roles y
-- user_scopes tienen "on delete cascade" hacia profiles, así que se van
-- solos con esto.
delete from profiles where email <> 'admin@tudominio.com';

-- 2.8 — reactivar los triggers de usuario: NUNCA dejar esto desactivado más
-- allá de esta transacción. Si algo falla antes de llegar acá, el ROLLBACK
-- automático de la transacción también deshace el DISABLE de 2.1 (ALTER
-- TABLE participa de la transacción como cualquier otro comando), así que no
-- hace falta un manejo especial de errores para esto.
alter table stations enable trigger user;
alter table vehicles enable trigger user;
alter table personnel enable trigger user;
alter table attendance_summaries enable trigger user;
alter table intervention_summaries enable trigger user;
alter table courses enable trigger user;
alter table course_stations enable trigger user;
alter table documents enable trigger user;
alter table document_versions enable trigger user;
alter table notifications enable trigger user;
alter table profiles enable trigger user;
alter table user_roles enable trigger user;
alter table user_scopes enable trigger user;

-- 2.9 — verificación final antes de decidir si hacer commit o rollback:
select count(*) as cuarteles_restantes from stations;
select count(*) as perfiles_restantes from profiles;
select * from profiles; -- confirmá que la única fila es tu admin
select * from regions;  -- debe seguir estando 'R4'
select * from subsedes; -- deben seguir LV, LQ, RP

-- También confirmá que los triggers quedaron reactivados (debe devolver
-- "O" = origin/enabled en tgenabled para todos, no "D" = disabled):
select tgrelid::regclass as tabla, tgname, tgenabled
from pg_trigger
where tgrelid::regclass::text in (
  'stations', 'vehicles', 'personnel', 'attendance_summaries',
  'intervention_summaries', 'courses', 'course_stations', 'documents',
  'document_versions', 'notifications', 'profiles', 'user_roles', 'user_scopes'
)
and not tgisinternal
order by 1, 2;

-- Si todo lo de arriba se ve bien: commit;
-- Si algo no cuadra: rollback;
-- (No se deja un commit/rollback automático a propósito: la decisión la
-- tomás vos después de revisar la sección 2.9 en el SQL Editor.)

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
-- - Los triggers en sí (las funciones y su definición): solo se desactivan
--   temporalmente durante la sección 2, nunca se borran ni se redefinen.

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
--    2.6), podés simplemente seleccionar todas las carpetas del bucket y
--    borrarlas — no va a quedar ningún cuartel real todavía apuntando a
--    ellas si corriste este script en un ambiente que recién estás
--    limpiando para empezar de cero.
-- 3. Bucket "avatars": mismo criterio, carpetas nombradas por profile_id.
--    Conservá la carpeta que corresponda a tu propio profile_id (podés
--    confirmarlo con `select id from profiles where email = 'admin@tudominio.com';`)
--    y borrá el resto.
-- 4. Bucket "documents": mismo criterio, carpetas nombradas por document_id.
--    Si borraste todos los documentos de prueba (sección 2.4), podés borrar
--    todas las carpetas de este bucket.
-- 5. Si preferís no borrar nada de Storage todavía (por ejemplo, para
--    revisar antes qué había en cada carpeta), no hace falta hacerlo ahora:
--    los archivos huérfanos no rompen nada, solo ocupan espacio de más.
