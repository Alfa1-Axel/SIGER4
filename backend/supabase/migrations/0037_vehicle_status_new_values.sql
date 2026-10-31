-- SIGER4 - Nuevos valores de vehicle_status: vendido, transferido, baja
--
-- Se agregan primero, en su propia migracion, porque Postgres no permite
-- usar un valor de enum recien agregado dentro de la MISMA transaccion en la
-- que se agrego (mismo motivo que 0035_notification_types_test_and_reminder.sql).
-- El resto de la funcionalidad (historial, RPC change_vehicle_status, ajuste
-- de vehicles_count) va en 0038_vehicle_lifecycle_history.sql, que ya puede
-- usar estos valores porque corre en una migracion posterior/separada.

alter type vehicle_status add value if not exists 'vendido';
alter type vehicle_status add value if not exists 'transferido';
alter type vehicle_status add value if not exists 'baja';
