-- SIGER4 - Separar la autoridad de director_escuela de secretario_regional
--
-- Problema (matriz institucional revisada con el usuario): is_regional_role()
-- agrupaba 'secretario_regional' y 'director_escuela' como si fueran la misma
-- autoridad "regional operativa" (0002_rls_helpers.sql / 0008_role_key_simplify.sql).
-- Eso le daba a director_escuela escritura regional-wide sobre stations,
-- vehicles, personnel, attendance_summaries, intervention_summaries,
-- documents/document_versions/document_folders, profiles (select regional),
-- audit_logs (select regional), vehicle_status_history/personnel_status_history
-- y los buckets de storage asociados, cuando su autoridad real institucional
-- es sobre la Escuela Regional (cursos, capacitaciones, instructores,
-- reportes de Escuela), no sobre la operatoria de los cuarteles.
--
-- Fix: is_regional_role() pasa a significar SOLO 'secretario_regional'. Como
-- es una funcion SECURITY DEFINER referenciada por nombre (no inline) desde
-- todas las policies de RLS y desde can_send_push_scope(), redefinirla aca
-- corrige automaticamente el comportamiento de TODAS esas policies sin tener
-- que editar cada migracion historica una por una (create or replace
-- function tiene efecto inmediato sobre quien la llama).
--
-- is_escuela_role() (director_escuela + instructor) no se toca: ya es, desde
-- 0002, la autoridad correcta para courses/course_stations, y pasa a ser la
-- UNICA autoridad de director_escuela en todo el sistema. Las policies de
-- notifications_write_admin_regional_escuela y can_send_push_scope() ya
-- incluian "or is_escuela_role()" ademas de is_regional_role(), asi que
-- director_escuela conserva ahi su capacidad de enviar notificaciones/push
-- (necesaria para avisos de cursos/capacitaciones) sin cambios.
--
-- Lectura regional que director_escuela SI conserva (matriz: "puede ver
-- informacion regional necesaria para Escuela/reportes"): profiles_select_regional
-- pasa a filtrarse por is_regional_role() OR is_escuela_role(), igual que
-- audit_logs_select_regional, attendance_select_scope e
-- interventions_select_scope (lectura, no escritura -- necesita ver
-- asistencia/intervenciones de los cuarteles para armar reportes de Escuela,
-- pero no puede cargarlas ni editarlas).
--
-- stations_select_scope tambien se ajusta de la misma forma: director_escuela
-- necesita ver los cuarteles de la region para elegir participantes de cursos
-- (course_stations), pero stations_write_admin_regional/
-- stations_update_admin_regional_or_own NO se tocan (siguen en
-- is_regional_role(), ahora solo secretario_regional): director_escuela ya no
-- puede crear ni editar cuarteles.

create or replace function is_regional_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and ur.role = 'secretario_regional'
  );
$$;

comment on function is_regional_role() is 'Devuelve true solo para secretario_regional. director_escuela dejo de compartir esta funcion (ver 0048): su autoridad operativa es exclusivamente is_escuela_role() (Escuela Regional, cursos, capacitaciones, instructores). Las tablas operativas de cuarteles (stations, vehicles, personnel, attendance_summaries, intervention_summaries, documents, etc.) ya no le dan escritura regional-wide a director_escuela como efecto de este cambio.';

-- ============================================================
-- Lectura regional ampliada a is_escuela_role() donde la matriz lo requiere
-- ============================================================
-- director_escuela sigue necesitando VER (no escribir) cuarteles, perfiles,
-- asistencia, intervenciones y auditoria de su region para poder armar
-- reportes de Escuela y elegir cuarteles participantes de cursos.

drop policy if exists "stations_select_scope" on stations;

create policy "stations_select_scope" on stations
  for select using (
    is_informatica_r4()
    or (is_regional_role() or is_escuela_role()) and region_id in (select my_region_ids())
    or id in (select my_station_ids())
    or subsede_id in (select my_subsede_ids())
    or has_role('invitado') and id in (select my_station_ids())
  );

drop policy if exists "profiles_select_regional" on profiles;

create policy "profiles_select_regional" on profiles
  for select using ((is_regional_role() or is_escuela_role()) and region_id in (select my_region_ids()));

drop policy if exists "audit_logs_select_regional" on audit_logs;

create policy "audit_logs_select_regional" on audit_logs
  for select using (
    (is_regional_role() or is_escuela_role())
    and (region_id is null or region_id in (select my_region_ids()))
  );

drop policy if exists "attendance_select_scope" on attendance_summaries;

create policy "attendance_select_scope" on attendance_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or ((is_regional_role() or is_escuela_role()) and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

drop policy if exists "interventions_select_scope" on intervention_summaries;

create policy "interventions_select_scope" on intervention_summaries
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or ((is_regional_role() or is_escuela_role()) and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- ============================================================
-- Fix de policies "peladas" (sin scope regional) detectadas en la auditoria
-- ============================================================
-- Estas nunca filtraban por region (cualquier is_regional_role() pasaba
-- cualquier cuartel/objeto). Ya iban a quedar mejor solo por el efecto de
-- redefinir is_regional_role() a secretario_regional (reduce quien matchea),
-- pero se scopean ahora tambien por consistencia con el resto de las
-- policies de escritura territorial (mismo criterio que 0027).

drop policy if exists "station_media_write_admin_regional_station" on storage.objects;

create policy "station_media_write_admin_regional_station" on storage.objects
  for insert with check (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or (is_regional_role() and (storage.foldername(name))[1]::uuid in (select id from stations where region_id in (select my_region_ids())))
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

drop policy if exists "station_media_update_admin_regional_station" on storage.objects;

create policy "station_media_update_admin_regional_station" on storage.objects
  for update using (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or (is_regional_role() and (storage.foldername(name))[1]::uuid in (select id from stations where region_id in (select my_region_ids())))
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

drop policy if exists "station_media_delete_admin_regional_station" on storage.objects;

create policy "station_media_delete_admin_regional_station" on storage.objects
  for delete using (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or (is_regional_role() and (storage.foldername(name))[1]::uuid in (select id from stations where region_id in (select my_region_ids())))
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

drop policy if exists "documents_storage_write_admin_regional_station" on storage.objects;

create policy "documents_storage_write_admin_regional_station" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from documents d
      where d.id::text = (storage.foldername(name))[1]
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

-- documents_storage_delete_admin_regional_station tenia el bug mas grave:
-- is_regional_role() estaba OR'd por fuera del exists(), o sea que cualquier
-- rol regional podia borrar CUALQUIER objeto del bucket "documents" sin que
-- el path resolviera siquiera a una fila real de documents. Se corrige
-- moviendo la condicion de rol regional adentro del exists(), scopeada por
-- region igual que el resto.

drop policy if exists "documents_storage_delete_admin_regional_station" on storage.objects;

create policy "documents_storage_delete_admin_regional_station" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      is_informatica_r4()
      or exists (
        select 1 from documents d
        where d.id::text = (storage.foldername(name))[1]
        and (
          (is_regional_role() and (
            (d.region_id is not null and d.region_id in (select my_region_ids()))
            or (d.subsede_id is not null and d.subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
            or (d.station_id is not null and d.station_id in (select id from stations where region_id in (select my_region_ids())))
          ))
          or (d.station_id in (select my_station_ids()) and (
            has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
          ))
        )
      )
    )
  );

comment on policy "documents_storage_delete_admin_regional_station" on storage.objects is 'Corrige gap de 0019: antes is_regional_role() estaba fuera del exists(), permitiendo borrar cualquier objeto del bucket sin resolver a un documento real. Ahora exige que el path resuelva a una fila de documents y que esa fila este dentro del alcance regional/de cuartel del actor.';
