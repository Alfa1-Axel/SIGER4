-- SIGER4 - EXECUTE explicito en funciones SECURITY DEFINER
--
-- Problema (ver auditoria de seguridad): Postgres otorga EXECUTE a PUBLIC por
-- defecto en toda funcion nueva, salvo que se revoque explicitamente. Ninguna
-- de las funciones SECURITY DEFINER de SIGER4 tenia un REVOKE/GRANT explicito
-- (salvo las agregadas en 0025/0029/0030). En la practica esto no habilitaba
-- una escalada real porque:
--   - Las funciones de trigger (audit_row_change, sync_station_*, notify_*,
--     guard_profile_self_edit_columns, normalize_profile_email) dependen de
--     NEW/OLD, que solo existen en contexto de trigger: llamarlas directo
--     via RPC falla o no hace nada util.
--   - Los helpers de RLS (current_profile_id, has_role, my_*_ids, etc.) ya
--     solo devuelven datos relativos a auth.uid() del que llama, asi que
--     ejecutarlos directo no filtra nada que esa persona no pudiera ver ya.
-- Aun asi, "funciona por casualidad" no es lo mismo que "esta bien
-- configurado": se cierra explicitamente para que ninguna funcion quede
-- expuesta a anon/authenticated por default, y cada helper que SI necesita
-- ser invocable via RPC (dentro de policies RLS o desde el cliente) recibe
-- su GRANT puntual.
--
-- Tambien se corrige set_updated_at() (0001), la unica funcion del sistema
-- que quedo sin "security definer" ni "set search_path = public": no es
-- explotable tal como esta (no consulta tablas propias, solo asigna
-- new.updated_at = now()), pero se corrige por consistencia y para que no
-- quede como el unico caso distinto si en el futuro se le agrega logica.

create or replace function set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Funciones de trigger: bloquear PUBLIC, no necesitan GRANT a nadie (Postgres
-- las invoca internamente al disparar el trigger, sin pasar por permisos de
-- EXECUTE del rol que causo el evento).
-- ============================================================

revoke all on function set_updated_at() from public;
revoke all on function sync_station_vehicles_count() from public;
revoke all on function sync_station_personnel_count() from public;
revoke all on function notify_course_created() from public;
revoke all on function notify_document_created() from public;
revoke all on function notify_station_status_change() from public;
revoke all on function notify_vehicle_status_change() from public;
revoke all on function notify_personnel_status_change() from public;
revoke all on function notify_attendance_created() from public;
revoke all on function notify_intervention_created() from public;
revoke all on function audit_row_change() from public;
revoke all on function audit_course_stations_change() from public;
revoke all on function protect_super_admin_roles_scopes() from public;
revoke all on function guard_profile_self_edit_columns() from public;
revoke all on function normalize_profile_email() from public;

-- ============================================================
-- Helpers de RLS: SI necesitan EXECUTE para authenticated (se usan dentro de
-- "using"/"with check" de policies, que corren con los permisos del rol que
-- hizo la consulta; y my_station_ids()/etc. tambien se llaman directo desde
-- codigo cliente en algunos reportes). anon no las necesita: todas las tablas
-- de SIGER4 exigen autenticacion para leer.
-- ============================================================

revoke all on function current_profile_id() from public;
grant execute on function current_profile_id() to authenticated;

revoke all on function has_role(role_key) from public;
grant execute on function has_role(role_key) to authenticated;

revoke all on function is_regional_role() from public;
grant execute on function is_regional_role() to authenticated;

revoke all on function is_escuela_role() from public;
grant execute on function is_escuela_role() to authenticated;

revoke all on function is_super_admin() from public;
grant execute on function is_super_admin() to authenticated;

revoke all on function my_station_ids() from public;
grant execute on function my_station_ids() to authenticated;

revoke all on function my_region_ids() from public;
grant execute on function my_region_ids() to authenticated;

revoke all on function my_subsede_ids() from public;
grant execute on function my_subsede_ids() to authenticated;

-- is_informatica_r4() ya fue cerrada explicitamente en la migracion 0029
-- (revoke all from public + grant a authenticated); no se repite aca.
