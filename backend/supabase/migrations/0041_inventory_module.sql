-- SIGER4 - Modulo de Inventario Regional
--
-- Elementos regionales disponibles para uso compartido entre cuarteles
-- (herramientas, equipos, elementos de practica). Visible para TODOS los
-- usuarios autenticados (necesitan saber que hay disponible para poder
-- solicitarlo); solo un conjunto acotado de roles regionales puede
-- crear/editar (confirmado explicitamente: informatica_r4,
-- integrante_informatica, director_escuela, secretario_regional — NO
-- jefes/presidentes/secretarios/personal de carga de cuartel).
--
-- Fase futura (documentado, no implementado en esta tanda): solicitudes de
-- prestamo, aprobacion y devolucion. Por ahora el modulo solo registra que
-- existe, donde esta, quien es responsable y el historial de esos cambios.

create type inventory_category as enum (
  'herramienta_manual',
  'mecanica',
  'equipo',
  'elementos_practica',
  'otros'
);

create type inventory_status as enum ('disponible', 'no_disponible', 'mantenimiento', 'baja');

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category inventory_category not null,
  category_other_label text,
  description text,
  status inventory_status not null default 'disponible',
  region_id uuid not null references regions(id) on delete restrict,
  subsede_id uuid references subsedes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  responsible_profile_id uuid references profiles(id) on delete set null,
  responsible_name text,
  contact_info text,
  observations text,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_category_other_label_required check (
    (category = 'otros' and category_other_label is not null and length(trim(category_other_label)) > 0)
    or (category <> 'otros')
  )
);

comment on table inventory_items is 'Inventario regional: elementos disponibles para uso compartido entre cuarteles (herramientas, equipos, elementos de practica). Visible para todo usuario autenticado; solo roles regionales pueden crear/editar.';
comment on column inventory_items.category_other_label is 'Texto libre cuando category=''otros''. Obligatorio en ese caso (ver constraint), ignorado para las demas categorias.';
comment on column inventory_items.responsible_profile_id is 'Perfil responsable actual, si es un usuario del sistema. responsible_name cubre el caso de un responsable que no tiene cuenta en SIGER4.';
comment on column inventory_items.station_id is 'Cuartel donde se encuentra fisicamente el elemento actualmente. Puede ser null si esta en una subsede/regional sin cuartel especifico.';

create index idx_inventory_items_station_id on inventory_items(station_id);
create index idx_inventory_items_region_id on inventory_items(region_id);
create index idx_inventory_items_status on inventory_items(status);

create trigger trg_inventory_items_updated_at
  before update on inventory_items
  for each row execute function set_updated_at();

-- ============================================================
-- Historial de ubicacion/responsable/estado
-- ============================================================

create table inventory_item_history (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  previous_station_id uuid references stations(id) on delete set null,
  new_station_id uuid references stations(id) on delete set null,
  previous_responsible_name text,
  new_responsible_name text,
  previous_status inventory_status,
  new_status inventory_status,
  note text,
  changed_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table inventory_item_history is 'Historial de cambios de ubicacion, responsable o estado de un elemento del inventario regional. Se llena automaticamente via trigger cada vez que cambia alguno de esos 3 campos.';

create index idx_inventory_item_history_item_id on inventory_item_history(inventory_item_id, created_at desc);

create or replace function log_inventory_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.station_id is distinct from new.station_id)
     or (old.responsible_name is distinct from new.responsible_name)
     or (old.responsible_profile_id is distinct from new.responsible_profile_id)
     or (old.status is distinct from new.status) then
    insert into inventory_item_history (
      inventory_item_id, previous_station_id, new_station_id,
      previous_responsible_name, new_responsible_name,
      previous_status, new_status, changed_by_profile_id
    )
    values (
      new.id, old.station_id, new.station_id,
      old.responsible_name, new.responsible_name,
      old.status, new.status, current_profile_id()
    );
  end if;
  return new;
end;
$$;

comment on function log_inventory_item_change() is 'Registra en inventory_item_history cuando cambia station_id, responsable o status de un elemento del inventario regional.';

create trigger trg_log_inventory_item_change
  after update on inventory_items
  for each row execute function log_inventory_item_change();

revoke all on function log_inventory_item_change() from public;

-- ============================================================
-- RLS
-- ============================================================

alter table inventory_items enable row level security;
alter table inventory_item_history enable row level security;

-- Lectura: TODO usuario autenticado (necesitan saber que hay disponible en
-- toda la regional para poder solicitarlo, no solo lo de su cuartel).
create policy "inventory_items_select_authenticated" on inventory_items
  for select using (auth.role() = 'authenticated');

-- Escritura: solo informatica_r4/integrante_informatica/director_escuela/
-- secretario_regional (confirmado explicitamente, sin roles de cuartel).
create policy "inventory_items_write_regional" on inventory_items
  for all using (
    is_informatica_r4() or has_role('director_escuela') or has_role('secretario_regional')
  )
  with check (
    is_informatica_r4() or has_role('director_escuela') or has_role('secretario_regional')
  );

create policy "inventory_item_history_select_authenticated" on inventory_item_history
  for select using (auth.role() = 'authenticated');

-- Sin policy de insert/update/delete para authenticated en el historial:
-- solo lo llena el trigger (SECURITY DEFINER, bypasea RLS).

-- ============================================================
-- Auditoria
-- ============================================================
-- Se extiende audit_row_change() para resolver el contexto territorial de
-- inventory_items (via subsede/station si estan, si no via region_id
-- directo).

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

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla.';

create trigger trg_audit_inventory_items
  after insert or update or delete on inventory_items
  for each row execute function audit_row_change();
