-- SIGER4 - Datos de ejemplo (opcional)
-- Ejecutar despues de las migraciones si querés ver el dashboard con datos de prueba.
-- No ejecutar en producción con datos reales sin revisar antes.

do $$
declare
  v_region_id uuid;
  v_station_id uuid;
begin
  select id into v_region_id from regions where code = 'R4';

  insert into stations (region_id, name, code, address, zone, status, response_time_minutes, personnel_count, vehicles_count, founded_year)
  values
    (v_region_id, 'Cuartel Central N°1', 'CC1', 'Av. Libertad 450', 'Zona Norte', 'operativo', 12, 42, 8, 1924),
    (v_region_id, 'Destacamento Sur', 'DS1', 'Calle 14 y 52', 'Zona Sur', 'mantenimiento', 15, 18, 3, 1958),
    (v_region_id, 'Cuartel Industrial', 'CI1', 'Parque Industrial Lote 12', 'Zona Este', 'operativo', 8, 25, 5, 1975)
  on conflict (region_id, code) do nothing;

  select id into v_station_id from stations where code = 'CC1' and region_id = v_region_id;

  insert into vehicles (station_id, internal_code, vehicle_type, status, plate)
  values
    (v_station_id, 'M-12', 'Autobomba', 'operativo', 'AB123CD'),
    (v_station_id, 'M-14', 'Rescate pesado', 'operativo', 'AB456EF')
  on conflict (station_id, internal_code) do nothing;

  insert into attendance_summaries (station_id, period_start, period_end, attendance_rate, total_members, present_average)
  values (v_station_id, date_trunc('month', now())::date, now()::date, 88.5, 42, 37.2);

  insert into intervention_summaries (station_id, period_start, period_end, category, total_count)
  values (v_station_id, date_trunc('month', now())::date, now()::date, 'incendio_estructural', 3);

  insert into courses (region_id, title, category, status, start_date, end_date, progress_percent, enrolled_count)
  values
    (v_region_id, 'Rescate en Estructuras Colapsadas', 'Táctica y Rescate', 'en_curso', now()::date, now()::date + 30, 65, 24),
    (v_region_id, 'Soporte Vital Avanzado (SVA)', 'Sanidad y Emergencias', 'planificado', now()::date + 10, now()::date + 40, 30, 18);
end $$;
