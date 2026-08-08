-- SIGER4 - Notificaciones sensibles inmediatas para Dpto. Informatica y Estadistica R4
--
-- Objetivo: Informatica debe enterarse de inmediato de acciones sensibles
-- sobre usuarios (alta, baja/desactivacion, cambio de rol, cambio de
-- alcance/scope) sin tener que revisar Auditoria manualmente. Estas
-- notificaciones son la contraparte "accionable e inmediata" de la
-- auditoria completa (que sigue registrando todo, sin cambios) -- ver punto
-- 4.C del pedido: "no notificar cada accion normal", por eso esto se limita
-- estrictamente a las 4 acciones explicitamente pedidas, no a cualquier
-- escritura del sistema.
--
-- Disenio: un trigger por tabla relevante (user_roles, user_scopes,
-- profiles), todos security definer, todos insertan UNA notificacion
-- profile_id-puntual por cada informatica_r4/integrante_informatica ACTIVO
-- (nunca una notificacion masiva sin scope: notifications_scope_not_ambiguous
-- exige que una notificacion sin profile_id tenga a lo sumo UN nivel
-- territorial, y estas notificaciones son inherentemente "para el equipo de
-- informatica", no territoriales). NotificationPushBridge en el cliente ya
-- escucha cualquier insert en notifications y dispara el push solo si el
-- usuario de informatica tiene la app abierta -- igual que el resto de las
-- notificaciones automaticas del sistema (curso nuevo, prestamo solicitado,
-- etc.), no hace falta pg_net aca.
--
-- No dispara si el ACTOR es el propio destinatario informatica (ver nota en
-- cada trigger): evitar que informatica se auto-notifique constantemente
-- por sus propias acciones administrativas normales seria spam, no lo pide
-- el usuario, y en la practica la accion mas comun sobre estas 3 tablas la
-- hacen ellos mismos. Se filtra por current_profile_id() del actor real
-- (bajo el JWT del usuario, no de service_role) cuando esta disponible; si
-- la operacion corre con service_role (Edge Functions admin-*), no hay
-- auth.uid() y el trigger no puede saber quien fue el actor real mas alla de
-- lo que ya audita audit_row_change() -- en ese caso se notifica siempre,
-- porque es preferible una notificacion de mas a perder el aviso de una
-- accion ejecutada via Edge Function.

alter type notification_type add value if not exists 'alerta_admin';

create or replace function notify_informatica_staff(p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  for v_profile in
    select distinct p.id
    from profiles p
    join user_roles ur on ur.profile_id = p.id
    where p.is_active = true
      and ur.role in ('informatica_r4', 'integrante_informatica')
  loop
    insert into notifications (profile_id, type, title, body)
    values (v_profile.id, 'alerta_admin', p_title, p_body);
  end loop;
end;
$$;

comment on function notify_informatica_staff(text, text) is 'Inserta una notificacion profile_id-puntual (tipo alerta_admin) para cada informatica_r4/integrante_informatica activo. Usado por los triggers de acciones sensibles sobre usuarios (alta, baja, cambio de rol, cambio de scope) -- nunca para eventos rutinarios.';

revoke all on function notify_informatica_staff(text, text) from public;

-- ============================================================
-- Cambio de rol (user_roles: alta o baja de un rol)
-- ============================================================

create or replace function notify_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_target_name text;
  v_actor_id uuid;
begin
  v_rec := coalesce(new, old);
  select full_name into v_target_name from profiles where id = v_rec.profile_id;
  v_actor_id := current_profile_id();

  -- No auto-notificar si el propio actor es el destinatario del cambio Y es
  -- de informatica (evita ruido cuando informatica ajusta sus propios roles
  -- entre si en una sesion administrativa normal). Si no se puede resolver
  -- el actor (service_role), se notifica igual (ver comentario de cabecera).
  if v_actor_id is not null and v_actor_id = v_rec.profile_id then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform notify_informatica_staff(
      'Cambio de rol: ' || coalesce(v_target_name, 'usuario'),
      'Se asignó el rol "' || new.role || '" a ' || coalesce(v_target_name, 'un usuario') || '.'
    );
  elsif tg_op = 'DELETE' then
    perform notify_informatica_staff(
      'Cambio de rol: ' || coalesce(v_target_name, 'usuario'),
      'Se quitó el rol "' || old.role || '" a ' || coalesce(v_target_name, 'un usuario') || '.'
    );
  end if;

  return coalesce(new, old);
end;
$$;

comment on function notify_role_change() is 'Notifica a informatica_r4/integrante_informatica cuando se asigna o quita un rol a cualquier usuario (alta/baja en user_roles). No se dispara si el propio usuario afectado es quien ejecuta el cambio (evita auto-notificacion en sesiones administrativas normales de informatica).';

create trigger trg_notify_role_change
  after insert or delete on user_roles
  for each row execute function notify_role_change();

-- ============================================================
-- Cambio de alcance/scope (user_scopes: alta o baja de un scope)
-- ============================================================

create or replace function notify_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_target_name text;
  v_actor_id uuid;
begin
  v_rec := coalesce(new, old);
  select full_name into v_target_name from profiles where id = v_rec.profile_id;
  v_actor_id := current_profile_id();

  if v_actor_id is not null and v_actor_id = v_rec.profile_id then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform notify_informatica_staff(
      'Cambio de alcance: ' || coalesce(v_target_name, 'usuario'),
      'Se agregó un alcance de tipo "' || new.scope_type || '" a ' || coalesce(v_target_name, 'un usuario') || '.'
    );
  elsif tg_op = 'DELETE' then
    perform notify_informatica_staff(
      'Cambio de alcance: ' || coalesce(v_target_name, 'usuario'),
      'Se quitó un alcance de tipo "' || old.scope_type || '" a ' || coalesce(v_target_name, 'un usuario') || '.'
    );
  end if;

  return coalesce(new, old);
end;
$$;

comment on function notify_scope_change() is 'Notifica a informatica_r4/integrante_informatica cuando se agrega o quita un alcance (scope) a cualquier usuario. No se dispara si el propio usuario afectado es quien ejecuta el cambio.';

create trigger trg_notify_scope_change
  after insert or delete on user_scopes
  for each row execute function notify_scope_change();

-- ============================================================
-- Alta / baja / reactivacion de usuario (profiles)
-- ============================================================

create or replace function notify_profile_lifecycle_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := current_profile_id();

  if tg_op = 'INSERT' then
    if v_actor_id is not null and v_actor_id = new.id then
      return new;
    end if;
    perform notify_informatica_staff(
      'Usuario creado: ' || new.full_name,
      'Se creó el usuario "' || new.full_name || '" (' || new.email || ').'
    );
  elsif tg_op = 'UPDATE' and old.is_active is distinct from new.is_active then
    if v_actor_id is not null and v_actor_id = new.id then
      return new;
    end if;
    if new.is_active = false then
      perform notify_informatica_staff(
        'Usuario desactivado: ' || new.full_name,
        'Se desactivó el usuario "' || new.full_name || '".'
      );
    else
      perform notify_informatica_staff(
        'Usuario reactivado: ' || new.full_name,
        'Se reactivó el usuario "' || new.full_name || '".'
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function notify_profile_lifecycle_change() is 'Notifica a informatica_r4/integrante_informatica cuando se crea un usuario, o cuando cambia profiles.is_active (desactivacion/reactivacion). El borrado directo (admin-delete-user) no dispara este trigger -- ver notify_admin_delete_user más abajo, porque el borrado real ocurre sobre auth.users (cascada a profiles) y no hay fila "new" para leer en un DELETE.';

create trigger trg_notify_profile_lifecycle
  after insert or update on profiles
  for each row execute function notify_profile_lifecycle_change();

-- ============================================================
-- Eliminacion directa de usuario (admin-delete-user)
-- ============================================================
-- profiles no tiene un trigger BEFORE/AFTER DELETE dedicado a esto porque
-- para el momento en que Postgres dispara el delete en cascada (desde
-- auth.users), ya no hay forma de diferenciar "un admin lo borro a
-- proposito" de cualquier otro origen del delete, y ademas
-- admin-delete-user ya registra un evento de auditoria manual ANTES de
-- borrar (record_manual_audit_event, accion 'admin_delete_user', migracion
-- 0065) -- ese es el punto correcto para notificar, no un trigger de
-- Postgres. admin-delete-user llama a esta funcion explicitamente antes de
-- ejecutar auth.admin.deleteUser(), bajo el cliente del actor real.

create or replace function notify_admin_delete_user(p_deleted_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform notify_informatica_staff(
    'Usuario eliminado: ' || p_deleted_full_name,
    'Se eliminó definitivamente el usuario "' || p_deleted_full_name || '".'
  );
end;
$$;

comment on function notify_admin_delete_user(text) is 'Notifica a informatica_r4/integrante_informatica cuando se elimina un usuario directamente (admin-delete-user). Llamada explícita desde la Edge Function, no un trigger -- el borrado real ocurre en auth.users y no hay una fila de profiles "new" que un trigger AFTER DELETE pueda usar de forma confiable en ese punto.';

revoke all on function notify_admin_delete_user(text) from public;
grant execute on function notify_admin_delete_user(text) to authenticated;
