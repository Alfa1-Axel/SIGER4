-- SIGER4 - Historial Institucional del Cuartel
--
-- Nuevo modulo (ciclo funcional 2026-08): registro manual de hechos
-- relevantes de la historia institucional de un cuartel — cambios de
-- autoridades, incorporacion/baja importante de moviles, reformas
-- edilicias, hechos destacados, capacitaciones relevantes, aniversarios,
-- reconocimientos, decisiones institucionales.
--
-- Diferencia clave con audit_logs (bitacora tecnica, ver 0004/0014):
-- audit_logs registra automaticamente CADA insert/update/delete de las
-- tablas auditadas (quien, cuando, que cambio exactamente a nivel de
-- columnas) — es tecnico, exhaustivo, y pensado para trazabilidad/soporte.
-- station_history_events es HISTORIA LEGIBLE cargada a mano por un humano:
-- un puñado de hechos realmente relevantes por año, con titulo, fecha,
-- categoria y descripcion en lenguaje institucional, pensada para leerse
-- como una cronologia del cuartel, no para auditar cambios de datos. No
-- reemplaza ni se alimenta de audit_logs; son dos sistemas independientes
-- que conviven (station_history_events SI tiene su propio trigger de
-- auditoria tecnica, igual que cualquier otra tabla del sistema — un alta/
-- edicion/borrado de un evento historico tambien queda en audit_logs, pero
-- eso es "quien tocó esta tabla", no el contenido de la cronologia en si).

create type station_history_category as enum (
  'institucional',
  'operativo',
  'personal',
  'vehiculos',
  'infraestructura',
  'capacitacion',
  'documentacion',
  'autoridad',
  'otro'
);

create table station_history_events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  title text not null,
  description text,
  event_date date not null,
  category station_history_category not null default 'institucional',
  is_highlighted boolean not null default false,
  -- Preparado para adjuntos a futuro (ej. foto del hecho, acta escaneada):
  -- se deja la columna lista desde ya para no requerir otra migracion de
  -- schema cuando se implemente, pero no hay UI ni Storage bucket propio
  -- todavia — attachments queda null hasta esa fase futura.
  attachments jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table station_history_events is 'Historia institucional legible de un cuartel (hechos destacados, cambios de autoridades, hitos, reconocimientos), cargada manualmente. NO es auditoria tecnica — ver audit_logs para eso. Cada alta/edicion/borrado de un evento SI queda auditado tecnicamente en audit_logs via el trigger generico (quien tocó la tabla), igual que cualquier otra tabla del sistema.';
comment on column station_history_events.attachments is 'Preparado para una fase futura de adjuntos (fotos, actas escaneadas). Sin UI ni bucket de Storage propio todavia — queda null.';

create index idx_station_history_events_station_id on station_history_events(station_id, event_date desc);
create index idx_station_history_events_category on station_history_events(station_id, category);

create trigger trg_station_history_events_updated_at
  before update on station_history_events
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
-- Mismo criterio de lectura que el resto de los directorios institucionales
-- del sistema (documents, courses, inventory_items): cualquier usuario
-- autenticado puede leer, incluido invitado (sin necesidad de una policy
-- distinta para "solo lectura" — invitado nunca matchea la policy de
-- escritura de abajo, así que ya queda de solo lectura por construcción).
--
-- Escritura: mismo patron territorial que documents_write_admin_regional_station
-- (0047, post-0048): informatica_r4 cualquier alcance; secretario_regional
-- dentro de su propia region; roles de cuartel autorizados (usuario_carga_cuartel,
-- presidente_cuartel, secretario_comision, jefe_cuerpo_activo) solo su propio
-- cuartel. director_escuela NO tiene escritura aca a proposito (post-0048:
-- su autoridad es exclusivamente Escuela Regional, no operatoria de
-- cuarteles) — la matriz institucional de esta tanda no pidió excepcion
-- para este modulo.

alter table station_history_events enable row level security;

create policy "station_history_events_select_authenticated" on station_history_events
  for select using (auth.role() = 'authenticated');

create policy "station_history_events_write_admin_regional_station" on station_history_events
  for all using (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

comment on policy "station_history_events_write_admin_regional_station" on station_history_events is 'informatica_r4 cualquier alcance; secretario_regional dentro de su region; roles de cuartel autorizados (usuario_carga_cuartel/presidente_cuartel/secretario_comision/jefe_cuerpo_activo) solo su propio cuartel. director_escuela sin escritura aca a proposito (post-0048).';

-- ============================================================
-- Auditoria tecnica (igual que el resto de las tablas del sistema)
-- ============================================================

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
  rec record;
begin
  actor := current_profile_id();
  rec := coalesce(new, old);

  case tg_table_name
    when 'stations' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.id;
    when 'subsedes' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.id;
    when 'profiles' then
      v_region_id := rec.region_id;
      v_station_id := rec.station_id;
      select subsede_id into v_subsede_id from stations where id = rec.station_id;
    when 'vehicles', 'personnel' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'courses' then
      v_region_id := rec.region_id;
    when 'documents' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
      if v_subsede_id is null and v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'user_roles', 'user_scopes' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'notifications' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
    when 'attendance_summaries', 'intervention_summaries' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'push_subscriptions' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'inventory_items' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
    when 'station_history_events' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    else
      v_region_id := null;
      v_subsede_id := null;
      v_station_id := null;
  end case;

  if (tg_op = 'INSERT') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'insert', tg_table_name, new.id::text, null, to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'delete', tg_table_name, old.id::text, to_jsonb(old), null, v_region_id, v_subsede_id, v_station_id);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. station_history_events (0050) resuelve su territorio igual que vehicles/personnel: via su station_id propio.';

create trigger trg_audit_station_history_events
  after insert or update or delete on station_history_events
  for each row execute function audit_row_change();
