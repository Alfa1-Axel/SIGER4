-- SIGER4 - Auditoria: excluir a invitado de la lectura por cuartel/subsede
--
-- Hueco detectado en auditoria de permisos (2026-08-07): audit_logs_select_station
-- y audit_logs_select_subsede (migracion 0020) dan lectura completa del
-- historial de auditoria (incluyendo diffs old/new de cada cambio) a
-- CUALQUIER usuario autenticado con alcance de cuartel/subsede, sin excluir
-- ningun rol. invitado esta documentado explicitamente como "Acceso de solo
-- lectura limitado" (ver ROLE_DEFINITIONS en src/types/roles.ts) -- ver el
-- historial completo de cambios de su cuartel excede ese alcance. El sidebar
-- ya ocultaba el link (hideForRoles: ['invitado'] en navigation.ts) pero la
-- ruta no tenia guarda propia y la RLS no lo excluia, asi que igual podia
-- acceder tipeando /auditoria directo.

drop policy if exists "audit_logs_select_subsede" on audit_logs;
drop policy if exists "audit_logs_select_station" on audit_logs;

create policy "audit_logs_select_subsede" on audit_logs
  for select using (
    not has_role('invitado')
    and subsede_id is not null
    and subsede_id in (select my_subsede_ids())
  );

create policy "audit_logs_select_station" on audit_logs
  for select using (
    not has_role('invitado')
    and station_id is not null
    and station_id in (select my_station_ids())
  );

comment on policy "audit_logs_select_subsede" on audit_logs is 'Lectura de auditoria por subsede: cualquier rol con alcance de subsede, excepto invitado (solo lectura limitado, no incluye historial de auditoria).';
comment on policy "audit_logs_select_station" on audit_logs is 'Lectura de auditoria por cuartel: cualquier rol con alcance de cuartel, excepto invitado (solo lectura limitado, no incluye historial de auditoria).';
