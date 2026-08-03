-- SIGER4 - Nuevos tipos de notificacion: prueba y recordatorio semanal
--
-- ALTER TYPE ... ADD VALUE es aditivo y seguro (no requiere recrear la
-- columna ni migrar datos existentes), a diferencia de borrar un valor de
-- enum. Se agregan los dos tipos que necesitan las funcionalidades nuevas:
--   - 'prueba': usado por el boton "Probar notificacion" en Ajustes (ver
--     src/pages/AjustesPage.tsx) — se inserta siempre con profile_id = uno
--     mismo, nunca es un broadcast.
--   - 'recordatorio_semanal': usado por el recordatorio institucional
--     semanal (ver 0036_weekly_reminder_cron.sql).
--
-- Nota tecnica: ALTER TYPE ... ADD VALUE no puede correr dentro de la misma
-- transaccion que despues intenta USAR ese valor nuevo (en Postgres < 12 ni
-- siquiera dentro de una transaccion explicita). Supabase corre cada
-- migracion en su propia transaccion implicita, asi que esta migracion SOLO
-- agrega los valores; el uso real (RPCs de 0036, inserts del frontend) va en
-- archivos/deploys posteriores para evitar el error "unsafe use of new value
-- of enum type".

alter type notification_type add value if not exists 'prueba';
alter type notification_type add value if not exists 'recordatorio_semanal';
