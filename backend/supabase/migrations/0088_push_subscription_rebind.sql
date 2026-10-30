-- SIGER4 - Registro/desregistro seguro de suscripciones push (fix: endpoint
-- quedaba atado al perfil anterior al cambiar de usuario en el mismo
-- navegador/dispositivo)
--
-- Bug real reportado y confirmado por codigo: el navegador reutiliza la
-- MISMA PushSubscription (mismo endpoint) entre distintas sesiones de la
-- app en el mismo dispositivo -- eso es comportamiento normal del
-- PushManager del navegador, no algo que la app controle. El frontend
-- (savePushSubscription, src/lib/api/pushSubscriptions.ts) hacia un upsert
-- DIRECTO desde el cliente:
--
--   supabase.from('push_subscriptions').upsert(
--     { profile_id: profileId, endpoint, ... },
--     { onConflict: 'endpoint' }
--   )
--
-- PostgREST traduce ese upsert en INSERT ... ON CONFLICT (endpoint) DO
-- UPDATE. Si el endpoint ya existia con profile_id = A (usuario anterior) y
-- ahora loguea el usuario B en el mismo dispositivo, ese UPDATE queda sujeto
-- a la policy push_subscriptions_update_own:
--
--   for update using (profile_id = current_profile_id())
--
-- El "using" de UPDATE se evalua contra la fila TAL COMO ESTA ANTES del
-- cambio -- esa fila tiene profile_id = A, pero quien ejecuta la query es
-- B, asi que la condicion es falsa: RLS rechaza el UPDATE. PostgREST no
-- lanza excepcion por un upsert que afecta 0 filas (mismo patron ya visto
-- en otras tablas del sistema, ver mapReferencePoints.ts) -- el cliente
-- nunca se entera, la UI de Ajustes sigue mostrando "Activo" porque
-- hasActiveSubscriptionRow(endpoint) SI encuentra una fila con ese
-- endpoint (solo que sigue perteneciendo a A, no a B). "Reactivar" tampoco
-- lo arregla: intenta borrar la fila vieja primero
-- (push_subscriptions_delete_own, misma logica de "using" contra la fila
-- existente) -- tambien rechazado en silencio -- y como el navegador suele
-- devolver la MISMA suscripcion existente al volver a pedir permiso
-- (pushManager.subscribe() no genera un endpoint nuevo si ya hay uno
-- activo y el usuario no la revoco), el upsert posterior vuelve a fallar
-- por el mismo motivo. Resultado neto: el endpoint queda huerfano,
-- indefinidamente atado al primer perfil que lo registro en ese
-- dispositivo, y el push real nunca llega a ningun perfil despues de ese.
--
-- Fix: dos RPC SECURITY DEFINER que resuelven profile_id desde
-- current_profile_id() (nunca un parametro que el cliente pueda mandar
-- falseado) y hacen el upsert/delete/reasignacion server-side, sin pasar
-- por RLS de UPDATE/DELETE sobre una fila ajena -- exactamente el mismo
-- patron ya usado en el resto del sistema para "una operacion que RLS no
-- puede autorizar directo porque cruza limites de fila/permiso, pero que
-- sigue siendo segura si se valida la identidad real primero" (ver
-- set_system_setting, notify_informatica_staff, etc.). Mas diagnostico
-- ampliado de push_subscriptions para informatica_r4/integrante_informatica
-- (seccion 7 del pedido).

-- ============================================================
-- 0. updated_at: la tabla original (0024) solo tenia created_at -- hace
--    falta distinguir "esta fila se revinculo recien" de "quedo vieja sin
--    tocar" para el diagnostico de admin.
-- ============================================================

alter table push_subscriptions
  add column if not exists updated_at timestamptz not null default now();

comment on column push_subscriptions.updated_at is 'Ultima vez que esta suscripcion se registro/reasigno via register_my_push_subscription() -- distingue una fila recien revinculada de una vieja sin tocar. No existia antes de 0088 (la tabla original solo tenia created_at).';

-- ============================================================
-- 1. register_my_push_subscription(): reemplaza el upsert directo del
--    cliente. Mueve el endpoint al perfil actual si pertenecia a otro.
-- ============================================================

create or replace function register_my_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := current_profile_id();
  if v_profile_id is null then
    raise exception 'No se pudo determinar tu perfil (sesión inválida).';
  end if;
  if p_endpoint is null or p_p256dh_key is null or p_auth_key is null then
    raise exception 'Faltan datos de la suscripción push.';
  end if;

  -- Upsert real por endpoint, SIN pasar por RLS de update/delete sobre una
  -- fila que hoy podria pertenecer a otro perfil -- esta funcion YA validó
  -- la identidad real (current_profile_id(), resuelto del JWT, no de un
  -- parametro) antes de decidir a quien reasignar el endpoint. Si la fila
  -- pertenecia a otro perfil, se reasigna: es exactamente el comportamiento
  -- esperado de "el navegador tiene una sola suscripcion activa, pertenece
  -- a quien esta logueado ahora en este dispositivo".
  insert into push_subscriptions (profile_id, endpoint, p256dh_key, auth_key, user_agent, updated_at)
  values (v_profile_id, p_endpoint, p_p256dh_key, p_auth_key, p_user_agent, now())
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh_key = excluded.p256dh_key,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

comment on function register_my_push_subscription(text, text, text, text) is 'Registra/reasigna una suscripcion push al perfil actual (current_profile_id(), nunca un parametro del cliente). Reemplaza el upsert directo desde el frontend, que quedaba bloqueado en silencio por RLS (push_subscriptions_update_own) cuando el endpoint ya pertenecia a otro perfil -- el navegador reutiliza el mismo endpoint entre sesiones de distintos usuarios en el mismo dispositivo, asi que esto pasa en cualquier dispositivo compartido/de prueba. Mueve el endpoint al perfil actual si hacia falta.';

revoke all on function register_my_push_subscription(text, text, text, text) from public;
grant execute on function register_my_push_subscription(text, text, text, text) to authenticated;

-- ============================================================
-- 2. unregister_my_push_subscription(): reemplaza el delete directo del
--    cliente para el MISMO motivo -- si el endpoint quedo atado a otro
--    perfil, un delete "own" fallaria en silencio igual que el upsert.
--    Borra el endpoint sin importar a que perfil este atado hoy: quien
--    llama esta funcion es quien controla el dispositivo/navegador AHORA
--    (conoce el endpoint exacto porque lo lee de pushManager.getSubscription(),
--    no lo adivina), asi que desactivarlo es una accion legitima aunque la
--    fila diga otro profile_id -- el caso real es limpiar un endpoint
--    huerfano de una sesion anterior en el mismo dispositivo.
-- ============================================================

create or replace function unregister_my_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_profile_id() is null then
    raise exception 'No se pudo determinar tu perfil (sesión inválida).';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

comment on function unregister_my_push_subscription(text) is 'Borra una suscripcion push por endpoint, sin importar a que perfil este atada -- quien la llama ya demostro tener sesion real y conoce el endpoint exacto (lo lee de pushManager.getSubscription() en su propio navegador), asi que desactivar ese endpoint es legitimo aunque la fila en DB diga otro profile_id (caso real: limpiar un endpoint huerfano de una sesion anterior en el mismo dispositivo). Exige sesion valida (current_profile_id() not null) para que no sea invocable sin autenticar.';

revoke all on function unregister_my_push_subscription(text) from public;
grant execute on function unregister_my_push_subscription(text) to authenticated;

-- ============================================================
-- 3. get_push_subscription_owner(): self-service -- dado un endpoint que
--    el navegador tiene en memoria, a que perfil pertenece HOY esa fila.
--    Asi el estado "Activo" de Ajustes puede distinguir "activo para mi"
--    de "activo pero para otro perfil" (dispositivo compartido/sesion
--    anterior), no solo "el endpoint existe en la base".
-- ============================================================

create or replace function get_push_subscription_owner(p_endpoint text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select profile_id from push_subscriptions where endpoint = p_endpoint;
$$;

comment on function get_push_subscription_owner(text) is 'Devuelve el profile_id dueño HOY de la suscripcion con ese endpoint, o null si no existe -- usado por el frontend (usePushNotifications) para distinguir "activo para mi perfil" de "activo pero vinculado a otro perfil" (dispositivo compartido/sesion anterior). Solo recibe el endpoint (dato que el propio navegador del que llama ya conoce via pushManager.getSubscription() -- no es informacion nueva que se le esta regalando), nunca expone mas que el profile_id dueño de ESE endpoint puntual, no un listado.';

revoke all on function get_push_subscription_owner(text) from public;
grant execute on function get_push_subscription_owner(text) to authenticated;

-- ============================================================
-- 4. Diagnostico ampliado -- SOLO informatica_r4/integrante_informatica
--    (nunca un usuario comun, ver seccion 7 del pedido): endpoint
--    abreviado, perfil vinculado, user_agent, updated_at, y cantidad de
--    suscripciones por usuario.
-- ============================================================

create or replace function get_push_subscriptions_admin_diagnostics()
returns table (
  subscription_id uuid,
  profile_id uuid,
  profile_full_name text,
  endpoint_short text,
  user_agent text,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ps.id as subscription_id,
    ps.profile_id,
    p.full_name as profile_full_name,
    -- Nunca el endpoint completo (es una URL enrutable a un dispositivo
    -- real) -- solo los primeros 40 caracteres, suficiente para distinguir
    -- proveedor (FCM/Mozilla/etc.) y confirmar unicidad sin exponer la URL
    -- completa a nadie que vea este diagnostico.
    left(ps.endpoint, 40) || '…' as endpoint_short,
    ps.user_agent,
    ps.updated_at,
    ps.created_at
  from push_subscriptions ps
  join profiles p on p.id = ps.profile_id
  where is_informatica_r4() or has_role('integrante_informatica')
  order by ps.updated_at desc;
$$;

comment on function get_push_subscriptions_admin_diagnostics() is 'Diagnostico completo de push_subscriptions (endpoint abreviado, perfil vinculado, user_agent, fechas) -- SOLO informatica_r4/integrante_informatica, nunca un usuario comun (seccion 7 del pedido). El endpoint nunca se expone completo (solo los primeros 40 caracteres) -- es una URL real que enruta al dispositivo del usuario.';

revoke all on function get_push_subscriptions_admin_diagnostics() from public;
grant execute on function get_push_subscriptions_admin_diagnostics() to authenticated;

create or replace function get_push_subscription_counts_by_profile()
returns table (profile_id uuid, profile_full_name text, subscription_count integer)
language sql
security definer
stable
set search_path = public
as $$
  select p.id as profile_id, p.full_name as profile_full_name, count(ps.id)::integer as subscription_count
  from profiles p
  join push_subscriptions ps on ps.profile_id = p.id
  where is_informatica_r4() or has_role('integrante_informatica')
  group by p.id, p.full_name
  order by subscription_count desc, p.full_name asc;
$$;

comment on function get_push_subscription_counts_by_profile() is 'Cantidad de suscripciones push activas por perfil -- SOLO informatica_r4/integrante_informatica. Usado en el diagnostico de Ajustes para detectar un mismo endpoint acumulado en varios perfiles (indicio de que un dispositivo compartido no se esta revinculando bien) o perfiles con muchos dispositivos.';

revoke all on function get_push_subscription_counts_by_profile() from public;
grant execute on function get_push_subscription_counts_by_profile() to authenticated;
