-- SIGER4 - Politicas de Row Level Security
--
-- Reglas generales:
--  - informatica_r4 / integrante_informatica: acceso total (lectura y escritura).
--  - director_escuela / secretario_regional: lectura y escritura de todo lo que pertenezca a su(s) region(es).
--    director_escuela es ademas la maxima autoridad regional (no existe presidente_regional).
--  - director_escuela / instructor: lectura y escritura de cursos y datos de la Escuela Regional.
--  - roles de cuartel (presidente_cuartel, jefe_cuerpo_activo, usuario_carga_cuartel, secretario_comision,
--    administrativo): lectura/escritura limitada a su propio cuartel.
--  - invitado: solo lectura, alcance limitado a su cuartel si lo tiene asignado.
--
-- NOTA: estas policies son una base inicial. Antes de produccion, revisar caso por caso
-- que actividad_reciente/documentos sensibles no queden expuestos a roles de solo lectura.

alter table regions enable row level security;
alter table subsedes enable row level security;
alter table stations enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table user_scopes enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;
alter table attendance_summaries enable row level security;
alter table intervention_summaries enable row level security;
alter table courses enable row level security;
alter table course_stations enable row level security;
alter table vehicles enable row level security;
alter table documents enable row level security;

-- ---------------- regions ----------------

create policy "regions_select_authenticated" on regions
  for select using (auth.role() = 'authenticated');

create policy "regions_write_admin" on regions
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- subsedes ----------------

create policy "subsedes_select_authenticated" on subsedes
  for select using (auth.role() = 'authenticated');

create policy "subsedes_write_admin" on subsedes
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- stations ----------------

create policy "stations_select_scope" on stations
  for select using (
    is_informatica_r4()
    or is_regional_role() and region_id in (select my_region_ids())
    or id in (select my_station_ids())
    or subsede_id in (select my_subsede_ids())
    or has_role('invitado') and id in (select my_station_ids())
  );

create policy "stations_write_admin_regional" on stations
  for insert with check (is_informatica_r4() or is_regional_role());

create policy "stations_update_admin_regional_or_own" on stations
  for update using (
    is_informatica_r4()
    or (is_regional_role() and region_id in (select my_region_ids()))
    or (id in (select my_station_ids()) and (
      has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel')
    ))
  );

create policy "stations_delete_admin" on stations
  for delete using (is_informatica_r4());

-- ---------------- profiles ----------------

create policy "profiles_select_self" on profiles
  for select using (auth_user_id = auth.uid());

create policy "profiles_select_admin" on profiles
  for select using (is_informatica_r4());

create policy "profiles_select_regional" on profiles
  for select using (is_regional_role() and region_id in (select my_region_ids()));

create policy "profiles_select_station_scope" on profiles
  for select using (station_id in (select my_station_ids()));

create policy "profiles_select_subsede_scope" on profiles
  for select using (station_id in (select id from stations where subsede_id in (select my_subsede_ids())));

create policy "profiles_update_self" on profiles
  for update using (auth_user_id = auth.uid());

create policy "profiles_write_admin" on profiles
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- user_roles ----------------

create policy "user_roles_select_self" on user_roles
  for select using (profile_id = current_profile_id());

create policy "user_roles_select_admin" on user_roles
  for select using (is_informatica_r4());

create policy "user_roles_write_admin" on user_roles
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- user_scopes ----------------

create policy "user_scopes_select_self" on user_scopes
  for select using (profile_id = current_profile_id());

create policy "user_scopes_select_admin" on user_scopes
  for select using (is_informatica_r4());

create policy "user_scopes_write_admin" on user_scopes
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- audit_logs ----------------
-- Solo el Dpto. de Informatica y Estadistica puede leer la bitacora completa.
-- La escritura queda abierta a cualquier usuario autenticado porque el registro
-- se genera desde triggers y desde la propia app en nombre del usuario actual.

create policy "audit_logs_select_admin" on audit_logs
  for select using (is_informatica_r4());

create policy "audit_logs_select_regional" on audit_logs
  for select using (is_regional_role());

create policy "audit_logs_insert_authenticated" on audit_logs
  for insert with check (auth.role() = 'authenticated');

-- ---------------- notifications ----------------

create policy "notifications_select_own_or_scope" on notifications
  for select using (
    is_informatica_r4()
    or profile_id = current_profile_id()
    or (profile_id is null and region_id in (select my_region_ids()))
    or (profile_id is null and station_id in (select my_station_ids()))
  );

create policy "notifications_update_own" on notifications
  for update using (profile_id = current_profile_id() or is_informatica_r4());

create policy "notifications_write_admin_regional_escuela" on notifications
  for insert with check (is_informatica_r4() or is_regional_role() or is_escuela_role());

-- ---------------- attendance_summaries ----------------

create policy "attendance_select_scope" on attendance_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
  );

create policy "attendance_write_admin_regional_station" on attendance_summaries
  for insert with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "attendance_update_admin_regional_station" on attendance_summaries
  for update using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- intervention_summaries ----------------

create policy "interventions_select_scope" on intervention_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
  );

create policy "interventions_write_admin_regional_station" on intervention_summaries
  for insert with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "interventions_update_admin_regional_station" on intervention_summaries
  for update using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- courses (Escuela Regional) ----------------

create policy "courses_select_all_authenticated" on courses
  for select using (auth.role() = 'authenticated');

create policy "courses_write_admin_escuela" on courses
  for all using (is_informatica_r4() or is_escuela_role())
  with check (is_informatica_r4() or is_escuela_role());

-- ---------------- course_stations (cuarteles participantes) ----------------

create policy "course_stations_select_authenticated" on course_stations
  for select using (auth.role() = 'authenticated');

create policy "course_stations_write_admin_escuela" on course_stations
  for all using (is_informatica_r4() or is_escuela_role())
  with check (is_informatica_r4() or is_escuela_role());

-- ---------------- vehicles ----------------

create policy "vehicles_select_scope" on vehicles
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

create policy "vehicles_write_admin_regional_station" on vehicles
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

-- ---------------- documents ----------------

create policy "documents_select_scope" on documents
  for select using (
    is_informatica_r4()
    or (region_id is not null and region_id in (select my_region_ids()))
    or (station_id is not null and station_id in (select my_station_ids()))
  );

create policy "documents_write_admin_regional_station" on documents
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  );
