-- SIGER4 - Notificacion interna para nuevas actualizaciones del sistema
--
-- Objetivo: cuando se publica una novedad nueva en APP_UPDATES
-- (src/config/appUpdates.ts), cada usuario debe ver ademas del banner ya
-- existente (AppUpdateBanner.tsx, "visto" via localStorage por navegador)
-- una notificacion interna persistente en /notificaciones ("Nueva
-- actualizacion disponible. Ingresa para conocer las novedades."), que
-- queda como no leida hasta que el usuario la marque, en cualquier
-- dispositivo -- a diferencia del banner (que es "una vez por navegador"),
-- esto es "una vez por usuario, visible en cualquier sesion".
--
-- APP_UPDATES sigue viviendo SOLO en el frontend (decision de diseño ya
-- documentada: no hace falta una tabla server-side de novedades, ver el
-- comentario de cabecera de src/lib/appUpdateSeen.ts) -- no se crea ninguna
-- tabla "app_updates" nueva. La notificacion se genera desde el CLIENTE
-- (AppUpdateBanner.tsx), la primera vez que detecta una novedad no vista,
-- insertando directo en notifications (self-scope, profile_id propio, RLS
-- ya lo permite via notifications_write_self) -- no hace falta ningun
-- trigger de Postgres porque no hay ninguna tabla server-side que dispare
-- el evento.
--
-- Deduplicacion: dos columnas nuevas + un indice unico parcial, mismo
-- patron exacto que push_send_log.notification_id
-- (idx_push_send_log_notification_dedup, migracion 0025) -- deduplicacion
-- ATOMICA a nivel de base (insert con on conflict do nothing), no una
-- lectura previa + insert con riesgo de carrera si el usuario tiene dos
-- pestañas abiertas al mismo tiempo.

alter type notification_type add value if not exists 'actualizacion_sistema';

alter table notifications
  add column if not exists app_update_id text;

comment on column notifications.app_update_id is 'Id estable de la novedad en APP_UPDATES (src/config/appUpdates.ts) que origino esta notificacion, solo para type=actualizacion_sistema. Null para el resto de los tipos. Permite deduplicar (un usuario nunca recibe la misma novedad dos veces) y, al tocar la notificacion, reabrir el banner/modal de esa novedad puntual sin tener que adivinar cual fue.';

create unique index if not exists idx_notifications_app_update_dedup
  on notifications(profile_id, app_update_id)
  where app_update_id is not null;

comment on index idx_notifications_app_update_dedup is 'Un usuario nunca recibe dos notificaciones internas de la misma novedad (mismo profile_id + app_update_id) -- mismo patron que idx_push_send_log_notification_dedup (0025). El insert desde el cliente usa on conflict (profile_id, app_update_id) do nothing.';
