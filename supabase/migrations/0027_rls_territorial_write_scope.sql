-- SIGER4 - RLS: escritura de roles regionales debe respetar su propia region
--
-- Problema (ver auditoria de seguridad): varias policies de escritura usaban
-- is_regional_role() "pelado" (secretario_regional / director_escuela) sin
-- validar que el registro tocado perteneciera a alguna de las regiones que
-- ese usuario efectivamente administra (my_region_ids()). En un sistema
-- multi-regional (el diseño ya lo prepara, aunque hoy solo exista Regional 4)
-- eso significa que un secretario_regional de la Region X podria insertar o
-- editar cuarteles, asistencias, intervenciones, vehiculos, personal o
-- documentos de la Region Y.
--
-- stations_update_admin_regional_or_own YA validaba correctamente
-- (region_id in (select my_region_ids())) desde el inicio; se usa como
-- referencia para el resto de las policies de esta migracion.
--
-- Se recrean (drop + create) las policies afectadas agregando el filtro de
-- region_id/estacion-en-mi-region que faltaba. No se toca la logica de
-- roles de cuartel (usuario_carga_cuartel/jefe_cuerpo_activo/presidente_cuartel),
-- que ya estaba correctamente acotada a my_station_ids().

-- ---------------- stations: alta ----------------
-- stations no tiene "id" propio todavia al insertar (se genera en el
-- insert), asi que el check debe ir contra new.region_id directamente.

drop policy if exists "stations_write_admin_regional" on stations;

create policy "stations_write_admin_regional" on stations
  for insert with check (
    is_informatica_r4()
    or (is_regional_role() and region_id in (select my_region_ids()))
  );

-- ---------------- attendance_summaries ----------------

drop policy if exists "attendance_write_admin_regional_station" on attendance_summaries;

create policy "attendance_write_admin_regional_station" on attendance_summaries
  for insert with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

drop policy if exists "attendance_update_admin_regional_station" on attendance_summaries;

create policy "attendance_update_admin_regional_station" on attendance_summaries
  for update using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- intervention_summaries ----------------

drop policy if exists "interventions_write_admin_regional_station" on intervention_summaries;

create policy "interventions_write_admin_regional_station" on intervention_summaries
  for insert with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

drop policy if exists "interventions_update_admin_regional_station" on intervention_summaries;

create policy "interventions_update_admin_regional_station" on intervention_summaries
  for update using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- vehicles ----------------

drop policy if exists "vehicles_write_admin_regional_station" on vehicles;

create policy "vehicles_write_admin_regional_station" on vehicles
  for all using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- personnel ----------------

drop policy if exists "personnel_write_admin_regional_station" on personnel;

create policy "personnel_write_admin_regional_station" on personnel
  for all using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- documents ----------------
-- documents puede tener alcance region_id, subsede_id, station_id o
-- profile_id (nunca varios a la vez en la practica, ver 0028 para el
-- constraint que lo exige). El check regional debe cubrir los 3 alcances
-- territoriales posibles, no solo station_id.

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
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
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
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  );

-- ---------------- document_versions ----------------

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
          has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
        ))
      )
    )
  );

-- ---------------- courses / course_stations (Escuela Regional) ----------------
-- is_escuela_role() (director_escuela/instructor) sigue sin filtrar por
-- region a proposito: la Escuela Regional es un organo unico de toda la
-- Regional 4 (no hay una escuela por region todavia), y el propio courses.region_id
-- se completa desde el formulario -- pero se agrega informatica_r4 explicito
-- y se deja documentado el criterio para no repetir la duda en el futuro.
-- Si el sistema pasa a ser multi-regional con una escuela por region, esta
-- policy es la que hay que acotar con region_id in (select my_region_ids()).

comment on policy "courses_write_admin_escuela" on courses is 'director_escuela/instructor administran cursos de TODA la Escuela Regional (organo unico, no por region) sin filtro de region_id. Revisar si el sistema pasa a tener una escuela por region en el futuro.';
