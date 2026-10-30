-- SIGER4 - Roles nuevos de Escuela para Avales regionales
--
-- Contexto (2026-10): nueva seccion "Avales regionales" dentro del modulo
-- Escuela (ver 0095_school_avales_module.sql). La matriz de permisos pedida
-- distingue tres roles de Escuela que hoy no existen en role_key:
--
--   - coordinador_escuela: Coordinador de Escuela. Ve todos los
--     departamentos internos de Escuela y carga avales en cualquiera.
--   - secretario_escuela: Secretario de Escuela. Mismo alcance que el
--     coordinador en Avales.
--   - coordinador_departamento_escuela: Coordinador de un departamento
--     interno de Escuela (Fuego, Forestal, FASME, etc.). El departamento
--     puntual NO vive en el rol: se asigna en school_department_members
--     (0095). El rol solo dice "que es"; la membresia dice "de cual"
--     -- mismo criterio que user_roles + user_scopes en el resto del sistema.
--
-- IMPORTANTE: "departamento" aca son departamentos internos de la Escuela,
-- NO los Departamentos Regionales del modulo /departamentos (tabla
-- departments, 0042). Son estructuras separadas a proposito.
--
-- Estos roles NO se suman a is_escuela_role() (director_escuela +
-- instructor): esa funcion da escritura sobre cursos/calendario de Escuela
-- y lectura regional de cuarteles/perfiles/auditoria. Los roles nuevos solo
-- tienen permisos dentro de Avales regionales (minimo permiso).
--
-- ALTER TYPE ... ADD VALUE no puede correr en la misma transaccion que
-- despues USA ese valor nuevo (ver 0035_notification_types_test_and_reminder.sql
-- y 0058_loan_request_notification_types.sql, mismo motivo exacto). Esta
-- migracion SOLO agrega los valores. Correrla sola en el SQL Editor y recien
-- despues correr 0095_school_avales_module.sql.

alter type role_key add value if not exists 'coordinador_escuela';
alter type role_key add value if not exists 'secretario_escuela';
alter type role_key add value if not exists 'coordinador_departamento_escuela';
