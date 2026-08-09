-- SIGER4 - QA: corregir spam de notificaciones sensibles por alta/edicion de usuario
--
-- Bug encontrado en auditoria de QA (2026-08-09): trg_notify_role_change y
-- trg_notify_scope_change (migracion 0066) eran "for each row" -- un insert
-- de N filas en una sola sentencia SQL (ej. admin-create-user asignando 2
-- roles con un solo `insert into user_roles (...) values (...), (...)`)
-- dispara el trigger N veces, generando N notificaciones separadas para lo
-- que es UNA sola accion administrativa. Se agrava con admin-update-user,
-- que reemplaza roles/scopes con el patron "delete todo lo previo + insert
-- todo lo nuevo": editar 1 rol de una lista de 3 borra las 3 filas viejas e
-- inserta las 3 nuevas (mas la modificada) = hasta 7 notificaciones de
-- "cambio de rol" por agregar un solo rol. Contradice directamente el
-- objetivo explicito del pedido original ("no notificar cada accion
-- normal") citado en la propia cabecera de 0066.
--
-- Fix: los triggers pasan de "for each row" a "for each statement" con
-- transition tables (old_table/new_table, disponibles desde Postgres 10,
-- soportadas por Supabase) -- UN solo trigger fire por sentencia SQL, sin
-- importar cuantas filas afecte.
--
-- CORRECCION 2026-08-09 (primer intento de esta misma migracion fallo en
-- Supabase con "0A000: transition tables cannot be specified for triggers
-- with more than one event"): Postgres NO permite declarar
-- REFERENCING NEW TABLE / OLD TABLE en un trigger que escucha mas de un
-- evento a la vez (el intento original usaba "after insert or delete ...
-- referencing new table ... old table ..." en un solo trigger, invalido).
-- La transaccion completa de ese intento se aborto sin aplicar ningun
-- cambio, asi que este archivo reemplaza ese contenido in-place (no hizo
-- falta una migracion 0071 aparte, no quedo ningun estado a medias en la
-- base). Fix real: separar en DOS triggers por tabla, uno por evento --
-- "after insert ... referencing new table" (solo ve new_table) y
-- "after delete ... referencing old table" (solo ve old_table) -- cada uno
-- con su propia funcion, en vez de una funcion combinada que lea ambas
-- transition tables desde un unico trigger multi-evento.
--
-- notify_profile_lifecycle_change (profiles) no se toca: profiles.insert/
-- update siempre afecta una sola fila en los flujos reales del sistema
-- (alta o edicion de un usuario puntual), no hay equivalente al problema
-- de "insert masivo" ahi.

drop trigger if exists trg_notify_role_change on user_roles;
drop trigger if exists trg_notify_scope_change on user_scopes;

-- ============================================================
-- user_roles: alta de rol(es)
-- ============================================================

create or replace function notify_role_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_added text;
begin
  v_actor_id := current_profile_id();

  -- Solo se excluye de la lista al propio actor (si es el mismo perfil
  -- afectado), no se suprime el aviso completo con que UN perfil del lote
  -- sea el actor -- si un admin se asigna un rol a si mismo Y a otro
  -- usuario en la misma sentencia (caso raro pero posible), el otro
  -- usuario si debe notificarse.
  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || nt.role || '"', e'\n')
  into v_added
  from new_table nt
  join profiles p on p.id = nt.profile_id
  where v_actor_id is null or v_actor_id != nt.profile_id;

  if v_added is not null then
    perform notify_informatica_staff('Cambio de rol de usuario', 'Roles asignados:' || e'\n' || v_added);
  end if;

  return null;
end;
$$;

comment on function notify_role_added() is 'Notifica a informatica_r4/integrante_informatica cuando se asigna uno o mas roles, en UN solo aviso por sentencia SQL (for each statement + transition table new_table) -- evita notificar N veces cuando una sola operacion (ej. alta de usuario con varios roles) inserta N filas. Excluye de la lista al propio actor cuando se identifica.';

create trigger trg_notify_role_added
  after insert on user_roles
  referencing new table as new_table
  for each statement execute function notify_role_added();

-- ============================================================
-- user_roles: baja de rol(es)
-- ============================================================

create or replace function notify_role_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_removed text;
begin
  v_actor_id := current_profile_id();

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || ot.role || '"', e'\n')
  into v_removed
  from old_table ot
  join profiles p on p.id = ot.profile_id
  where v_actor_id is null or v_actor_id != ot.profile_id;

  if v_removed is not null then
    perform notify_informatica_staff('Cambio de rol de usuario', 'Roles quitados:' || e'\n' || v_removed);
  end if;

  return null;
end;
$$;

comment on function notify_role_removed() is 'Notifica a informatica_r4/integrante_informatica cuando se quita uno o mas roles, en UN solo aviso por sentencia SQL (for each statement + transition table old_table) -- evita notificar N veces cuando una sola operacion (ej. reemplazo completo de roles en admin-update-user) borra N filas. Excluye de la lista al propio actor cuando se identifica.';

create trigger trg_notify_role_removed
  after delete on user_roles
  referencing old table as old_table
  for each statement execute function notify_role_removed();

-- ============================================================
-- user_scopes: alta de alcance(s)
-- ============================================================

create or replace function notify_scope_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_added text;
begin
  v_actor_id := current_profile_id();

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || nt.scope_type || '"', e'\n')
  into v_added
  from new_table nt
  join profiles p on p.id = nt.profile_id
  where v_actor_id is null or v_actor_id != nt.profile_id;

  if v_added is not null then
    perform notify_informatica_staff('Cambio de alcance de usuario', 'Alcances agregados:' || e'\n' || v_added);
  end if;

  return null;
end;
$$;

comment on function notify_scope_added() is 'Notifica a informatica_r4/integrante_informatica cuando se agrega uno o mas alcances (scope), en UN solo aviso por sentencia SQL (for each statement + transition table new_table) -- mismo criterio que notify_role_added.';

create trigger trg_notify_scope_added
  after insert on user_scopes
  referencing new table as new_table
  for each statement execute function notify_scope_added();

-- ============================================================
-- user_scopes: baja de alcance(s)
-- ============================================================

create or replace function notify_scope_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_removed text;
begin
  v_actor_id := current_profile_id();

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || ot.scope_type || '"', e'\n')
  into v_removed
  from old_table ot
  join profiles p on p.id = ot.profile_id
  where v_actor_id is null or v_actor_id != ot.profile_id;

  if v_removed is not null then
    perform notify_informatica_staff('Cambio de alcance de usuario', 'Alcances quitados:' || e'\n' || v_removed);
  end if;

  return null;
end;
$$;

comment on function notify_scope_removed() is 'Notifica a informatica_r4/integrante_informatica cuando se quita uno o mas alcances (scope), en UN solo aviso por sentencia SQL (for each statement + transition table old_table) -- mismo criterio que notify_role_removed.';

create trigger trg_notify_scope_removed
  after delete on user_scopes
  referencing old table as old_table
  for each statement execute function notify_scope_removed();

-- notify_role_change()/notify_scope_change() (0066) quedan sin ningun
-- trigger que las use (ya se dropearon los triggers viejos arriba) -- se
-- borran para no dejar funciones muertas en la base. Nota: el primer
-- intento fallido de ESTA migracion tambien se llamaba notify_role_change/
-- notify_scope_change como funciones combinadas nuevas, pero esa
-- transaccion se aborto completa y nunca llegaron a crearse -- estos DROP
-- solo alcanzan a las funciones originales de 0066.
drop function if exists notify_role_change();
drop function if exists notify_scope_change();
