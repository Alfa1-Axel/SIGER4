-- SIGER4 - Forzar cambio de contraseña en el primer ingreso
--
-- Ahora que el admin define (o genera) la contraseña temporal directamente al
-- crear un usuario (ver admin-create-user), esa contraseña puede circular por
-- un canal no tan seguro (mensaje, papel) antes de que la persona la cambie
-- por una propia. Supabase Auth no tiene un flag nativo de "forzar cambio en
-- el proximo login"; se modela con una columna en profiles que el frontend
-- consulta apenas hay sesion: si esta en true, ProtectedRoute intercepta
-- CUALQUIER ruta protegida y solo deja ver la pantalla de cambio de
-- contraseña, hasta que el usuario la cambie (entonces se pone en false).
--
-- No es un mecanismo de RLS (no bloquea llamadas a la API si alguien
-- bypasea el frontend), es una gate de UX: la contraseña temporal sigue
-- siendo una contraseña valida real en Supabase Auth desde el momento en que
-- se crea. Igual reduce mucho la ventana de exposicion en el uso normal de
-- la app.

alter table profiles
  add column if not exists must_change_password boolean not null default false;

comment on column profiles.must_change_password is 'true si el usuario debe cambiar su contraseña antes de poder usar el resto de la app (seteado en true al crear la cuenta con una contraseña definida por un admin en admin-create-user; se pone en false cuando el usuario cambia su contraseña desde /ajustes o la pantalla de cambio forzado).';

-- El propio usuario debe poder poner esta columna en false al cambiar su
-- contraseña (AjustesPage ya llama a updateProfile, que pasa por
-- profiles_update_self). guard_profile_self_edit_columns (0028) bloquea
-- columnas administrativas en auto-edicion pero no conocia esta columna
-- nueva; se agrega una excepcion explicita: el usuario SI puede poner
-- must_change_password a false a si mismo (no puede ponerla en true, eso
-- solo lo hace admin-create-user via service_role, que no pasa por RLS).

create or replace function guard_profile_self_edit_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_super_admin() then
    return new;
  end if;

  if new.auth_user_id = auth.uid() then
    if new.station_id is distinct from old.station_id then
      raise exception 'No podés cambiar tu propio cuartel. Pedile a un administrador que lo haga.';
    end if;
    if new.region_id is distinct from old.region_id then
      raise exception 'No podés cambiar tu propia región. Pedile a un administrador que lo haga.';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'No podés activar/desactivar tu propia cuenta. Pedile a un administrador que lo haga.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'No podés cambiar tu email institucional desde tu perfil. Pedile a un administrador que lo haga.';
    end if;
    if new.rank is distinct from old.rank then
      raise exception 'No podés cambiar tu propia jerarquía. Pedile a un administrador que lo haga.';
    end if;
    if new.seniority_start_date is distinct from old.seniority_start_date then
      raise exception 'No podés cambiar tu propia fecha de ingreso. Pedile a un administrador que lo haga.';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'No podés cambiar la cuenta vinculada a tu perfil.';
    end if;
    -- must_change_password: el usuario solo puede pasarlo de true a false
    -- (confirmar que ya cambio su contraseña), nunca de false a true.
    if new.must_change_password is distinct from old.must_change_password and new.must_change_password = true then
      raise exception 'No podés marcar tu cuenta para forzar un cambio de contraseña.';
    end if;
  end if;

  return new;
end;
$$;

comment on function guard_profile_self_edit_columns() is 'Bloquea el cambio de columnas administrativas cuando un usuario no-superadmin edita su propia fila de profiles. Excepciones explicitas: full_name/phone/position/avatar_url libres, must_change_password solo puede pasar de true a false (nunca al reves) por el propio usuario.';
