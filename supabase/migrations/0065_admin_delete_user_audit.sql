-- SIGER4 - Permitir auditoria manual del borrado directo de usuarios
--
-- admin-delete-user (Edge Function nueva) borra el auth.users del usuario
-- objetivo con service_role, lo que dispara en cascada el borrado de
-- profiles (auth_user_id ... on delete cascade) y desde ahi el resto de las
-- tablas con FK a profiles (cascade/set null segun corresponda, ver
-- DEPLOYMENT.md). Ese borrado en cascada SI queda registrado por
-- audit_row_change() en la fila de 'profiles' (accion 'delete'), pero con
-- actor_profile_id null -- al ejecutarse con service_role, auth.uid() es
-- null dentro del trigger, current_profile_id() tambien, y no hay forma de
-- que el trigger sepa quien realmente ejecuto la Edge Function.
--
-- Por eso, igual que con los cambios de Auth de admin-update-user
-- (migracion 0044), se registra un evento manual ANTES de ejecutar el
-- borrado, bajo el cliente autenticado del actor real (no con service_role),
-- para que quede constancia de quien uso el borrado directo, sobre que
-- usuario, y por que.
--
-- Se amplia el allowlist de record_manual_audit_event() (0030/0044)
-- agregando table_name='auth_users' / action='admin_delete_user', sin tocar
-- los casos existentes.

create or replace function record_manual_audit_event(
  p_action text,
  p_table_name text,
  p_record_id text default null,
  p_new_value jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
begin
  if p_table_name not in ('reports', 'auth_users') then
    raise exception 'table_name no permitido para auditoria manual: %', p_table_name;
  end if;
  if p_action not in ('reporte_generado', 'admin_auth_update', 'admin_delete_user') then
    raise exception 'action no permitida para auditoria manual: %', p_action;
  end if;

  v_actor := current_profile_id();
  if v_actor is null then
    raise exception 'No se pudo resolver el perfil del usuario actual (¿cuenta inactiva?).';
  end if;

  select region_id, station_id into v_region_id, v_station_id from profiles where id = v_actor;
  if v_station_id is not null then
    select subsede_id into v_subsede_id from stations where id = v_station_id;
  end if;

  insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, reason, region_id, subsede_id, station_id)
  values (v_actor, p_action, p_table_name, p_record_id, null, p_new_value, p_reason, v_region_id, v_subsede_id, v_station_id);
end;
$$;

comment on function record_manual_audit_event(text, text, text, jsonb, text) is 'Unico punto de insert manual en audit_logs permitido desde el cliente/Edge Functions: "reporte generado" (sin tabla propia), "admin_auth_update" (cambios de email/password/ban en Supabase Auth) y "admin_delete_user" (borrado directo de un usuario, registrado ANTES de ejecutar el delete real, porque el borrado en cascada de profiles corre con service_role y queda con actor null). Fuerza actor_profile_id al perfil real del usuario actual y restringe table_name/action a un allowlist fijo.';
