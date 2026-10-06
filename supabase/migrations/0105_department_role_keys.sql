-- SIGER4 - Roles de departamento y tipo de aviso de departamento
--
-- Roles nuevos del nivel Regional:
--   - coordinador_departamento (Coordinador de Departamento)
--   - miembro_departamento     (Miembro de Departamento)
-- El rol dice qué puede hacer; el departamento, dónde. El departamento sigue
-- viviendo en departments.coordinator_profile_id y department_members
-- (0106 los vincula con estos roles).
--
-- Tipo de notificación nuevo: aviso_departamento (avisos del sistema para
-- un departamento: te sumaron, ahora coordinás, aval nuevo).
--
-- Postgres no permite usar un valor nuevo de un enum en la misma transacción
-- en la que se agrega: esta migración va sola y antes de 0106.

alter type role_key add value if not exists 'coordinador_departamento';
alter type role_key add value if not exists 'miembro_departamento';
alter type notification_type add value if not exists 'aviso_departamento';
