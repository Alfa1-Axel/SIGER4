-- SIGER4 - Autorizacion server-side de push, deduplicacion y auditoria de envios
--
-- Problema (ver auditoria de seguridad): la Edge Function send-push validaba
-- que hubiera un usuario autenticado, pero no que ese usuario tuviera permiso
-- real sobre el alcance pedido (profileId/regionId/subsedeId/stationId).
-- Ademas, NotificationPushBridge dispara triggerPush() desde CADA navegador
-- conectado por Realtime en cada insert de "notifications", lo que multiplica
-- los envios (fan-out) por la cantidad de sesiones abiertas.
--
-- Esta migracion agrega la infraestructura server-side que necesita la nueva
-- version de send-push (ver supabase/functions/send-push/index.ts):
--   1. can_send_push_scope(): funcion RLS-style que replica el mismo criterio
--      de autorizacion que ya usan notifications_write_admin_regional_escuela /
--      notifications_write_self, para que send-push valide el alcance pedido
--      contra el JWT real (no confie en lo que mande el frontend).
--   2. push_send_log: registro de cada intento de envio (quien, alcance,
--      cuantos destinatarios, resultado), usado para auditoria y para
--      deduplicar por notification_id (evita reenviar el mismo push si varias
--      pestañas del mismo usuario disparan el bridge a la vez).
--   3. Rate limit basico: funcion que cuenta envios recientes del actor y
--      permite a la Edge Function rechazar abuso (no hace falta pg_cron, se
--      resuelve con un count() de push_send_log en la ventana de tiempo).

-- ============================================================
-- 1. Autorizacion de alcance (misma logica que notifications_write_*)
-- ============================================================

create or replace function can_send_push_scope(
  p_profile_id uuid,
  p_region_id uuid,
  p_subsede_id uuid,
  p_station_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Alcance puntual a un solo perfil: cualquier usuario autenticado puede
    -- enviarse push a si mismo (mismo criterio que notifications_write_self).
    -- Enviar a OTRO perfil puntual requiere permiso administrativo/regional.
    (p_profile_id is not null and (
      p_profile_id = current_profile_id()
      or is_informatica_r4()
      or is_regional_role()
      or is_escuela_role()
    ))
    or
    -- Alcance masivo (region/subsede/cuartel): mismo criterio que
    -- notifications_write_admin_regional_escuela. Nunca se permite masivo a
    -- un usuario de cuartel comun.
    (p_profile_id is null and (p_region_id is not null or p_subsede_id is not null or p_station_id is not null) and (
      is_informatica_r4()
      or is_regional_role()
      or is_escuela_role()
    ));
$$;

comment on function can_send_push_scope(uuid, uuid, uuid, uuid) is 'Valida server-side (Edge Function send-push) si el usuario autenticado actual puede enviar push al alcance pedido. Replica el criterio de notifications_write_admin_regional_escuela / notifications_write_self: alcance puntual a si mismo siempre permitido, cualquier otro alcance (otro perfil puntual, o masivo por region/subsede/cuartel) requiere informatica_r4/regional/escuela.';

-- ============================================================
-- 2. Registro y deduplicacion de envios push
-- ============================================================

create table push_send_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id) on delete set null,
  notification_id uuid references notifications(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  region_id uuid references regions(id) on delete set null,
  subsede_id uuid references subsedes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error', 'rate_limited', 'duplicate')),
  error_message text,
  created_at timestamptz not null default now()
);

comment on table push_send_log is 'Auditoria de cada intento de envio push server-side (Edge Function send-push): quien lo pidio, que alcance, cuantos destinatarios, resultado. Tambien se usa para deduplicar por notification_id y para el rate limit basico por actor.';

create index idx_push_send_log_actor_created on push_send_log(actor_profile_id, created_at desc);

-- Deduplicacion atomica: solo puede existir UNA fila 'ok' por notification_id.
-- send-push inserta con status 'ok' ANTES de mandar los push reales; si dos
-- pedidos concurrentes (dos pestañas del mismo usuario, o dos usuarios que
-- reciben la misma notificacion via el bridge) llegan al mismo tiempo, el
-- segundo insert viola este indice unico y la funcion responde "duplicate"
-- sin reenviar nada.
create unique index idx_push_send_log_notification_dedup on push_send_log(notification_id)
  where notification_id is not null and status = 'ok';

alter table push_send_log enable row level security;

-- Solo lectura para informatica_r4 (auditoria); la Edge Function escribe con
-- service_role, que no pasa por RLS, asi que no hace falta policy de insert
-- para el flujo normal.
create policy "push_send_log_select_admin" on push_send_log
  for select using (is_informatica_r4());

-- Un usuario puede ver sus propios intentos de envio (transparencia: si le
-- rechazan un push, puede ver por que).
create policy "push_send_log_select_own" on push_send_log
  for select using (actor_profile_id = current_profile_id());

-- ============================================================
-- 3. Helper de rate limit (usado por la Edge Function via RPC)
-- ============================================================

create or replace function push_send_rate_check(p_window_seconds integer default 60, p_max_sends integer default 10)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select count(*) < p_max_sends
  from push_send_log
  where actor_profile_id = current_profile_id()
    and status = 'ok'
    and created_at > now() - make_interval(secs => p_window_seconds);
$$;

comment on function push_send_rate_check(integer, integer) is 'true si el usuario actual todavia no supero el limite de envios push exitosos en la ventana dada (default: 10 envios por 60 segundos). Usado por la Edge Function send-push antes de procesar un pedido.';

-- Nadie mas que la Edge Function (via service_role, que ignora RLS/GRANT)
-- deberia poder insertar en push_send_log directamente; no se otorga insert a
-- authenticated a proposito.
revoke insert, update, delete on push_send_log from authenticated, anon;
grant select on push_send_log to authenticated;

-- EXECUTE explicito: send-push llama a estas dos funciones via RPC bajo el
-- JWT del usuario (supabaseAsUser.rpc(...)), asi que authenticated necesita
-- poder ejecutarlas. anon no las necesita (send-push exige JWT de usuario).
revoke all on function can_send_push_scope(uuid, uuid, uuid, uuid) from public;
grant execute on function can_send_push_scope(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function push_send_rate_check(integer, integer) from public;
grant execute on function push_send_rate_check(integer, integer) to authenticated;
