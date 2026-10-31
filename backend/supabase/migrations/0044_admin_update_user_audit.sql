-- SIGER4 - Permitir auditoria manual de acciones de Auth sin tabla propia
--
-- profiles/user_roles/user_scopes ya quedan auditados automaticamente por
-- audit_row_change() (triggers existentes desde 0004) cuando
-- admin-update-user los actualiza — no hace falta duplicar eso con un
-- insert manual.
--
-- Lo que SI necesita un registro manual es lo que pasa a nivel Supabase
-- Auth y no toca ninguna fila de Postgres visible para un trigger: cambiar
-- el email de la cuenta de Auth, cambiar la contraseña de otro usuario, o
-- banear/desbanear la cuenta. admin-update-user llama a
-- record_manual_audit_event() para dejar constancia de esto puntualmente,
-- SOLO cuando alguno de esos 3 cambios realmente ocurrio.
--
-- Se amplia el allowlist de record_manual_audit_event() (0030) agregando
-- table_name='auth_users' / action='admin_auth_update', sin tocar el caso
-- existente ('reports'/'reporte_generado').

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
  if p_action not in ('reporte_generado', 'admin_auth_update') then
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

comment on function record_manual_audit_event(text, text, text, jsonb, text) is 'Unico punto de insert manual en audit_logs permitido desde el cliente/Edge Functions: "reporte generado" (sin tabla propia) y "admin_auth_update" (cambios de email/password/ban en Supabase Auth, que no dejan rastro en ninguna tabla de Postgres). Fuerza actor_profile_id al perfil real del usuario actual y restringe table_name/action a un allowlist fijo.';
