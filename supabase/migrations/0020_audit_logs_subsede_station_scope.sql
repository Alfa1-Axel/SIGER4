-- SIGER4 - Auditoria: alcance de subsede y cuartel
--
-- audit_logs ya tenia region_id/subsede_id/station_id resueltos por evento
-- (desde 0014) y politicas de lectura para informatica_r4/integrante_informatica
-- (is_informatica_r4()) y para roles regionales (is_regional_role()), pero
-- ningun usuario de subsede o de cuartel podia leer ni una fila de auditoria:
-- no existia una politica select que usara my_subsede_ids()/my_station_ids().
-- Esto se agrega ahora para la nueva pantalla /auditoria, donde cada rol debe
-- poder ver la actividad de su propio alcance (nunca la de otros cuarteles o
-- subsedes fuera del suyo).

create policy "audit_logs_select_subsede" on audit_logs
  for select using (
    subsede_id is not null
    and subsede_id in (select my_subsede_ids())
  );

create policy "audit_logs_select_station" on audit_logs
  for select using (
    station_id is not null
    and station_id in (select my_station_ids())
  );
