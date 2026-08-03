-- SIGER4 - Fix critico: protect_super_admin_roles_scopes() rompia INSERT en user_scopes
--
-- Bug real detectado en produccion (log de Supabase):
--   record "new" has no field "role"
--   PL/pgSQL function protect_super_admin_roles_scopes()
--   SQL expression: tg_table_name = 'user_roles' and tg_op <> 'DELETE' and new.role = 'informatica_r4'
--
-- Causa real: "tg_table_name = 'user_roles' and tg_op <> 'DELETE' and
-- new.role = 'informatica_r4'" es UNA sola expresion SQL. PL/pgSQL no evalua
-- "and" de a un operando por vez con corto-circuito antes de resolver
-- columnas: analiza (parsea) la expresion COMPLETA una sola vez, resolviendo
-- TODAS las referencias a columnas (incluida new.role) antes de evaluar
-- ningun operador booleano. Como esa resolucion pasa contra el tipo de fila
-- real de NEW en cada ejecucion, cuando el trigger disparaba para
-- user_scopes (tabla sin columna role) la resolucion fallaba con "record
-- new has no field role", sin importar que el resto de la condicion fuera
-- falso. Esto rompia CUALQUIER insert en user_scopes, incluido el de
-- admin-create-user al dar de alta un usuario nuevo (que crea profile +
-- user_roles + user_scopes en secuencia): el insert en user_scopes fallaba
-- con 500, el Edge Function respondia "non-2xx status code" al frontend.
--
-- Fix: mover la condicion que usa new.role a un IF anidado DENTRO de
-- "if tg_table_name = 'user_roles' then". PL/pgSQL compila y cachea el plan
-- de cada expresion de forma perezosa, la primera vez que la ejecucion
-- realmente LLEGA a esa sentencia — un IF nunca ejecuta el cuerpo de una
-- rama que no se cumple, asi que la expresion con new.role nunca se prepara
-- cuando tg_table_name es 'user_scopes'. Ademas, cada trigger (uno por
-- tabla) tiene su propio cache de plan de PL/pgSQL (esta cacheado por
-- OID de funcion + OID de la relacion del trigger), asi que no hay riesgo de
-- que una ejecucion previa sobre user_roles "contamine" el cache usado por
-- el trigger de user_scopes.
--
-- Se mantiene exactamente la misma proteccion: nadie que no sea
-- informatica_r4 puede modificar (insert/update/delete) los roles o scopes
-- de un perfil que ya es informatica_r4, ni otorgarle el rol informatica_r4
-- por primera vez. informatica_r4 (is_super_admin()) sigue exento, incluso
-- para sus propios roles/scopes.

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
  -- profile_id existe en ambas tablas (user_roles y user_scopes), asi que
  -- esta linea es segura hoy. Se escribe explicita por tg_op de todos modos
  -- (en vez de coalesce(new.profile_id, old.profile_id), que referencia new
  -- Y old en la misma expresion) para no repetir el mismo patron que causo
  -- el bug de arriba si esta funcion se reutiliza a futuro para una tabla
  -- que no tenga profile_id en ambos records.
  if tg_op = 'DELETE' then
    target_profile_id := old.profile_id;
  else
    target_profile_id := new.profile_id;
  end if;

  select exists (
    select 1 from user_roles where profile_id = target_profile_id and role = 'informatica_r4'
  ) into target_is_super_admin;

  -- Otorgar el rol informatica_r4 por primera vez tambien requiere ser
  -- informatica_r4 (si no, target_is_super_admin todavia seria false en el
  -- insert que lo crea, y la fila nueva se colaria). Este bloque SOLO se
  -- ejecuta cuando tg_table_name = 'user_roles', asi que new.role nunca se
  -- evalua contra un record de user_scopes.
  if tg_table_name = 'user_roles' then
    if tg_op <> 'DELETE' and new.role = 'informatica_r4' then
      target_is_super_admin := true;
    end if;
  end if;

  if target_is_super_admin and not is_super_admin() then
    raise exception 'No podés modificar los roles o alcances de un usuario Informática R4. Solo otro Informática R4 puede hacerlo.';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function protect_super_admin_roles_scopes() is 'Impide que alguien que no sea informatica_r4 modifique user_roles/user_scopes de un perfil que ya tiene el rol informatica_r4, u otorgue el rol informatica_r4 por primera vez (via user_roles). Fix 2026-08: separa el acceso a new.role dentro de un IF exclusivo de tg_table_name=''user_roles'' para no romper el trigger al dispararse sobre user_scopes (que no tiene columna role).';
