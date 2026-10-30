-- SIGER4 - informatica_r4 como superadmin real e intocable por otros
--
-- Hasta ahora is_informatica_r4() trataba a informatica_r4 e
-- integrante_informatica como equivalentes (ambos "admin maximo"). Eso tenia
-- dos problemas:
--  1. El trigger prevent_self_scope_change (0017) usaba is_informatica_r4()
--     para eximir del bloqueo de auto-cambio de scope, lo que en la practica
--     tambien eximia a integrante_informatica -- pero un informatica_r4 real
--     SI debe poder cambiarse su propio cuartel/region si hace falta.
--  2. Nada impedia que un integrante_informatica quitara o modificara los
--     roles/scopes de un perfil informatica_r4, degradando al superadmin real.
--
-- Se introduce is_super_admin(): true SOLO para el rol informatica_r4 (no
-- integrante_informatica). is_informatica_r4() sigue igual (ambos roles,
-- usado en el resto del sistema para "acceso administrativo total" a
-- cuarteles/vehiculos/cursos/etc, donde no hace falta esta distincion mas
-- fina). La distincion solo importa para las dos protecciones de esta
-- migracion: auto-cambio de scope, y proteccion de roles/scopes ajenos de un
-- informatica_r4.

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
      and ur.role = 'informatica_r4'
  );
$$;

comment on function is_super_admin() is 'Devuelve true solo para el rol informatica_r4 (no integrante_informatica). Es el superadmin real: puede editar cualquier cosa, incluido su propio rol/scope/cuartel.';

-- ---------------- Fix: auto-cambio de scope ----------------
-- Ahora solo is_super_admin() (informatica_r4) esta exento del bloqueo.
-- integrante_informatica queda sujeto a la misma regla que cualquier otro
-- usuario: no puede cambiar su propio cuartel/region.

create or replace function prevent_self_scope_change()
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
    if new.station_id is distinct from old.station_id or new.region_id is distinct from old.region_id then
      raise exception 'No podés cambiar tu propio cuartel o región. Pedile a un administrador que lo haga.';
    end if;
  end if;

  return new;
end;
$$;

comment on function prevent_self_scope_change() is 'Impide que un usuario cambie su propio station_id/region_id al editar su perfil. Solo informatica_r4 (superadmin real) puede hacerlo; integrante_informatica no.';

-- ---------------- Nuevo: proteger roles/scopes de un informatica_r4 ----------------
-- Nadie que no sea informatica_r4 puede insertar/actualizar/borrar filas de
-- user_roles o user_scopes que pertenezcan a un perfil que ya tiene el rol
-- informatica_r4. Esto evita que integrante_informatica (u otro rol con
-- permiso de escritura sobre estas tablas) degrade o le quite alcance a un
-- superadmin real. Tambien cubre el caso de otorgar el rol informatica_r4 por
-- primera vez: solo otro informatica_r4 puede convertir a alguien en
-- superadmin (new.role = 'informatica_r4' en un insert cuenta como "target
-- pasa a ser informatica_r4", no hace falta que ya lo tuviera antes).

create or replace function protect_super_admin_roles_scopes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_id uuid;
  target_is_super_admin boolean;
begin
  target_profile_id := coalesce(new.profile_id, old.profile_id);

  select exists (
    select 1 from user_roles where profile_id = target_profile_id and role = 'informatica_r4'
  ) into target_is_super_admin;

  -- Otorgar el rol informatica_r4 por primera vez tambien requiere ser
  -- informatica_r4 (si no, target_is_super_admin todavia seria false en el
  -- insert que lo crea, y la fila nueva se colaria). tg_op <> 'DELETE' evita
  -- acceder a new.role cuando new es null (en un delete).
  if tg_table_name = 'user_roles' and tg_op <> 'DELETE' and new.role = 'informatica_r4' then
    target_is_super_admin := true;
  end if;

  if target_is_super_admin and not is_super_admin() then
    raise exception 'No podés modificar los roles o alcances de un usuario Informática R4. Solo otro Informática R4 puede hacerlo.';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function protect_super_admin_roles_scopes() is 'Impide que alguien que no sea informatica_r4 modifique user_roles/user_scopes de un perfil que ya tiene el rol informatica_r4, u otorgue el rol informatica_r4 por primera vez.';

create trigger trg_protect_super_admin_user_roles
  before insert or update or delete on user_roles
  for each row execute function protect_super_admin_roles_scopes();

create trigger trg_protect_super_admin_user_scopes
  before insert or update or delete on user_scopes
  for each row execute function protect_super_admin_roles_scopes();
