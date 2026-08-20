-- SIGER4 - Revertir el Importador de datos Excel/CSV (decisión de producto)
--
-- El Importador de Excel/CSV (migración 0082_import_batches.sql) se
-- construyó y desplegó, pero se decidió no usarlo por ahora para no sumar
-- complejidad -- toda la pantalla/lógica de frontend ya se eliminó en el
-- mismo commit que esta migración. Esta migración elimina las tablas de
-- metadatos del lote que 0082 había creado.
--
-- Seguro de correr: import_batches/import_batch_rows NUNCA se llenaron con
-- datos operativos reales de personnel/vehicles/attendance_summaries/
-- inventory_items -- esas cuatro tablas destino y sus datos NO se tocan acá,
-- solo se borra el historial de metadatos de lotes de importación en sí
-- (quién importó qué archivo y cuándo), que deja de tener sentido sin la
-- función que lo generaba. Si en algún momento se decide reactivar el
-- importador, esta migración no impide volver a crear las tablas desde
-- cero (0082 sigue en el historial como referencia del diseño original).
--
-- No se tocan: personnel, vehicles, attendance_summaries, inventory_items,
-- audit_logs (los inserts que el importador haya hecho ahí, si llegó a
-- usarse, quedan igual -- son datos reales del sistema, no del importador).

drop table if exists import_batch_rows;
drop table if exists import_batches;

drop type if exists import_row_status;
drop type if exists import_batch_status;
drop type if exists import_module;
