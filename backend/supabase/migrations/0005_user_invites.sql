-- SIGER4 - Invitacion de usuarios sin exponer la service_role key
--
-- Permite crear un perfil (nombre, rol, cuartel/region) ANTES de que la persona
-- tenga una cuenta de Supabase Auth. Cuando esa persona completa su propio
-- registro (supabase.auth.signUp) con el mismo email, un trigger vincula
-- automaticamente su auth_user_id al perfil ya creado por el administrador.

alter table profiles alter column auth_user_id drop not null;

create index if not exists idx_profiles_email on profiles(email);

create or replace function link_invited_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set auth_user_id = new.id
  where email = new.email and auth_user_id is null;
  return new;
end;
$$;

comment on function link_invited_profile() is 'Vincula automaticamente un perfil invitado (auth_user_id nulo) con la cuenta de Supabase Auth recien creada que coincide por email.';

create trigger trg_link_invited_profile
  after insert on auth.users
  for each row execute function link_invited_profile();
