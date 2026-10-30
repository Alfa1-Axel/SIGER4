-- SIGER4 - Solicitudes de prestamo del Inventario Regional
--
-- Fase futura documentada explicitamente en 0041_inventory_module.sql: los
-- cuarteles pueden solicitar elementos del inventario regional compartido,
-- el responsable del elemento (o un rol regional) aprueba/rechaza, y se
-- registra retiro/devolucion con su propio estado de conservacion. Ciclo de
-- vida de una solicitud, en el orden esperado:
--
--   pendiente -> aprobada -> retirada -> devuelta
--            \-> rechazada
--   pendiente|aprobada -> cancelada (el propio solicitante se arrepiente,
--                          o el responsable cancela algo ya aprobado antes
--                          de que se retire)
--
-- Ningun estado se salta desde el frontend (la RLS de abajo no lo impide a
-- nivel de base, pero la UI solo ofrece las transiciones validas segun el
-- estado actual) y ninguna solicitud se borra nunca (requisito explicito:
-- "no borrar solicitudes historicas") — no hay policy de delete para
-- ningun rol no-admin, y ni siquiera se expone un boton de borrar en la UI.

create type loan_request_status as enum (
  'pendiente',
  'aprobada',
  'rechazada',
  'retirada',
  'devuelta',
  'cancelada'
);

create table inventory_loan_requests (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  requesting_station_id uuid not null references stations(id) on delete restrict,
  requested_by_profile_id uuid not null references profiles(id) on delete restrict,
  -- Responsable puntual de ESTA solicitud, si se quiere fijar uno distinto
  -- del responsable general del elemento (inventory_items.responsible_profile_id).
  -- Opcional: si es null, quien aprueba/gestiona es el responsable del
  -- elemento (o un rol regional) — ver policies mas abajo.
  responsible_profile_id uuid references profiles(id) on delete set null,
  status loan_request_status not null default 'pendiente',
  request_reason text,
  requested_from timestamptz not null default now(),
  expected_return_at timestamptz,
  approved_by_profile_id uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by_profile_id uuid references profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  delivered_at timestamptz,
  delivered_by_profile_id uuid references profiles(id) on delete set null,
  returned_at timestamptz,
  returned_by_profile_id uuid references profiles(id) on delete set null,
  delivery_condition text,
  return_condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table inventory_loan_requests is 'Solicitudes de prestamo de elementos del Inventario Regional: un cuartel solicita, el responsable del elemento (o un rol regional) aprueba/rechaza, y se registra retiro y devolucion. Nunca se borra una solicitud, queda como historial permanente.';
comment on column inventory_loan_requests.responsible_profile_id is 'Responsable puntual de esta solicitud si se asigna uno distinto al responsable general del elemento (inventory_items.responsible_profile_id) — opcional.';
comment on column inventory_loan_requests.requested_from is 'Fecha/hora desde la que se solicita el elemento (puede ser futura, ej. "lo necesito a partir del sabado"). Default now() para el caso comun de "lo necesito ya".';
comment on column inventory_loan_requests.delivery_condition is 'Estado de conservacion del elemento registrado al momento del retiro (texto libre, ej. "buen estado", "con un rayón en la carcasa").';
comment on column inventory_loan_requests.return_condition is 'Estado de conservacion del elemento registrado al momento de la devolucion.';

create index idx_inventory_loan_requests_item_id on inventory_loan_requests(inventory_item_id);
create index idx_inventory_loan_requests_station_id on inventory_loan_requests(requesting_station_id);
create index idx_inventory_loan_requests_status on inventory_loan_requests(status);
create index idx_inventory_loan_requests_requested_by on inventory_loan_requests(requested_by_profile_id);

create trigger trg_inventory_loan_requests_updated_at
  before update on inventory_loan_requests
  for each row execute function set_updated_at();

-- No se puede solicitar un elemento dado de baja, y solo se puede crear una
-- solicitud NUEVA (insert) sobre un elemento 'disponible' -- si esta
-- 'no_disponible' o 'mantenimiento' se sigue mostrando en el catalogo (ver
-- RLS de select en inventory_items, sin cambios) pero el insert queda
-- bloqueado por este trigger. No se revalida en updates (aprobar/rechazar/
-- retirar/devolver una solicitud ya existente no depende del estado actual
-- del item, que pudo cambiar despues de creada la solicitud).
create or replace function validate_inventory_loan_request_item_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_status inventory_status;
begin
  select status into v_item_status from inventory_items where id = new.inventory_item_id;

  if v_item_status = 'baja' then
    raise exception 'No se puede solicitar un elemento dado de baja.';
  end if;
  if v_item_status in ('no_disponible', 'mantenimiento') then
    raise exception 'El elemento no esta disponible para solicitar en este momento.';
  end if;

  return new;
end;
$$;

comment on function validate_inventory_loan_request_item_status() is 'Bloquea crear una solicitud de prestamo sobre un elemento de baja/no_disponible/mantenimiento -- el elemento sigue siendo visible en el catalogo, solo se bloquea la solicitud.';

create trigger trg_validate_inventory_loan_request_item_status
  before insert on inventory_loan_requests
  for each row execute function validate_inventory_loan_request_item_status();

revoke all on function validate_inventory_loan_request_item_status() from public;

-- ============================================================
-- RLS
-- ============================================================

alter table inventory_loan_requests enable row level security;

-- Lectura: mismo criterio amplio que inventory_items (todo usuario
-- autenticado necesita poder ver el estado de las solicitudes para saber
-- que hay disponible/reservado), mas explicito para jefe_cuerpo_activo del
-- propio cuartel segun lo pedido -- en la practica select_authenticated ya
-- lo cubre, se deja solo el select amplio para no duplicar logica.
create policy "inventory_loan_requests_select_authenticated" on inventory_loan_requests
  for select using (auth.role() = 'authenticated');

-- Crear solicitud: roles de cuartel, siempre y solo para SU PROPIO cuartel
-- (via my_station_ids(), mismo criterio que vehicles/documents) -- nunca
-- para un cuartel ajeno. Tambien informatica_r4/regional por si necesitan
-- cargar una solicitud en nombre de un cuartel (ej. telefono).
create policy "inventory_loan_requests_insert_station" on inventory_loan_requests
  for insert with check (
    is_informatica_r4()
    or is_regional_role()
    or (
      requesting_station_id in (select my_station_ids())
      and requested_by_profile_id = current_profile_id()
      and (has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel') or has_role('usuario_carga_cuartel'))
    )
  );

-- Aprobar/rechazar/registrar retiro/devolucion/cancelar: informatica_r4 y el
-- mismo set regional que ya administra el catalogo de inventory_items
-- (director_escuela, secretario_regional), mas el responsable puntual del
-- elemento (inventory_items.responsible_profile_id) para SU elemento. El
-- solicitante tambien puede actualizar su propia solicitud, mismo motivo que
-- el "cancelar" que pidio el usuario -- limitado en la practica a
-- pendiente/aprobada por la UI, la policy en si no distingue estados
-- (queda a criterio del frontend, igual que el resto de las transiciones).
create policy "inventory_loan_requests_update_managers" on inventory_loan_requests
  for update using (
    is_informatica_r4()
    or has_role('director_escuela')
    or has_role('secretario_regional')
    or requested_by_profile_id = current_profile_id()
    or exists (
      select 1 from inventory_items
      where inventory_items.id = inventory_loan_requests.inventory_item_id
        and inventory_items.responsible_profile_id = current_profile_id()
    )
  )
  with check (
    is_informatica_r4()
    or has_role('director_escuela')
    or has_role('secretario_regional')
    or requested_by_profile_id = current_profile_id()
    or exists (
      select 1 from inventory_items
      where inventory_items.id = inventory_loan_requests.inventory_item_id
        and inventory_items.responsible_profile_id = current_profile_id()
    )
  );

-- Sin policy de delete para ningun rol no-admin: "no borrar solicitudes
-- historicas" es un requisito explicito. informatica_r4 sigue pudiendo
-- borrar via el bypass de RLS que ya tienen las claves de servicio /
-- consola de Supabase si alguna vez hiciera falta corregir un dato de
-- prueba, pero no hay ningun camino de borrado desde la app.

-- ============================================================
-- Auditoria
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
    when 'inventory_loan_requests' then
      v_station_id := rec.requesting_station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.requesting_station_id;
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

create trigger trg_audit_inventory_loan_requests
  after insert or update on inventory_loan_requests
  for each row execute function audit_row_change();
