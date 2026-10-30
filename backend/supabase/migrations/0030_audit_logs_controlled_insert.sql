-- SIGER4 - audit_logs: reemplazar insert libre por RPC controlada
--
-- Problema (ver auditoria de seguridad): audit_logs_insert_authenticated
-- permitia "for insert with check (auth.role() = 'authenticated')" -- CUALQUIER
-- usuario autenticado podia insertar una fila de auditoria con
-- actor_profile_id, table_name, old_value/new_value y hasta record_id
-- arbitrarios. Eso permite falsificar bitacora: un usuario podria insertar
-- una fila que aparente ser una accion de otro usuario, o simular una
-- modificacion de una tabla sensible que nunca ocurrio.
--
-- La unica necesidad real de insert desde el cliente es recordAuditEvent()
-- (src/lib/api/audit.ts), usado solo para "reporte generado" (ReportesPage),
-- un evento que no tiene tabla propia ni trigger. Se reemplaza por una RPC
-- SECURITY DEFINER que:
--   - fuerza actor_profile_id = current_profile_id() (nunca lo que mande el
--     cliente),
--   - restringe table_name/action a un allowlist fijo (no se puede
--     impersonar auditoria de "profiles", "vehicles", etc., que ya tienen su
--     propio trigger automatico),
--   - no acepta old_value (un evento manual como "reporte generado" no tiene
--     estado previo que auditar).
--
-- El resto de la auditoria (altas/bajas/modificaciones de tablas reales)
-- sigue funcionando igual, generada por triggers audit_row_change() con
-- SECURITY DEFINER, que no pasan por RLS de insert.

drop policy if exists "audit_logs_insert_authenticated" on audit_logs;

-- Ningun rol comun puede insertar directo en audit_logs. Los triggers siguen
-- funcionando porque corren SECURITY DEFINER (bypasean RLS del rol que
-- disparo la accion).
revoke insert on audit_logs from authenticated, anon;

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
  if p_table_name not in ('reports') then
    raise exception 'table_name no permitido para auditoria manual: %', p_table_name;
  end if;
  if p_action not in ('reporte_generado') then
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

comment on function record_manual_audit_event(text, text, text, jsonb, text) is 'Unico punto de insert manual en audit_logs permitido desde el cliente (ej. "reporte generado", que no tiene tabla propia ni trigger). Fuerza actor_profile_id al perfil real del usuario actual y restringe table_name/action a un allowlist fijo, para que nadie pueda falsificar bitacora de otras tablas o de otro usuario.';

revoke all on function record_manual_audit_event(text, text, text, jsonb, text) from public;
grant execute on function record_manual_audit_event(text, text, text, jsonb, text) to authenticated;
