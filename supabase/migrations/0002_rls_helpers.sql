-- SIGER4 - Funciones auxiliares para Row Level Security
-- Se definen como SECURITY DEFINER para poder consultar profiles/user_roles/user_scopes
-- sin caer en recursion infinita dentro de las propias políticas RLS de esas tablas.

create or replace function current_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

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
      and ur.role in ('informatica_r4', 'integrante_informatica')
  );
$$;

comment on function is_informatica_r4() is 'Devuelve true si el usuario pertenece al Dpto. de Informatica y Estadistica R4 (administrador maximo del sistema).';

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
      and ur.role in ('secretario_regional', 'director_escuela')
  );
$$;

comment on function is_regional_role() is 'Devuelve true si el usuario tiene autoridad de alcance regional (secretario_regional o director_escuela). director_escuela es la maxima autoridad regional (no existe presidente_regional).';

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
      and ur.role in ('director_escuela', 'instructor')
  );
$$;

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
  where auth_user_id = auth.uid() and station_id is not null;
$$;

comment on function my_station_ids() is 'IDs de cuartel a los que el usuario actual tiene acceso via user_scopes o su perfil.';

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
  where auth_user_id = auth.uid() and region_id is not null;
$$;

comment on function my_region_ids() is 'IDs de region a los que el usuario actual tiene acceso via user_scopes o su perfil.';
