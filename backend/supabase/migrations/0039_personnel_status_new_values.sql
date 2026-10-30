-- SIGER4 - Nuevos valores de personnel_status: renuncia, pase
--
-- personnel_status hoy: activo, licencia, baja, reserva, aspirante. Se
-- agregan renuncia (el integrante se va por decision propia) y pase (pasa a
-- otro cuartel/destino), distintos de baja (separacion por decision
-- institucional). aspirante se mantiene sin cambios.
--
-- Se agregan en su propia migracion por el mismo motivo que 0035/0037:
-- Postgres no permite usar un valor de enum recien agregado en la misma
-- transaccion en la que se agrego. El resto (historial, RPC
-- change_personnel_status) va en 0040_personnel_status_history.sql.

alter type personnel_status add value if not exists 'renuncia';
alter type personnel_status add value if not exists 'pase';
