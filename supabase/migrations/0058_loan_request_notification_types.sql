-- SIGER4 - Tipos de notificacion para solicitudes de prestamo del Inventario Regional
--
-- ALTER TYPE ... ADD VALUE no puede correr en la misma transaccion que
-- despues intenta USAR ese valor nuevo (ver 0035_notification_types_test_and_reminder.sql,
-- mismo motivo exacto). Esta migracion SOLO agrega los valores; los
-- triggers que los usan van en 0059_loan_request_notifications.sql.
--
-- Un tipo por evento del ciclo de vida de la solicitud, mismo criterio ya
-- usado para el resto de las notificaciones automaticas del sistema:
--   - 'prestamo_solicitado': al responsable/regional cuando llega una
--     solicitud nueva.
--   - 'prestamo_aprobado' / 'prestamo_rechazado': al solicitante cuando se
--     resuelve su solicitud.
--   - 'prestamo_devuelto': al responsable cuando se registra la devolucion
--     (confirmacion de que el elemento volvio).

alter type notification_type add value if not exists 'prestamo_solicitado';
alter type notification_type add value if not exists 'prestamo_aprobado';
alter type notification_type add value if not exists 'prestamo_rechazado';
alter type notification_type add value if not exists 'prestamo_devuelto';
