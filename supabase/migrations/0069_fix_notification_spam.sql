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
-- soportadas por Supabase) -- UN solo trigger fire por sentencia SQL,
-- sin importar cuantas filas afecte, con una notificacion que resume TODOS
-- los roles/scopes tocados en esa sentencia. notify_profile_lifecycle_change
-- (profiles) no se toca: profiles.insert/update siempre afecta una sola
-- fila en los flujos reales del sistema (alta o edicion de un usuario
-- puntual), no hay equivalente al problema de "insert masivo" ahi.

drop trigger if exists trg_notify_role_change on user_roles;
drop trigger if exists trg_notify_scope_change on user_scopes;

create or replace function notify_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_added text;
  v_removed text;
  v_body text;
begin
  v_actor_id := current_profile_id();

  -- Nombres de los usuarios afectados + rol asignado, para insert; solo se
  -- excluye de la lista al propio actor (si es el mismo perfil afectado),
  -- no se suprime el aviso completo con que UN solo perfil en el lote sea
  -- el actor -- si un admin se asigna un rol a si mismo Y a otro usuario en
  -- la misma sentencia (caso raro pero posible), el otro usuario si debe
  -- notificarse.
  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || nt.role || '"', e'\n')
  into v_added
  from new_table nt
  join profiles p on p.id = nt.profile_id
  where v_actor_id is null or v_actor_id != nt.profile_id;

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || ot.role || '"', e'\n')
  into v_removed
  from old_table ot
  join profiles p on p.id = ot.profile_id
  where v_actor_id is null or v_actor_id != ot.profile_id;

  if v_added is null and v_removed is null then
    return null;
  end if;

  v_body := '';
  if v_added is not null then v_body := v_body || 'Roles asignados:' || e'\n' || v_added; end if;
  if v_removed is not null then
    if v_body != '' then v_body := v_body || e'\n\n'; end if;
    v_body := v_body || 'Roles quitados:' || e'\n' || v_removed;
  end if;

  perform notify_informatica_staff('Cambio de rol de usuario', v_body);
  return null;
end;
$$;

comment on function notify_role_change() is 'Notifica a informatica_r4/integrante_informatica cuando se asigna o quita uno o mas roles, en UN solo aviso por sentencia SQL (for each statement + transition tables) -- evita notificar N veces cuando una sola operacion (ej. reemplazo completo de roles en admin-update-user) toca N filas. Excluye de la lista al propio actor cuando se identifica.';

create trigger trg_notify_role_change
  after insert or delete on user_roles
  referencing new table as new_table old table as old_table
  for each statement execute function notify_role_change();

create or replace function notify_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_added text;
  v_removed text;
  v_body text;
begin
  v_actor_id := current_profile_id();

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || nt.scope_type || '"', e'\n')
  into v_added
  from new_table nt
  join profiles p on p.id = nt.profile_id
  where v_actor_id is null or v_actor_id != nt.profile_id;

  select string_agg(coalesce(p.full_name, 'usuario') || ' → "' || ot.scope_type || '"', e'\n')
  into v_removed
  from old_table ot
  join profiles p on p.id = ot.profile_id
  where v_actor_id is null or v_actor_id != ot.profile_id;

  if v_added is null and v_removed is null then
    return null;
  end if;

  v_body := '';
  if v_added is not null then v_body := v_body || 'Alcances agregados:' || e'\n' || v_added; end if;
  if v_removed is not null then
    if v_body != '' then v_body := v_body || e'\n\n'; end if;
    v_body := v_body || 'Alcances quitados:' || e'\n' || v_removed;
  end if;

  perform notify_informatica_staff('Cambio de alcance de usuario', v_body);
  return null;
end;
$$;

comment on function notify_scope_change() is 'Notifica a informatica_r4/integrante_informatica cuando se agrega o quita uno o mas alcances (scope), en UN solo aviso por sentencia SQL (for each statement + transition tables) -- mismo criterio que notify_role_change.';

create trigger trg_notify_scope_change
  after insert or delete on user_scopes
  referencing new table as new_table old table as old_table
  for each statement execute function notify_scope_change();
