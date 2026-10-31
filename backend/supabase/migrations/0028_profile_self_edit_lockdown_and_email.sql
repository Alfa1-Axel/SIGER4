-- SIGER4 - Perfil propio: columnas editables acotadas + email normalizado/unico
--
-- Problema (ver auditoria de seguridad): profiles_update_self permite a
-- cualquier usuario actualizar su propia fila (auth_user_id = auth.uid()),
-- pero RLS "using" solo controla QUE FILA se puede tocar, no QUE COLUMNAS.
-- El trigger prevent_self_scope_change (0017/0018) ya bloqueaba
-- station_id/region_id, pero dejaba sin cubrir email, rank,
-- seniority_start_date, is_active y auth_user_id: un usuario podia mandar un
-- PATCH directo a la API REST de Supabase (bypaseando la UI, que solo manda
-- full_name/phone/position/avatar_url) y auto-asignarse otra jerarquia,
-- reactivarse si fue desactivado, o cambiar su email sin pasar por el flujo
-- de Auth.
--
-- Fix: se generaliza prevent_self_scope_change a
-- guard_profile_self_edit_columns(), que bloquea el cambio de CUALQUIER
-- columna administrativa cuando quien edita es el propio dueño de la fila y
-- no es informatica_r4 (superadmin real). Columnas permitidas para
-- auto-edicion: full_name, phone, position, avatar_url. Todo lo demas
-- (email, rank, seniority_start_date, region_id, station_id, is_active,
-- auth_user_id) solo lo puede tocar informatica_r4 o un admin/regional via
-- profiles_write_admin (that policy sigue sin cambios: acceso total).
--
-- Tambien se normaliza profiles.email (lower/trim) para evitar duplicados
-- por mayusculas/espacios, y se agrega unicidad real.

-- ============================================================
-- 1. Normalizar emails existentes antes de agregar la constraint unica
-- ============================================================
-- Si dos perfiles ya coexisten con el mismo email normalizado (ej.
-- "Juan@x.com" y "juan@x.com "), la unicidad fallaria al crearse. Se
-- resuelve dejando el registro mas antiguo con el email normalizado y
-- appendeando un sufijo al mas nuevo, en vez de fallar la migracion a
-- ciegas -- asi el admin puede revisar y fusionar manualmente esos casos
-- puntuales despues (quedan visibles por el sufijo "+dup-<n>").

update profiles set email = lower(trim(email));

with duplicates as (
  select id, email,
    row_number() over (partition by email order by created_at asc) as rn
  from profiles
)
update profiles p
set email = regexp_replace(p.email, '(@)', '+dup-' || d.rn || '\1')
from duplicates d
where p.id = d.id and d.rn > 1;

alter table profiles
  add constraint profiles_email_unique unique (email);

comment on constraint profiles_email_unique on profiles is 'Un email institucional solo puede pertenecer a un perfil. Emails duplicados detectados al aplicar esta migracion fueron renombrados con sufijo "+dup-N" para revision manual (ver comentario de la migracion 0028).';

-- ============================================================
-- 2. Normalizar email en cada insert/update (trigger, no CHECK: CHECK no
--    puede modificar el valor, solo validarlo)
-- ============================================================

create or replace function normalize_profile_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

comment on function normalize_profile_email() is 'Normaliza profiles.email a minusculas y sin espacios antes de guardar, para que la unicidad y el matching de invitaciones (link_invited_profile) sean consistentes sin importar como lo haya tipeado el usuario o el admin que invita.';

create trigger trg_normalize_profile_email
  before insert or update on profiles
  for each row execute function normalize_profile_email();

-- link_invited_profile (0005) matchea auth.users.email contra profiles.email
-- por igualdad exacta; Supabase Auth ya normaliza emails a minusculas antes
-- de guardarlos en auth.users, asi que con profiles.email tambien normalizado
-- el match sigue funcionando igual, ahora de forma mas confiable.

-- ============================================================
-- 3. Bloquear columnas administrativas en auto-edicion
-- ============================================================

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
  end if;

  return new;
end;
$$;

comment on function guard_profile_self_edit_columns() is 'Reemplaza a prevent_self_scope_change: cuando el usuario edita su propia fila de profiles y no es informatica_r4 (superadmin real), bloquea el cambio de cualquier columna administrativa (station_id, region_id, is_active, email, rank, seniority_start_date, auth_user_id). Las unicas columnas que un usuario puede auto-editar son full_name, phone, position y avatar_url. Reactivar/desactivar, cambiar jerarquia/email/scope requiere profiles_write_admin (informatica_r4).';

drop trigger if exists trg_prevent_self_scope_change on profiles;
drop function if exists prevent_self_scope_change();

create trigger trg_guard_profile_self_edit_columns
  before update on profiles
  for each row execute function guard_profile_self_edit_columns();
