-- SIGER4 - Datos de ejemplo para demo institucional (OPCIONAL)
--
-- ============================================================================
-- NO SE EJECUTA AUTOMÁTICAMENTE. Correlo a mano en el SQL Editor de Supabase
-- solo si querés ver una demo con datos de ejemplo cargados, o probar el
-- sistema con un cuartel completo antes de empezar la carga real.
-- NO EJECUTAR en un proyecto con datos institucionales reales sin revisar
-- antes qué vas a insertar — ver la Sección 0 (verificación) más abajo.
-- ============================================================================
--
-- Qué hace: crea UN cuartel de ejemplo completo dentro de la Regional 4 real
-- (region code='R4', ya insertada por las migraciones) — con vehículos,
-- personal, asistencia/intervenciones, historial institucional, eventos de
-- calendario, un departamento regional con un informe de actividad, y un
-- ítem de inventario regional. Todo con nombres claramente ficticios
-- ("Cuartel Demo — Datos de Ejemplo") para que nunca se confunda con un
-- cuartel real ya cargado.
--
-- Qué NO hace (a propósito):
--   - NO toca profiles/auth.users/user_roles/user_scopes: nunca crea, edita
--     ni borra ningún usuario real. Los "creado por"/"responsable" quedan
--     en null (permitido en todas las tablas relevantes) — un dato de
--     demo no necesita atribuirse a ningún usuario real.
--   - NO carga ningún documento real: `documents` requiere un archivo real
--     en Supabase Storage (storage_path), que este script no puede generar
--     -- cargá un documento de ejemplo a mano desde la propia app
--     (Documentos → Cargar archivo) si lo necesitás para la demo.
--   - NO configura system_settings, notificaciones push, ni ningún dato de
--     infraestructura — ver DEPLOYMENT.md sección "Datos mínimos iniciales"
--     para eso.
--   - Es enteramente ADITIVO: nunca hace DELETE ni UPDATE de datos
--     existentes. Correrlo dos veces no duplica nada (todo va con
--     "on conflict do nothing" o una verificación previa de existencia)
--     salvo notificaciones/auditoría, que se generan solas por los
--     triggers ya existentes del sistema (comportamiento normal, no un
--     efecto de este script).
--
-- Limpieza: para sacar SOLO estos datos de ejemplo (no cualquier otro dato
-- de prueba que hayas cargado a mano), ver la Sección 2 al final de este
-- archivo — borra por nombre exacto del cuartel demo, no por fecha ni por
-- "todo lo que no sea real" (para eso existe supabase/cleanup_test_data.sql,
-- que es más general y requiere revisión manual antes de correrlo).

-- ============================================================================
-- SECCIÓN 0 — Verificación previa (correr primero, confirmar antes de seguir)
-- ============================================================================
-- select code, name from regions;                          -- debe existir 'R4'
-- select code, name from subsedes where region_id = (select id from regions where code = 'R4');  -- LV/LQ/RP
-- select id, name, code from stations where code = 'DEMO1'; -- debe devolver 0 filas (primera vez)

-- ============================================================================
-- SECCIÓN 1 — Carga del cuartel demo completo
-- ============================================================================

do $$
declare
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
  v_department_id uuid;
begin
  select id into v_region_id from regions where code = 'R4';
  if v_region_id is null then
    raise exception 'No se encontró la región R4 -- ¿corriste las migraciones base (0001+)?';
  end if;

  select id into v_subsede_id from subsedes where region_id = v_region_id and code = 'LV';

  -- ---------------- Cuartel ----------------
  insert into stations (
    region_id, subsede_id, name, code, address, zone, phone, email, status,
    response_time_minutes, personnel_count, vehicles_count, founded_year
  )
  values (
    v_region_id, v_subsede_id, 'Cuartel Demo — Datos de Ejemplo', 'DEMO1',
    'Dirección de ejemplo 123', 'Zona Demo', '0351 4000000', 'demo@ejemplo.siger4.local',
    'operativo', 10, 0, 0, 2000
  )
  on conflict (region_id, code) do nothing;

  select id into v_station_id from stations where region_id = v_region_id and code = 'DEMO1';

  -- ---------------- Vehículos (vehicle_type usa las opciones reales del
  -- combo de VehiculoFormPage.tsx, para que la demo se vea consistente con
  -- lo que un usuario real elegiría) ----------------
  insert into vehicles (station_id, internal_code, vehicle_type, status, plate, water_capacity_liters, crew_capacity)
  select v_station_id, code, vtype, 'operativo', plate, liters, crew
  from (
    values
      ('DEMO-M1', 'Autobomba Mediana > a 1500 hasta 3000 lts', 'AB123DM', 2500, 6),
      ('DEMO-M2', 'Ataque rápido', 'AB456DM', 800, 3)
  ) as v(code, vtype, plate, liters, crew)
  where not exists (select 1 from vehicles where station_id = v_station_id and internal_code = v.code);

  -- ---------------- Personal ----------------
  insert into personnel (station_id, first_name, last_name, rank, role_function, status, department, join_date)
  select v_station_id, first_name, last_name, rank, role_function, 'activo', department, join_date
  from (
    values
      ('Juan', 'Pérez (demo)', 'Bombero', 'Conductor', 'Cuerpo Activo', current_date - interval '5 years'),
      ('María', 'Gómez (demo)', 'Oficial', 'Jefa de Guardia', 'Cuerpo Activo', current_date - interval '8 years')
  ) as p(first_name, last_name, rank, role_function, department, join_date)
  where not exists (
    select 1 from personnel where station_id = v_station_id and first_name = p.first_name and last_name = p.last_name
  );

  -- Recalcular los contadores desnormalizados (mismo criterio que ya usa el
  -- resto del sistema — ver 0013/0021 — nunca se cargan a mano).
  update stations set
    personnel_count = (select count(*) from personnel where station_id = v_station_id and status = 'activo'),
    vehicles_count = (select count(*) from vehicles where station_id = v_station_id and status not in ('vendido', 'transferido', 'baja'))
  where id = v_station_id;

  -- ---------------- Asistencia / Intervenciones (del último mes) ----------------
  if not exists (select 1 from attendance_summaries where station_id = v_station_id) then
    insert into attendance_summaries (station_id, period_start, period_end, attendance_rate, total_members, present_average)
    values (v_station_id, date_trunc('month', now())::date, now()::date, 82.0, 2, 1.6);
  end if;

  if not exists (select 1 from intervention_summaries where station_id = v_station_id) then
    insert into intervention_summaries (station_id, period_start, period_end, category, total_count, time_of_day, personnel_count, vehicles_count, work_hours)
    values (v_station_id, date_trunc('month', now())::date, now()::date, 'incendio_estructural', 2, 'diurno', 4, 1, 6.5);
  end if;

  -- ---------------- Historial Institucional ----------------
  insert into station_history_events (station_id, title, description, event_date, category, is_highlighted)
  select v_station_id, title, description, event_date, category::station_history_category, highlighted
  from (
    values
      ('Fundación del cuartel (demo)', 'Evento de ejemplo para la demo institucional.', current_date - interval '20 years', 'institucional', true),
      ('Incorporación de nueva autobomba (demo)', 'Evento de ejemplo.', current_date - interval '2 years', 'vehiculos', false)
  ) as h(title, description, event_date, category, highlighted)
  where not exists (select 1 from station_history_events where station_id = v_station_id and title = h.title);

  -- ---------------- Calendario (evento próximo, tipo cuartel) ----------------
  if not exists (select 1 from calendar_events where station_id = v_station_id and title = 'Reunión de comisión (demo)') then
    insert into calendar_events (title, description, event_type, starts_at, all_day, station_id, status)
    values ('Reunión de comisión (demo)', 'Evento de ejemplo para la demo.', 'reunion', now() + interval '3 days', false, v_station_id, 'programado');
  end if;

  -- ---------------- Departamento regional + informe de actividad ----------------
  select id into v_department_id from departments where name = 'Departamento Demo — Datos de Ejemplo';
  if v_department_id is null then
    insert into departments (name, description, contact_info, is_active)
    values ('Departamento Demo — Datos de Ejemplo', 'Departamento de ejemplo para la demo institucional.', 'demo@ejemplo.siger4.local', true)
    returning id into v_department_id;
  end if;

  if v_department_id is not null and not exists (select 1 from department_activity_reports where department_id = v_department_id) then
    insert into department_activity_reports (department_id, title, description, activity_date, activity_type, station_id, attendees_count, hours_worked)
    values (v_department_id, 'Reunión mensual (demo)', 'Informe de actividad de ejemplo.', current_date - interval '5 days', 'reunion', v_station_id, 8, 2.5);
  end if;

  -- ---------------- Inventario Regional ----------------
  insert into inventory_items (name, category, description, status, region_id, station_id, responsible_name, contact_info)
  select 'Motosierra (demo)', 'herramienta_manual', 'Elemento de ejemplo para la demo institucional.', 'disponible', v_region_id, v_station_id, 'Responsable de ejemplo', 'demo@ejemplo.siger4.local'
  where not exists (select 1 from inventory_items where name = 'Motosierra (demo)' and region_id = v_region_id);

  raise notice 'Datos de ejemplo cargados en el cuartel "Cuartel Demo — Datos de Ejemplo" (código DEMO1).';
end $$;

-- ============================================================================
-- SECCIÓN 2 — Limpieza (correr a mano cuando termine la demo, opcional)
-- ============================================================================
-- Borra ÚNICAMENTE lo que este script insertó (identificado por el cuartel
-- "DEMO1" y el departamento "Departamento Demo — Datos de Ejemplo"), nunca
-- otros datos. Comentado a propósito -- descomentar y correr manualmente.
--
-- do $$
-- declare
--   v_station_id uuid;
--   v_department_id uuid;
-- begin
--   select id into v_station_id from stations where code = 'DEMO1';
--   select id into v_department_id from departments where name = 'Departamento Demo — Datos de Ejemplo';
--
--   if v_department_id is not null then
--     delete from department_activity_reports where department_id = v_department_id;
--     delete from departments where id = v_department_id;
--   end if;
--
--   if v_station_id is not null then
--     delete from inventory_items where station_id = v_station_id and name = 'Motosierra (demo)';
--     delete from calendar_events where station_id = v_station_id;
--     delete from station_history_events where station_id = v_station_id;
--     delete from intervention_summaries where station_id = v_station_id;
--     delete from attendance_summaries where station_id = v_station_id;
--     delete from personnel where station_id = v_station_id;
--     delete from vehicles where station_id = v_station_id;
--     delete from stations where id = v_station_id;  -- borra el cuartel al final, por las FK
--   end if;
--
--   raise notice 'Datos de ejemplo eliminados.';
-- end $$;
