-- SIGER4 - Tipo de notificación para informes de Departamentos
--
-- Va sola: un valor nuevo de enum no se puede usar en la misma transacción
-- en que se agrega. Correr esta migración y DESPUÉS
-- 0102_notification_reads_and_links.sql.

alter type notification_type add value if not exists 'informe_departamento';
