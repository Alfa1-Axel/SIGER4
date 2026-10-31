-- SIGER4 - Avisos de actualización: tipo de notificación
--
-- CORRER SOLA, en su propia ejecución, ANTES de 0122_release_announcements.sql: un valor nuevo de un enum no se puede
-- usar en la misma transacción en que se agrega (mismo patrón que 0101 y 0102).
--
-- Tipo nuevo "actualizacion_publicada": el aviso breve que reciben todos los perfiles activos cuando una versión nueva
-- llega a producción ("Hay una nueva actualización en Documentos."). Es DISTINTO de "actualizacion_sistema", el tipo de las
-- novedades que se retiraron en la sección 66 y que la aplicación sigue ocultando (no se borran): así los avisos viejos no
-- vuelven a verse y los nuevos sí.
--
-- Idempotente: se puede correr más de una vez sin cambios.

alter type notification_type add value if not exists 'actualizacion_publicada';
