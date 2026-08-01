-- SIGER4 - is_active debe bloquear acceso real, no ser solo un flag visual
--
-- Problema (ver auditoria de seguridad): profiles.is_active existe desde
-- 0001, pero ninguna funcion de RLS lo consultaba. Un usuario desactivado
-- (ej. baja de un bombero, suspension disciplinaria) que conserva una sesion
-- de Supabase Auth valida seguia pudiendo leer y escribir todo lo que sus
-- roles/scopes le permitieran, porque current_profile_id()/is_informatica_r4()/
-- has_role()/etc. nunca miraban profiles.is_active.
--
-- Fix: current_profile_id() pasa a devolver NULL para un usuario inactivo.
-- Como practicamente todo el resto de las funciones de RLS (my_station_ids,
-- my_region_ids, my_subsede_ids, y las policies "_select_self"/"_write_self")
-- dependen de current_profile_id() = NULL para no matchear nada, esto corta
-- el acceso de forma transversal sin tener que tocar las ~40 policies una por
-- una. Los helpers que consultan user_roles/profiles directamente por
-- auth.uid() (is_informatica_r4, has_role, is_regional_role, is_escuela_role,
-- is_super_admin) tambien se actualizan explicitamente por las dudas, ya que
-- no pasan por current_profile_id().
--
-- No se toca profiles_select_self (un usuario inactivo todavia necesita
-- poder leer su propio perfil para que el frontend detecte is_active=false y
-- lo redirija/desloguee con un mensaje claro, en vez de que la sesion se
-- rompa con errores RLS crudos). El bloqueo real es sobre el resto de las
-- tablas del sistema.

create or replace function current_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid() and is_active = true;
$$;

comment on function current_profile_id() is 'Id del perfil del usuario autenticado actual. Devuelve NULL si el perfil esta inactivo (is_active = false), lo que corta en cascada el acceso de escritura/lectura de scope en el resto de las policies RLS que dependen de este id (my_station_ids, my_region_ids, my_subsede_ids, y las policies "_self").';

create or replace function is_informatica_r4()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role in ('informatica_r4', 'integrante_informatica')
  );
$$;

create or replace function has_role(check_role role_key)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role = check_role
  );
$$;

create or replace function is_regional_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role in ('secretario_regional', 'director_escuela')
  );
$$;

create or replace function is_escuela_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role in ('director_escuela', 'instructor')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role = 'informatica_r4'
  );
$$;

-- my_station_ids/my_region_ids/my_subsede_ids no se redefinen: ya dependen de
-- current_profile_id() para la parte de user_scopes, que ahora es NULL para
-- un perfil inactivo. Pero tambien leen directo de "profiles" por auth.uid()
-- (fallback al station_id/region_id propio del perfil sin pasar por
-- user_scopes) sin filtrar is_active, asi que se redefinen para cerrar ese
-- gap tambien.

create or replace function my_station_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select station_id from user_scopes
  where profile_id = current_profile_id() and station_id is not null
  union
  select station_id from profiles
  where auth_user_id = auth.uid() and is_active = true and station_id is not null;
$$;

create or replace function my_region_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select region_id from user_scopes
  where profile_id = current_profile_id() and region_id is not null
  union
  select region_id from profiles
  where auth_user_id = auth.uid() and is_active = true and region_id is not null;
$$;

-- ============================================================
-- Bloqueo explicito de escritura sobre profiles cuando el actor esta inactivo
-- ============================================================
-- profiles_update_self usa auth_user_id = auth.uid() directamente (no
-- current_profile_id()), asi que un perfil inactivo todavia podria intentar
-- actualizarse a si mismo. Se agrega is_active = true a la condicion de
-- "using" para que ni siquiera pueda tocar su propia fila (salvo que sea
-- is_informatica_r4(), cubierto por profiles_write_admin, que reactiva
-- cuentas).

drop policy if exists "profiles_update_self" on profiles;

create policy "profiles_update_self" on profiles
  for update using (auth_user_id = auth.uid() and is_active = true);

comment on policy "profiles_update_self" on profiles is 'Un usuario puede actualizar su propio perfil solo mientras esta activo. Reactivar una cuenta desactivada requiere is_informatica_r4() (profiles_write_admin).';
