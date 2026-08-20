-- SIGER4 - Reset funcional de la base de datos
--
-- ============================================================================
-- NO EJECUTAR SIN LEER ENTERO. NO EJECUTAR A CIEGAS.
-- CORRÉ PRIMERO LA SECCIÓN 0 (VERIFICACIÓN PREVIA) Y CONFIRMÁ QUE TU USUARIO
-- DE SUPABASE AUTH YA EXISTE ANTES DE SEGUIR.
-- ============================================================================
--
-- Qué hace: borra TODOS los datos operativos cargados (de prueba o reales)
-- y deja el sistema limpio, con Regional 4 + sus 3 subsedes base, y tu
-- perfil de administrador (informatica_r4, alcance de sistema completo)
-- listo para volver a usar.
--
-- Diferencia con supabase/cleanup_test_data.sql: ese script está pensado
-- para conservar datos reales ya cargados y borrar solo "lo de prueba" que
-- vos identifiques. Este script es más directo — borra TODOS los datos
-- operativos sin excepción (no hay lista de exclusión) y recrea el perfil
-- admin desde cero. Usalo cuando quieras arrancar de cero de verdad, no para
-- una limpieza selectiva.
--
-- Qué CONSERVA/RECREA siempre:
--   - Estructura completa: tablas, funciones, triggers, políticas RLS,
--     enums, migraciones aplicadas. Nada de esto se toca.
--   - Los 3 buckets de Storage (station-media, avatars, documents) — este
--     script no toca Storage, ver la nota al final.
--   - regions: la fila con code = 'R4' (Regional 4). Si por algún motivo no
--     existiera, el script la recrea.
--   - subsedes: Las Varillas (LV), Luque (LQ), Río Primero (RP). Si no
--     existieran, el script las recrea.
--   - Tu perfil (profiles), vinculado a auth.users por email, con rol
--     informatica_r4 y scope de tipo 'system' (acceso total).
--
-- Qué BORRA, sin excepción:
--   - stations, vehicles, personnel, attendance_summaries,
--     intervention_summaries, courses, course_stations, documents,
--     document_versions, notifications, audit_logs.
--   - Todos los profiles (y sus user_roles/user_scopes en cascada) —
--     incluido, temporalmente, el tuyo: se borra y se vuelve a crear en la
--     misma transacción para garantizar que quede en un estado limpio y
--     conocido, no para perder tu cuenta.
--
-- ----------------------------------------------------------------------------
-- Sobre tu usuario de Supabase Auth (auth.users) — LEER ANTES DE CORRER
-- ----------------------------------------------------------------------------
-- Este script NUNCA crea ni modifica auth.users ni contraseñas: eso es
-- exclusivamente de Supabase Auth (Authentication → Users en el dashboard, o
-- el flujo de /registro de la app), no corresponde tocarlo por SQL directo.
-- Lo que SÍ hace el script es buscar tu auth.users existente por email y
-- crear/reconectar profiles.auth_user_id apuntando a ese id.
--
-- Si tu cuenta de Auth con el email admin@tudominio.com YA
-- EXISTE (ya iniciaste sesión alguna vez con ese email): la sección 0 lo va a
-- confirmar, y la sección 2 va a poder recrear tu perfil sin problema.
--
-- Si NO EXISTE todavía: la sección 0 no va a devolver ninguna fila. En ese
-- caso, ANTES de correr la sección 2, andá a Supabase → Authentication →
-- Users → "Add user" (o "Invite"), creá la cuenta con ese email, y recién
-- ahí volvé a correr la sección 0 para confirmar que ya existe.
--
-- ----------------------------------------------------------------------------
-- Por qué se desactivan triggers durante el reset
-- ----------------------------------------------------------------------------
-- Los triggers AFTER DELETE de auditoría (audit_row_change(), 0004) y de
-- notificaciones automáticas (notify_*, 0023) insertan filas nuevas en
-- audit_logs/notifications que referencian el registro recién borrado — si
-- se borra en cascada (ej. stations), esa inserción puede violar una foreign
-- key porque el padre ya no existe en el momento de insertar. Además, los
-- triggers de protección de superadmin (trg_protect_super_admin_user_roles/
-- user_scopes, 0018) exigen is_super_admin() = true, que depende de
-- auth.uid() — corriendo este script desde el SQL Editor no hay un usuario
-- autenticado real (auth.uid() es null), así que esos triggers bloquearían
-- la asignación del rol informatica_r4 si quedaran activos. Por eso se
-- desactivan TODOS los triggers de usuario en las tablas involucradas antes
-- de tocar datos, y se reactivan apenas termina — nunca quedan
-- desactivados. Al estar todo dentro de un begin/commit, un rollback
-- también deshace el disable si algo falla a mitad de camino.

-- ============================================================================
-- SECCIÓN 0: VERIFICACIÓN PREVIA (correr primero, por separado)
-- ============================================================================

-- 0.1 — confirmar que tu cuenta de Supabase Auth existe. Si esto no devuelve
-- ninguna fila, PARÁ ACÁ y creá el usuario desde Authentication → Users en
-- el dashboard antes de seguir.
select id as auth_user_id, email, created_at
from auth.users
where email = 'admin@tudominio.com';

-- 0.2 — pantallazo de lo que hay actualmente (para comparar contra la
-- verificación final de la sección 3).
select count(*) as cuarteles from stations;
select count(*) as vehiculos from vehicles;
select count(*) as personal from personnel;
select count(*) as asistencias from attendance_summaries;
select count(*) as intervenciones from intervention_summaries;
select count(*) as cursos from courses;
select count(*) as documentos from documents;
select count(*) as notificaciones from notifications;
select count(*) as perfiles from profiles;
select count(*) as audit_logs from audit_logs;

-- ============================================================================
-- SECCIÓN 1: reset (dentro de una transacción — revisá la sección 3 antes de
-- decidir COMMIT o ROLLBACK)
-- ============================================================================

begin;

-- 1.1 — desactivar triggers de usuario en todas las tablas que se van a
-- tocar (borrado de datos operativos + recreación de perfil/rol/scope).
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

-- 1.2 — borrar auditoría y notificaciones primero (sin triggers activos, ya
-- no generan filas nuevas al borrar lo demás, así que el orden entre estos
-- deletes y los siguientes ya no importa).
delete from audit_logs;
delete from notifications;

-- 1.3 — documentos (document_versions se va en cascada).
delete from documents;

-- 1.4 — cursos (course_stations se va en cascada).
delete from courses;

-- 1.5 — cuarteles: en cascada borra vehicles, personnel,
-- attendance_summaries, intervention_summaries, y cualquier documents/
-- course_stations que todavía dependiera de station_id.
delete from stations;

-- 1.6 — todos los perfiles (user_roles/user_scopes se van en cascada). Esto
-- incluye tu perfil actual si ya existía: se recrea limpio en el paso 1.9.
delete from profiles;

-- 1.7 — recrear Regional 4 y las 3 subsedes base si no existieran (si ya
-- existían, "on conflict do nothing" los deja intactos — no se duplican).
insert into regions (name, code)
values ('Regional 4', 'R4')
on conflict (code) do nothing;

insert into subsedes (region_id, name, code)
select r.id, v.name, v.code
from regions r
cross join (
  values
    ('SubSede Las Varillas', 'LV'),
    ('Subsede Luque', 'LQ'),
    ('Subsede Rio Primero', 'RP')
) as v(name, code)
where r.code = 'R4'
on conflict (region_id, code) do nothing;

-- 1.8 — recrear tu perfil, vinculado a tu auth.users existente por email.
-- Si la sección 0.1 no encontró tu usuario de Auth, este insert va a fallar
-- (auth_user_id no puede ser null) — es la señal de que hay que crear la
-- cuenta en Authentication → Users primero y volver a correr el script.
insert into profiles (auth_user_id, full_name, email, region_id, is_active)
select
  au.id,
  'Administrador SIGER4',
  au.email,
  (select id from regions where code = 'R4'),
  true
from auth.users au
where au.email = 'admin@tudominio.com';

-- 1.9 — rol informatica_r4 (superadmin real).
insert into user_roles (profile_id, role)
select p.id, 'informatica_r4'
from profiles p
where p.email = 'admin@tudominio.com';

-- 1.10 — scope de sistema completo (acceso total, no limitado a una
-- region/subsede/cuartel puntual — coherente con ser informatica_r4).
insert into user_scopes (profile_id, scope_type)
select p.id, 'system'
from profiles p
where p.email = 'admin@tudominio.com';

-- 1.11 — reactivar triggers de usuario: NUNCA dejar esto desactivado más
-- allá de esta transacción.
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

-- ============================================================================
-- SECCIÓN 2: si algo en la sección 1 falló (por ejemplo, porque tu usuario
-- de Auth todavía no existía), la transacción entera queda revertida al
-- hacer rollback — no hace falta un manejo especial de errores acá. Corré
-- ROLLBACK, creá el usuario en Authentication → Users, y volvé a correr el
-- script completo desde la sección 0.
-- ============================================================================

-- ============================================================================
-- SECCIÓN 3: verificación final — revisá esto ANTES de decidir COMMIT
-- ============================================================================

-- 3.1 — todo lo operativo debe estar en 0.
select count(*) as cuarteles_restantes from stations;
select count(*) as vehiculos_restantes from vehicles;
select count(*) as personal_restante from personnel;
select count(*) as asistencias_restantes from attendance_summaries;
select count(*) as intervenciones_restantes from intervention_summaries;
select count(*) as cursos_restantes from courses;
select count(*) as documentos_restantes from documents;
select count(*) as notificaciones_restantes from notifications;
select count(*) as audit_logs_restantes from audit_logs;

-- 3.2 — Regional 4 y las 3 subsedes deben existir.
select * from regions where code = 'R4';
select * from subsedes where code in ('LV', 'LQ', 'RP') order by code;

-- 3.3 — tu perfil, rol y scope deben existir y verse así:
select
  p.id as profile_id,
  p.full_name,
  p.email,
  p.auth_user_id,
  ur.role,
  us.scope_type
from profiles p
left join user_roles ur on ur.profile_id = p.id
left join user_scopes us on us.profile_id = p.id
where p.email = 'admin@tudominio.com';
-- ^ Debe devolver exactamente 1 fila, con role = 'informatica_r4' y
--   scope_type = 'system'. Si no devuelve nada, tu auth.users no existía
--   (ver la nota de la sección 1.8) — hacé ROLLBACK, creá el usuario, y
--   volvé a correr el script entero.

-- 3.4 — confirmar que los triggers quedaron reactivados (todos "O", ninguno
-- "D" — ver columna tgenabled).
select tgrelid::regclass as tabla, tgname, tgenabled
from pg_trigger
where tgrelid::regclass::text in (
  'stations', 'vehicles', 'personnel', 'attendance_summaries',
  'intervention_summaries', 'courses', 'course_stations', 'documents',
  'document_versions', 'notifications', 'profiles', 'user_roles', 'user_scopes'
)
and not tgisinternal
order by 1, 2;

-- Si todo lo de arriba se ve bien (3.3 devolvió tu perfil con
-- informatica_r4/system, y 3.4 no muestra ningún trigger "D"): commit;
-- Si algo no cuadra: rollback;

-- ============================================================================
-- NOTA: archivos en Supabase Storage (station-media, avatars, documents)
-- ============================================================================
-- Este script no toca Storage. Borrar filas de stations/profiles/documents
-- no borra los archivos ya subidos a esos 3 buckets — quedan huérfanos. Si
-- querés limpiarlos también, hacelo manualmente desde el dashboard
-- (Storage → cada bucket → seleccionar carpetas y borrar), no por SQL: eso
-- requeriría la service_role key, que no corresponde usar desde un script
-- como este. Ver supabase/cleanup_test_data.sql (sección 4) para el detalle
-- carpeta por carpeta si hace falta.
