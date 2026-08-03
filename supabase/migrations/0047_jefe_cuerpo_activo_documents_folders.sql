-- SIGER4 - jefe_cuerpo_activo debe poder gestionar documentos/carpetas de su cuartel
--
-- Matriz institucional confirmada: jefe_cuerpo_activo es la maxima autoridad
-- operativa dentro de su propio cuartel y debe poder "gestionar documentos/
-- carpetas del cuartel". Las policies de documents (0027) y document_folders
-- (0045) solo incluian usuario_carga_cuartel/presidente_cuartel/
-- secretario_comision para el alcance de cuartel — jefe_cuerpo_activo
-- quedaba afuera por una omision (todas las demas tablas de cuartel:
-- stations, vehicles, personnel, attendance_summaries, intervention_summaries
-- ya lo incluian correctamente desde 0027).

drop policy if exists "documents_write_admin_regional_station" on documents;

create policy "documents_write_admin_regional_station" on documents
  for all using (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

drop policy if exists "document_versions_write_admin_regional_station" on document_versions;

create policy "document_versions_write_admin_regional_station" on document_versions
  for insert with check (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
      and (
        is_informatica_r4()
        or (is_regional_role() and (
          (d.region_id is not null and d.region_id in (select my_region_ids()))
          or (d.subsede_id is not null and d.subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
          or (d.station_id is not null and d.station_id in (select id from stations where region_id in (select my_region_ids())))
        ))
        or (d.station_id in (select my_station_ids()) and (
          has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
        ))
      )
    )
  );

drop policy if exists "document_folders_write_admin_regional_station" on document_folders;

create policy "document_folders_write_admin_regional_station" on document_folders
  for all using (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

comment on policy "document_folders_write_admin_regional_station" on document_folders is 'Mismo criterio que documents_write_admin_regional_station: informatica_r4 cualquier alcance; roles regionales (secretario_regional/director_escuela) dentro de su región; roles de cuartel autorizados (usuario_carga_cuartel/presidente_cuartel/secretario_comision/jefe_cuerpo_activo) solo su propio cuartel.';
