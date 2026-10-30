-- SIGER4 - RPC para asegurar la notificacion de novedades (fix del 400)
--
-- Problema real (visto en Network del navegador): el frontend hacia
-- supabase.from('notifications').upsert(..., { onConflict:
-- 'profile_id,app_update_id', ignoreDuplicates: true }), pensado para pedirle
-- a PostgREST un "insert ... on conflict (profile_id, app_update_id) do
-- nothing". Pero el indice de deduplicacion (idx_notifications_app_update_dedup,
-- migracion 0077) es un INDICE UNICO PARCIAL (con "where app_update_id is not
-- null"), y PostgREST no puede traducir on_conflict a un indice parcial de
-- forma automatica -- exige que el conjunto de columnas matchee una
-- constraint/indice unico SIN condicion where, o devuelve 400 Bad Request.
-- Esto es una limitacion documentada de PostgREST (no de Postgres: en SQL
-- plano, "on conflict (profile_id, app_update_id) where app_update_id is not
-- null do nothing" es perfectamente valido y es justamente lo que esta
-- funcion hace), asi que la solucion no es tocar el indice (que sigue siendo
-- correcto y necesario para la atomicidad) sino dejar de pedirle a la capa
-- REST que arme ese INSERT -- se arma a mano, server-side, en una RPC.
--
-- Por que no un insert simple + catch(23505) tampoco: aunque el codigo JS
-- trate el error como exito, el navegador igual loguea la peticion como 409
-- en la consola de Network (ver fix anterior en notifications.ts, ronda
-- previa) -- ese enfoque ya se descarto una vez y no debe volver.
--
-- Solucion: RPC ensure_app_update_notification(), security definer, que
-- resuelve el profile_id real desde current_profile_id() (nunca un
-- parametro del cliente -- misma garantia que daba notifications_write_self,
-- ver 0023), y hace el insert con on conflict apuntando explicitamente al
-- indice parcial existente. SQL plano soporta esto sin problema; PostgREST
-- vía RPC ejecuta la funcion tal cual, sin intentar re-interpretar el
-- conflict target.

create or replace function ensure_app_update_notification(
  p_app_update_id text,
  p_title text,
  p_message text default null
)
returns table (created boolean, notification_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_notification_id uuid;
  v_created boolean := false;
begin
  v_profile_id := current_profile_id();

  -- Sin perfil activo (auth_user_id sin profile, o profile inactivo): no
  -- insertar nada. No es un error del llamador -- devolver created=false,
  -- notification_id=null en vez de lanzar excepcion, para que el frontend
  -- (que llama esto en cada carga de sesion) nunca vea un error de verdad
  -- por este caso, que ya de por si no deberia poder ver el banner de
  -- novedades sin sesion valida.
  if v_profile_id is null then
    return query select false, null::uuid;
    return;
  end if;

  if p_app_update_id is null or length(trim(p_app_update_id)) = 0 then
    raise exception 'p_app_update_id es obligatorio';
  end if;

  insert into notifications (type, title, body, profile_id, app_update_id)
  values ('actualizacion_sistema', p_title, p_message, v_profile_id, p_app_update_id)
  on conflict (profile_id, app_update_id) where app_update_id is not null
  do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    v_created := true;
  else
    -- Ya existia: traer su id (no se toca is_read/read_at -- "do nothing"
    -- no ejecuta ningun update, la fila existente queda exactamente como
    -- estaba, leida o no leida).
    select id into v_notification_id
    from notifications
    where profile_id = v_profile_id and app_update_id = p_app_update_id;
  end if;

  return query select v_created, v_notification_id;
end;
$$;

comment on function ensure_app_update_notification(text, text, text) is 'Crea (si no existe) la notificacion interna de "nueva actualizacion disponible" para el usuario autenticado actual, deduplicada por (profile_id, app_update_id) via el indice parcial idx_notifications_app_update_dedup (0077). Reemplaza al upsert con onConflict desde el cliente (fallaba con 400: PostgREST no puede resolver on_conflict contra un indice unico PARCIAL) -- este RPC arma el "insert ... on conflict ... where ... do nothing" en SQL plano, que si soporta indices parciales. profile_id se resuelve SIEMPRE desde current_profile_id() (auth.uid() del llamador), nunca desde un parametro, para que sea imposible crear una notificacion a nombre de otro usuario. Si ya existia, no la toca (is_read/read_at quedan igual) y devuelve su id con created=false. Sin perfil activo, devuelve created=false/notification_id=null sin insertar ni lanzar excepcion.';

grant execute on function ensure_app_update_notification(text, text, text) to authenticated;
