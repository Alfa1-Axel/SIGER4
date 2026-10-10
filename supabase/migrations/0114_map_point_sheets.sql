-- SIGER4 - Mapa Regional: fichas de lugares relevantes (v1.14.0)
--
-- Cada lugar (industria, escuela, depósito, local...) es un punto del mapa
-- (map_reference_points) con una FICHA. La ficha cuelga del mismo
-- identificador del punto (map_point_sheets.point_id): no existe un segundo
-- registro del lugar. Lo mismo vale para cualquier otro punto del mapa.
--
-- Quién hace qué (según el modelo de roles actual, sin crear roles nuevos):
--   Consultar   Quien ya ve el punto en el mapa (map_reference_points_select_scope, 0084).
--               Un cuartel ve los puntos de su cuartel; los puntos sin alcance los ve todo el mundo.
--   Proponer    Presidente de CD, jefe de cuerpo activo, secretario de comisión y usuario de
--               carga del cuartel del punto; además, quienes validan.
--   Validar     Informática (y su integrante) y el Secretario Regional dentro de su Regional.
--               Solo ellos escriben directo la ficha; una propuesta no cambia nada hasta que se acepta.
--   Reservado   Contactos personales y notas sensibles viven en otra tabla
--               (map_point_sheet_private): los ven quienes validan y el Presidente de CD, el jefe de
--               cuerpo activo y el usuario de carga del cuartel del punto. Ver un punto NO da
--               acceso a eso.
--
-- La ficha guarda lo que consta en el relevamiento y de dónde sale (quién lo
-- relevó, cuándo, cuándo se revisó por última vez). No dice cómo actuar ni
-- deduce el estado actual del lugar a partir de datos viejos.
--
-- Todas las escrituras de la ficha pasan por las funciones de abajo (la tabla
-- no tiene políticas de alta ni de cambio para los clientes): comprueban el
-- permiso, validan el contenido y la versión (0112) y dejan la historia.
--
-- Es idempotente. No modifica datos existentes.

-- ============================================================
-- 1. Subtipo del punto + auditoría
-- ============================================================

alter table map_reference_points add column if not exists subtype text;

alter table map_reference_points drop constraint if exists map_reference_points_subtype_check;
alter table map_reference_points add constraint map_reference_points_subtype_check check (
  subtype is null
  or (type = 'lugar_relevante' and subtype in ('industria', 'escuela', 'deposito', 'local', 'otro'))
  or (type = 'abastecimiento' and subtype in ('hidrante', 'reserva', 'cisterna', 'otro'))
);

comment on column map_reference_points.subtype is 'Clase de lugar (industria, escuela, depósito, local, otro) o de punto de abastecimiento (hidrante, reserva, cisterna, otro). Solo para los tipos lugar_relevante y abastecimiento.';

drop trigger if exists trg_audit_map_reference_points on map_reference_points;
create trigger trg_audit_map_reference_points after insert or update or delete on map_reference_points
  for each row execute function audit_row_change();

-- ============================================================
-- 2. Quién puede qué (funciones de permiso)
-- ============================================================

-- Validar: Informática en cualquier punto; el Secretario Regional en los de su
-- Regional (la misma regla de escritura del punto, 0084).
create or replace function can_validate_map_point(p_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from map_reference_points p
    where p.id = p_point_id
      and (
        is_informatica_r4()
        or (is_regional_role() and p.region_id is not null and p.region_id in (select my_region_ids()))
      )
  );
$$;

-- Roles de cuartel que cargan datos (los mismos de Documentos, 0053).
create or replace function is_map_station_writer(p_station_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_station_id is not null
    and p_station_id in (select my_station_ids())
    and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel')
      or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    );
$$;

-- Proponer cambios y registrar verificaciones: quien valida, o un rol de carga
-- del cuartel del punto. Solo sobre puntos activos.
create or replace function can_propose_map_point(p_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from map_reference_points p
    where p.id = p_point_id
      and p.is_active
      and (can_validate_map_point(p.id) or is_map_station_writer(p.station_id))
  );
$$;

-- Ver lo reservado de una ficha: quien valida, o el Presidente de CD, el jefe
-- de cuerpo activo y el usuario de carga del cuartel del punto.
create or replace function can_view_private_map_point(p_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from map_reference_points p
    where p.id = p_point_id
      and (
        can_validate_map_point(p.id)
        or (
          p.station_id is not null
          and p.station_id in (select my_station_ids())
          and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
        )
      )
  );
$$;

revoke all on function can_validate_map_point(uuid) from public, anon;
revoke all on function is_map_station_writer(uuid) from public, anon;
revoke all on function can_propose_map_point(uuid) from public, anon;
revoke all on function can_view_private_map_point(uuid) from public, anon;
grant execute on function can_validate_map_point(uuid) to authenticated;
grant execute on function is_map_station_writer(uuid) to authenticated;
grant execute on function can_propose_map_point(uuid) to authenticated;
grant execute on function can_view_private_map_point(uuid) to authenticated;

-- ============================================================
-- 3. Validación del contenido de la ficha
-- ============================================================

-- Características conocidas: [{label, value, unit, source}], hasta 20, solo
-- esas claves. Nada viene precargado: lo que se cargue lo carga una persona y
-- lleva su unidad y su fuente.
create or replace function map_characteristics_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_key text;
begin
  if p_value is null then
    return true;
  end if;
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 then
    return false;
  end if;
  for v_item in select * from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;
    for v_key in select jsonb_object_keys(v_item) loop
      if v_key not in ('label', 'value', 'unit', 'source') then
        return false;
      end if;
    end loop;
    if coalesce(btrim(v_item->>'label'), '') = '' or char_length(v_item->>'label') > 60 then
      return false;
    end if;
    if coalesce(btrim(v_item->>'value'), '') = '' or char_length(v_item->>'value') > 120 then
      return false;
    end if;
    if char_length(coalesce(v_item->>'unit', '')) > 20 or char_length(coalesce(v_item->>'source', '')) > 120 then
      return false;
    end if;
    -- Solo texto: ni objetos ni arreglos anidados.
    if jsonb_typeof(v_item->'label') <> 'string' or jsonb_typeof(v_item->'value') <> 'string'
       or (v_item ? 'unit' and jsonb_typeof(v_item->'unit') not in ('string', 'null'))
       or (v_item ? 'source' and jsonb_typeof(v_item->'source') not in ('string', 'null')) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Campos que una ficha o una propuesta pueden traer. Cualquier otro nombre se rechaza.
create or replace function map_validate_sheet_payload(p_payload jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_key text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Los datos de la ficha no son válidos.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key not in (
      'address', 'locality', 'responsible_entity', 'institutional_contact', 'access_notes',
      'observations', 'documented_risks', 'characteristics', 'review_every_days',
      'surveyed_on', 'surveyed_by_name'
    ) then
      raise exception 'La ficha no admite el campo "%".', v_key using errcode = '22023';
    end if;
  end loop;
  if (p_payload ? 'characteristics') and not map_characteristics_valid(p_payload->'characteristics') then
    raise exception 'Las características no son válidas: hasta 20, cada una con nombre, valor, y unidad y fuente opcionales.' using errcode = '22023';
  end if;
  if (p_payload ? 'review_every_days') and p_payload->'review_every_days' <> 'null'::jsonb then
    if jsonb_typeof(p_payload->'review_every_days') <> 'number'
       or (p_payload->>'review_every_days')::numeric <> trunc((p_payload->>'review_every_days')::numeric)
       or (p_payload->>'review_every_days')::numeric not between 1 and 3650 then
      raise exception 'El plazo de revisión tiene que ser un número entero de días entre 1 y 3650.' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function map_characteristics_valid(jsonb) from public, anon;
revoke all on function map_validate_sheet_payload(jsonb) from public, anon;
grant execute on function map_characteristics_valid(jsonb) to authenticated;
grant execute on function map_validate_sheet_payload(jsonb) to authenticated;

-- ============================================================
-- 4. La ficha (datos compartibles)
-- ============================================================

create table if not exists map_point_sheets (
  point_id uuid primary key references map_reference_points(id) on delete cascade,
  address text,
  locality text,
  -- Quién es el titular: una entidad o empresa, nunca una persona.
  responsible_entity text,
  -- Contacto INSTITUCIONAL (teléfono general, correo de la entidad). Los contactos personales van en la parte reservada.
  institutional_contact text,
  access_notes text,
  observations text,
  documented_risks text,
  characteristics jsonb not null default '[]'::jsonb,
  -- Regla explícita de revisión (solo la usa Abastecimiento): cada cuántos días corresponde volver a verificar. Sin valor, no hay vencimiento.
  review_every_days integer,
  surveyed_on date,
  surveyed_by_name text,
  surveyed_by_profile_id uuid references profiles(id) on delete set null,
  last_reviewed_at timestamptz,
  last_reviewed_by_profile_id uuid references profiles(id) on delete set null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_point_sheets_text_lengths check (
    char_length(coalesce(address, '')) <= 200 and char_length(coalesce(locality, '')) <= 100
    and char_length(coalesce(responsible_entity, '')) <= 120 and char_length(coalesce(institutional_contact, '')) <= 300
    and char_length(coalesce(access_notes, '')) <= 1000 and char_length(coalesce(observations, '')) <= 2000
    and char_length(coalesce(documented_risks, '')) <= 2000 and char_length(coalesce(surveyed_by_name, '')) <= 120
  ),
  constraint map_point_sheets_characteristics_valid check (map_characteristics_valid(characteristics)),
  constraint map_point_sheets_review_days check (review_every_days is null or review_every_days between 1 and 3650),
  constraint map_point_sheets_surveyed_on_not_future check (surveyed_on is null or surveyed_on <= current_date + 1)
);

comment on table map_point_sheets is 'Ficha de un punto del mapa (0114): lo que consta en el relevamiento. Una por punto, mismo identificador. Se escribe solo con save_map_point_sheet() / review_map_point_proposal(); los cambios previos quedan en map_point_sheet_history.';
comment on column map_point_sheets.review_every_days is 'Regla explícita de revisión periódica de un punto de abastecimiento. La fija quien valida; si es null, el punto no tiene fecha de vencimiento.';
comment on column map_point_sheets.last_reviewed_at is 'Última vez que quien valida confirmó o cargó esta información. Lo fija la base; sin esto la ficha figura como "sin validar".';

alter table map_point_sheets add column if not exists row_version bigint not null default 1;
alter table map_point_sheets add column if not exists updated_by_profile_id uuid references profiles(id) on delete set null;
-- Las columnas de revisión no cuentan como edición del contenido (confirmar que sigue igual no cambia la versión).
drop trigger if exists trg_zz_row_version on map_point_sheets;
create trigger trg_zz_row_version before insert or update on map_point_sheets
  for each row execute function enforce_row_version('last_reviewed_at', 'last_reviewed_by_profile_id');

drop trigger if exists trg_map_point_sheets_updated_at on map_point_sheets;
create trigger trg_map_point_sheets_updated_at before update on map_point_sheets
  for each row execute function set_updated_at();

alter table map_point_sheets enable row level security;
drop policy if exists "map_point_sheets_select" on map_point_sheets;
-- Quien ve el punto ve su ficha (la subconsulta aplica la RLS de map_reference_points).
create policy "map_point_sheets_select" on map_point_sheets
  for select using (exists (select 1 from map_reference_points p where p.id = map_point_sheets.point_id));
revoke all on map_point_sheets from anon;
-- Los clientes no insertan, cambian ni borran: solo las funciones de abajo.
revoke insert, update, delete on map_point_sheets from authenticated;

-- ---------------- Historia de la ficha ----------------

create table if not exists map_point_sheet_history (
  id bigserial primary key,
  point_id uuid not null references map_reference_points(id) on delete cascade,
  version bigint not null,
  change_kind text not null check (change_kind in ('alta', 'edicion', 'propuesta_aceptada', 'revision')),
  changed_by_profile_id uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  -- Los datos compartibles tal como quedaron. La parte reservada NO se copia acá.
  snapshot jsonb not null
);

comment on table map_point_sheet_history is 'Cada versión que tuvo una ficha (0114): quién la dejó así y cuándo. Solo se escribe desde el disparador de map_point_sheets.';

create index if not exists idx_map_point_sheet_history_point on map_point_sheet_history(point_id, changed_at desc);

alter table map_point_sheet_history enable row level security;
drop policy if exists "map_point_sheet_history_select" on map_point_sheet_history;
create policy "map_point_sheet_history_select" on map_point_sheet_history
  for select using (exists (select 1 from map_reference_points p where p.id = map_point_sheet_history.point_id));
revoke all on map_point_sheet_history from anon;
revoke insert, update, delete on map_point_sheet_history from authenticated;

create or replace function map_point_sheets_write_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := coalesce(nullif(current_setting('siger4.sheet_change_kind', true), ''), case when tg_op = 'INSERT' then 'alta' else 'edicion' end);
begin
  insert into map_point_sheet_history (point_id, version, change_kind, changed_by_profile_id, snapshot)
  values (
    new.point_id,
    new.row_version,
    v_kind,
    current_profile_id(),
    to_jsonb(new) - 'point_id' - 'row_version' - 'updated_by_profile_id' - 'created_by_profile_id' - 'created_at' - 'updated_at'
  );
  return null;
end;
$$;

revoke all on function map_point_sheets_write_history() from public, anon, authenticated;

drop trigger if exists trg_map_point_sheets_history on map_point_sheets;
create trigger trg_map_point_sheets_history after insert or update on map_point_sheets
  for each row execute function map_point_sheets_write_history();

-- ============================================================
-- 5. La parte reservada
-- ============================================================

create table if not exists map_point_sheet_private (
  point_id uuid primary key references map_point_sheets(point_id) on delete cascade,
  personal_contacts text,
  sensitive_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_point_sheet_private_lengths check (
    char_length(coalesce(personal_contacts, '')) <= 1000 and char_length(coalesce(sensitive_notes, '')) <= 2000
  )
);

comment on table map_point_sheet_private is 'Parte reservada de la ficha (0114): contactos personales y notas sensibles. La leen y escriben quienes validan y el Presidente de CD, el jefe de cuerpo activo y el usuario de carga del cuartel del punto. No pasa por la auditoría general ni por la historia.';

alter table map_point_sheet_private add column if not exists row_version bigint not null default 1;
alter table map_point_sheet_private add column if not exists updated_by_profile_id uuid references profiles(id) on delete set null;
drop trigger if exists trg_zz_row_version on map_point_sheet_private;
create trigger trg_zz_row_version before insert or update on map_point_sheet_private
  for each row execute function enforce_row_version();
drop trigger if exists trg_map_point_sheet_private_updated_at on map_point_sheet_private;
create trigger trg_map_point_sheet_private_updated_at before update on map_point_sheet_private
  for each row execute function set_updated_at();

alter table map_point_sheet_private enable row level security;
drop policy if exists "map_point_sheet_private_select" on map_point_sheet_private;
create policy "map_point_sheet_private_select" on map_point_sheet_private
  for select using (can_view_private_map_point(point_id));
revoke all on map_point_sheet_private from anon;
revoke insert, update, delete on map_point_sheet_private from authenticated;

-- ============================================================
-- 6. Propuestas de cambio
-- ============================================================

create table if not exists map_point_sheet_proposals (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references map_reference_points(id) on delete cascade,
  proposed_by_profile_id uuid references profiles(id) on delete set null,
  proposed_by_name text,
  proposed_at timestamptz not null default now(),
  -- Versión de la ficha sobre la que se propuso (null = la ficha todavía no existía).
  base_version bigint,
  payload jsonb not null,
  note text,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'reemplazada')),
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  constraint map_point_sheet_proposals_note_length check (char_length(coalesce(note, '')) <= 500 and char_length(coalesce(review_note, '')) <= 500)
);

comment on table map_point_sheet_proposals is 'Cambios propuestos a una ficha por quien no valida (0114). No modifican la ficha hasta que quien valida los acepta (review_map_point_proposal).';

create index if not exists idx_map_point_sheet_proposals_point on map_point_sheet_proposals(point_id, status);

alter table map_point_sheet_proposals enable row level security;
drop policy if exists "map_point_sheet_proposals_select" on map_point_sheet_proposals;
create policy "map_point_sheet_proposals_select" on map_point_sheet_proposals
  for select using (
    can_validate_map_point(point_id)
    or (proposed_by_profile_id = current_profile_id()
        and exists (select 1 from map_reference_points p where p.id = map_point_sheet_proposals.point_id))
  );
revoke all on map_point_sheet_proposals from anon;
revoke insert, update, delete on map_point_sheet_proposals from authenticated;

drop trigger if exists trg_audit_map_point_sheet_proposals on map_point_sheet_proposals;
create trigger trg_audit_map_point_sheet_proposals after insert or update or delete on map_point_sheet_proposals
  for each row execute function audit_row_change();

-- ============================================================
-- 7. Funciones de escritura
-- ============================================================

-- Aplica a una fila de ficha los campos presentes en el payload (los ausentes no se tocan).
-- Se usa tanto al guardar directo como al aceptar una propuesta.
create or replace function map_apply_sheet_payload(p_point_id uuid, p_payload jsonb, p_reviewer uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  perform set_config('siger4.sheet_change_kind', p_kind, true);
  select exists (select 1 from map_point_sheets where point_id = p_point_id) into v_exists;
  if not v_exists then
    insert into map_point_sheets (
      point_id, address, locality, responsible_entity, institutional_contact, access_notes, observations,
      documented_risks, characteristics, review_every_days, surveyed_on, surveyed_by_name,
      surveyed_by_profile_id, last_reviewed_at, last_reviewed_by_profile_id, created_by_profile_id
    ) values (
      p_point_id,
      nullif(btrim(p_payload->>'address'), ''), nullif(btrim(p_payload->>'locality'), ''),
      nullif(btrim(p_payload->>'responsible_entity'), ''), nullif(btrim(p_payload->>'institutional_contact'), ''),
      nullif(btrim(p_payload->>'access_notes'), ''), nullif(btrim(p_payload->>'observations'), ''),
      nullif(btrim(p_payload->>'documented_risks'), ''),
      coalesce(p_payload->'characteristics', '[]'::jsonb),
      nullif(p_payload->>'review_every_days', '')::integer,
      nullif(p_payload->>'surveyed_on', '')::date, nullif(btrim(p_payload->>'surveyed_by_name'), ''),
      p_reviewer, now(), p_reviewer, p_reviewer
    );
  else
    update map_point_sheets s set
      address = case when p_payload ? 'address' then nullif(btrim(p_payload->>'address'), '') else s.address end,
      locality = case when p_payload ? 'locality' then nullif(btrim(p_payload->>'locality'), '') else s.locality end,
      responsible_entity = case when p_payload ? 'responsible_entity' then nullif(btrim(p_payload->>'responsible_entity'), '') else s.responsible_entity end,
      institutional_contact = case when p_payload ? 'institutional_contact' then nullif(btrim(p_payload->>'institutional_contact'), '') else s.institutional_contact end,
      access_notes = case when p_payload ? 'access_notes' then nullif(btrim(p_payload->>'access_notes'), '') else s.access_notes end,
      observations = case when p_payload ? 'observations' then nullif(btrim(p_payload->>'observations'), '') else s.observations end,
      documented_risks = case when p_payload ? 'documented_risks' then nullif(btrim(p_payload->>'documented_risks'), '') else s.documented_risks end,
      characteristics = case when p_payload ? 'characteristics' then coalesce(p_payload->'characteristics', '[]'::jsonb) else s.characteristics end,
      review_every_days = case when p_payload ? 'review_every_days' then nullif(p_payload->>'review_every_days', '')::integer else s.review_every_days end,
      surveyed_on = case when p_payload ? 'surveyed_on' then nullif(p_payload->>'surveyed_on', '')::date else s.surveyed_on end,
      surveyed_by_name = case when p_payload ? 'surveyed_by_name' then nullif(btrim(p_payload->>'surveyed_by_name'), '') else s.surveyed_by_name end,
      last_reviewed_at = now(),
      last_reviewed_by_profile_id = p_reviewer
    where s.point_id = p_point_id;
  end if;
  perform set_config('siger4.sheet_change_kind', '', true);
end;
$$;

revoke all on function map_apply_sheet_payload(uuid, jsonb, uuid, text) from public, anon, authenticated;

-- Guardar la ficha directo: solo quien valida. Con la versión que se leyó (null/0 si la ficha todavía no existe).
create or replace function save_map_point_sheet(p_point_id uuid, p_payload jsonb, p_expected_version bigint)
returns setof map_point_sheets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_current map_point_sheets%rowtype;
  v_found boolean;
begin
  if v_profile is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not can_validate_map_point(p_point_id) then
    raise exception 'No tenés permiso para guardar esta ficha. Podés proponer los cambios para que los valide Informática o el Secretario Regional.' using errcode = '42501';
  end if;
  perform map_validate_sheet_payload(p_payload);

  select * into v_current from map_point_sheets where point_id = p_point_id for update;
  v_found := found;
  if v_found then
    if p_expected_version is distinct from v_current.row_version then
      raise exception 'La ficha fue actualizada por otra persona mientras la editabas.' using errcode = 'P0409', hint = v_current.row_version::text;
    end if;
  elsif coalesce(p_expected_version, 0) <> 0 then
    raise exception 'La ficha ya no existe.' using errcode = 'P0409', hint = 'gone';
  end if;

  perform map_apply_sheet_payload(p_point_id, p_payload, v_profile, case when v_found then 'edicion' else 'alta' end);
  return query select * from map_point_sheets where point_id = p_point_id;
end;
$$;

-- Confirmar que la información sigue vigente (sin cambiar nada): solo quien valida.
create or replace function mark_map_point_sheet_reviewed(p_point_id uuid)
returns setof map_point_sheets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
begin
  if v_profile is null or not can_validate_map_point(p_point_id) then
    raise exception 'No tenés permiso para validar esta ficha.' using errcode = '42501';
  end if;
  if not exists (select 1 from map_point_sheets where point_id = p_point_id) then
    raise exception 'Este punto todavía no tiene ficha.' using errcode = 'P0001';
  end if;
  perform set_config('siger4.sheet_change_kind', 'revision', true);
  update map_point_sheets set last_reviewed_at = now(), last_reviewed_by_profile_id = v_profile where point_id = p_point_id;
  perform set_config('siger4.sheet_change_kind', '', true);
  return query select * from map_point_sheets where point_id = p_point_id;
end;
$$;

-- Guardar la parte reservada.
create or replace function save_map_point_sheet_private(p_point_id uuid, p_payload jsonb, p_expected_version bigint)
returns setof map_point_sheet_private
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_key text;
  v_current map_point_sheet_private%rowtype;
begin
  if v_profile is null or not can_view_private_map_point(p_point_id) then
    raise exception 'No tenés permiso para cargar la parte reservada de esta ficha.' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Los datos reservados no son válidos.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key not in ('personal_contacts', 'sensitive_notes') then
      raise exception 'La parte reservada no admite el campo "%".', v_key using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from map_point_sheets where point_id = p_point_id) then
    raise exception 'Primero hay que cargar la ficha del punto.' using errcode = 'P0001';
  end if;

  select * into v_current from map_point_sheet_private where point_id = p_point_id for update;
  if found then
    if p_expected_version is distinct from v_current.row_version then
      raise exception 'La parte reservada fue actualizada por otra persona mientras la editabas.' using errcode = 'P0409', hint = v_current.row_version::text;
    end if;
    update map_point_sheet_private s set
      personal_contacts = case when p_payload ? 'personal_contacts' then nullif(btrim(p_payload->>'personal_contacts'), '') else s.personal_contacts end,
      sensitive_notes = case when p_payload ? 'sensitive_notes' then nullif(btrim(p_payload->>'sensitive_notes'), '') else s.sensitive_notes end
    where s.point_id = p_point_id;
  else
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'La parte reservada ya no existe.' using errcode = 'P0409', hint = 'gone';
    end if;
    insert into map_point_sheet_private (point_id, personal_contacts, sensitive_notes)
    values (p_point_id, nullif(btrim(p_payload->>'personal_contacts'), ''), nullif(btrim(p_payload->>'sensitive_notes'), ''));
  end if;
  return query select * from map_point_sheet_private where point_id = p_point_id;
end;
$$;

-- Proponer cambios: quien puede cargar en el cuartel del punto (o valida). No toca la ficha.
create or replace function propose_map_point_sheet(
  p_point_id uuid,
  p_payload jsonb,
  p_note text,
  p_base_version bigint,
  p_id uuid default null
)
returns setof map_point_sheet_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if v_profile is null or not can_propose_map_point(p_point_id) then
    raise exception 'No tenés permiso para proponer cambios en este punto.' using errcode = '42501';
  end if;
  perform map_validate_sheet_payload(p_payload);
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres.' using errcode = '22023';
  end if;
  -- Reintentar la misma propuesta (doble toque, respuesta perdida) no la duplica.
  if exists (select 1 from map_point_sheet_proposals where id = v_id) then
    return query select * from map_point_sheet_proposals where id = v_id and proposed_by_profile_id = v_profile;
    return;
  end if;
  if (select count(*) from map_point_sheet_proposals where point_id = p_point_id and status = 'pendiente') >= 20 then
    raise exception 'Este punto ya tiene muchas propuestas pendientes. Esperá a que se validen.' using errcode = '54000';
  end if;
  -- Una propuesta nueva reemplaza a la anterior de la misma persona sobre el mismo punto.
  update map_point_sheet_proposals set status = 'reemplazada'
   where point_id = p_point_id and proposed_by_profile_id = v_profile and status = 'pendiente';
  insert into map_point_sheet_proposals (id, point_id, proposed_by_profile_id, proposed_by_name, base_version, payload, note)
  values (v_id, p_point_id, v_profile, (select full_name from profiles where id = v_profile), p_base_version, p_payload, nullif(btrim(p_note), ''));
  return query select * from map_point_sheet_proposals where id = v_id;
end;
$$;

-- Aceptar o rechazar una propuesta: solo quien valida ese punto.
create or replace function review_map_point_proposal(
  p_proposal_id uuid,
  p_accept boolean,
  p_note text,
  p_expected_sheet_version bigint
)
returns setof map_point_sheet_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_prop map_point_sheet_proposals%rowtype;
  v_sheet map_point_sheets%rowtype;
begin
  select * into v_prop from map_point_sheet_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'No encontramos la propuesta.' using errcode = 'P0001';
  end if;
  if v_profile is null or not can_validate_map_point(v_prop.point_id) then
    raise exception 'No tenés permiso para validar los cambios de este punto.' using errcode = '42501';
  end if;
  if v_prop.status <> 'pendiente' then
    raise exception 'Esta propuesta ya se resolvió.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres.' using errcode = '22023';
  end if;

  if p_accept then
    select * into v_sheet from map_point_sheets where point_id = v_prop.point_id for update;
    if found then
      if p_expected_sheet_version is distinct from v_sheet.row_version then
        raise exception 'La ficha cambió desde que viste esta propuesta. Revisala de nuevo.' using errcode = 'P0409', hint = v_sheet.row_version::text;
      end if;
    elsif coalesce(p_expected_sheet_version, 0) <> 0 then
      raise exception 'La ficha ya no existe.' using errcode = 'P0409', hint = 'gone';
    end if;
    perform map_apply_sheet_payload(v_prop.point_id, v_prop.payload, v_profile, 'propuesta_aceptada');
  end if;

  update map_point_sheet_proposals set
    status = case when p_accept then 'aceptada' else 'rechazada' end,
    reviewed_by_profile_id = v_profile,
    reviewed_by_name = (select full_name from profiles where id = v_profile),
    reviewed_at = now(),
    review_note = nullif(btrim(p_note), '')
  where id = p_proposal_id;
  return query select * from map_point_sheet_proposals where id = p_proposal_id;
end;
$$;

do $grants$
declare
  r record;
begin
  for r in
    select * from (values
      ('save_map_point_sheet(uuid, jsonb, bigint)'),
      ('mark_map_point_sheet_reviewed(uuid)'),
      ('save_map_point_sheet_private(uuid, jsonb, bigint)'),
      ('propose_map_point_sheet(uuid, jsonb, text, bigint, uuid)'),
      ('review_map_point_proposal(uuid, boolean, text, bigint)')
    ) as v(sig)
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;

-- ============================================================
-- 8. Archivos de la ficha (fotos, planos, documentos)
-- ============================================================

-- La tabla se crea sin la referencia a verificaciones (la 0115 la agrega).
create table if not exists map_point_files (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references map_reference_points(id) on delete cascade,
  -- Si el archivo es la evidencia de una verificación (0115).
  verification_id uuid,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  file_kind text not null default 'documento' check (file_kind in ('foto', 'plano', 'documento')),
  -- compartido: lo ve quien ve el punto (una vez validado). reservado: solo quienes ven la parte reservada.
  visibility text not null default 'compartido' check (visibility in ('compartido', 'reservado')),
  -- pendiente: lo subió alguien que no valida; hasta que se valide solo lo ven quien lo subió y quienes validan.
  status text not null default 'pendiente' check (status in ('pendiente', 'validado')),
  caption text,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint map_point_files_path_format check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'),
  constraint map_point_files_path_matches_point check (split_part(storage_path, '/', 1) = point_id::text),
  constraint map_point_files_mime check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  constraint map_point_files_size check (file_size > 0 and file_size <= 10485760),
  constraint map_point_files_text check (char_length(file_name) between 1 and 255 and char_length(coalesce(caption, '')) <= 200)
);

comment on table map_point_files is 'Archivos de la ficha de un punto (0114): metadatos; el archivo vive en el bucket privado map-point-files. Ver un punto no da acceso a todos sus archivos: cada uno tiene su visibilidad y su estado de validación.';

create index if not exists idx_map_point_files_point on map_point_files(point_id);

-- Disparador: lo que decide la base y no el cliente.
create or replace function map_point_files_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := current_profile_id();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.uploaded_by_profile_id := v_actor;
      if not can_propose_map_point(new.point_id) then
        raise exception 'No tenés permiso para cargar archivos en este punto.' using errcode = '42501';
      end if;
      if new.visibility = 'reservado' and not can_view_private_map_point(new.point_id) then
        raise exception 'No tenés permiso para cargar archivos reservados en este punto.' using errcode = '42501';
      end if;
      -- Lo que sube quien valida queda validado; lo demás espera su validación.
      new.status := case when can_validate_map_point(new.point_id) then 'validado' else 'pendiente' end;
    end if;
    new.created_at := now();
  else
    -- Solo cambian la leyenda, la visibilidad y la validación; lo demás es inmutable.
    if new.id is distinct from old.id or new.point_id is distinct from old.point_id
       or new.verification_id is distinct from old.verification_id or new.storage_path is distinct from old.storage_path
       or new.file_name is distinct from old.file_name or new.mime_type is distinct from old.mime_type
       or new.file_size is distinct from old.file_size or new.file_kind is distinct from old.file_kind
       or new.uploaded_by_profile_id is distinct from old.uploaded_by_profile_id or new.created_at is distinct from old.created_at then
      raise exception 'De un archivo solo se pueden cambiar la leyenda, la visibilidad y la validación.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function map_point_files_before_write() from public, anon, authenticated;

drop trigger if exists trg_map_point_files_before_write on map_point_files;
create trigger trg_map_point_files_before_write before insert or update on map_point_files
  for each row execute function map_point_files_before_write();

drop trigger if exists trg_audit_map_point_files on map_point_files;
create trigger trg_audit_map_point_files after insert or update or delete on map_point_files
  for each row execute function audit_row_change();

alter table map_point_files enable row level security;
revoke all on map_point_files from anon;

-- Ver: el punto tiene que ser visible Y el archivo estar a la vista de esta persona.
drop policy if exists "map_point_files_select" on map_point_files;
create policy "map_point_files_select" on map_point_files
  for select using (
    exists (select 1 from map_reference_points p where p.id = map_point_files.point_id)
    and (
      uploaded_by_profile_id = current_profile_id()
      or can_validate_map_point(point_id)
      or (visibility = 'compartido' and status = 'validado')
      or (visibility = 'reservado' and status = 'validado' and can_view_private_map_point(point_id))
    )
  );

drop policy if exists "map_point_files_insert" on map_point_files;
create policy "map_point_files_insert" on map_point_files
  for insert with check (can_propose_map_point(point_id));

-- Validar / cambiar visibilidad o leyenda: solo quien valida.
drop policy if exists "map_point_files_update" on map_point_files;
create policy "map_point_files_update" on map_point_files
  for update using (can_validate_map_point(point_id)) with check (can_validate_map_point(point_id));

-- Quitar: quien lo subió mientras sigue pendiente, o quien valida.
drop policy if exists "map_point_files_delete" on map_point_files;
create policy "map_point_files_delete" on map_point_files
  for delete using (
    can_validate_map_point(point_id)
    or (uploaded_by_profile_id = current_profile_id() and status = 'pendiente')
  );

-- ---------------- Storage: bucket privado ----------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-point-files', 'map-point-files', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Punto al que pertenece un objeto (primer tramo de la ruta), o null si la ruta no es válida.
create or replace function map_point_object_point_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'
    then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

-- Subir: ruta bien formada, punto en el que puede cargar y archivo todavía sin registrar.
create or replace function can_upload_map_point_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select map_point_object_point_id(p_name) is not null
    and can_propose_map_point(map_point_object_point_id(p_name))
    and not exists (select 1 from map_point_files f where f.storage_path = p_name);
$$;

-- Borrar el objeto: un archivo propio todavía sin registrar, o uno registrado que esta persona puede quitar.
create or replace function can_delete_map_point_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select map_point_object_point_id(p_name) is not null
    and (
      exists (
        select 1 from map_point_files f
        where f.storage_path = p_name
          and (can_validate_map_point(f.point_id) or (f.uploaded_by_profile_id = current_profile_id() and f.status = 'pendiente'))
      )
      or (
        not exists (select 1 from map_point_files f where f.storage_path = p_name)
        and can_propose_map_point(map_point_object_point_id(p_name))
      )
    );
$$;

revoke all on function map_point_object_point_id(text) from public, anon;
revoke all on function can_upload_map_point_object(text) from public, anon;
revoke all on function can_delete_map_point_object(text) from public, anon;
grant execute on function map_point_object_point_id(text) to authenticated;
grant execute on function can_upload_map_point_object(text) to authenticated;
grant execute on function can_delete_map_point_object(text) to authenticated;

drop policy if exists "map_point_files_objects_select" on storage.objects;
-- Leer: solo si el archivo está registrado y esta persona lo ve (la subconsulta aplica la RLS de map_point_files).
create policy "map_point_files_objects_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'map-point-files' and exists (select 1 from map_point_files f where f.storage_path = name));

drop policy if exists "map_point_files_objects_insert" on storage.objects;
create policy "map_point_files_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'map-point-files' and can_upload_map_point_object(name));

drop policy if exists "map_point_files_objects_delete" on storage.objects;
create policy "map_point_files_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'map-point-files' and can_delete_map_point_object(name));

-- ============================================================
-- 9. Buscar y evitar duplicados (con la RLS de quien consulta)
-- ============================================================

-- Clave de comparación de nombres: sin mayúsculas, tildes ni signos.
create or replace function map_name_key(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    translate(lower(coalesce(p_name, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'),
    '[^a-z0-9]+', '', 'g'
  );
$$;

-- Puntos que podrían ser el mismo que se está por crear: mismo nombre (sin tildes
-- ni signos), uno contenido en el otro, o a 150 metros o menos. No usa extensiones.
create or replace function find_similar_map_points(p_name text, p_latitude numeric, p_longitude numeric)
returns table (id uuid, name text, type map_reference_point_type, subtype text, distance_m integer, match_reason text)
language sql
stable
set search_path = public
as $$
  select c.id, c.name, c.type, c.subtype, c.distance_m,
         case
           when c.key = c.wanted then 'mismo_nombre'
           when length(least(c.key, c.wanted)) >= 4 and (c.key like '%' || c.wanted || '%' or c.wanted like '%' || c.key || '%') then 'nombre_parecido'
           else 'muy_cerca'
         end as match_reason
  from (
    select p.id, p.name, p.type, p.subtype,
           map_name_key(p.name) as key,
           map_name_key(p_name) as wanted,
           round(111320 * sqrt(power(p.latitude - p_latitude, 2) + power((p.longitude - p_longitude) * cos(radians(p_latitude)), 2)))::integer as distance_m
    from map_reference_points p
    where p.is_active
  ) c
  where (c.wanted <> '' and (c.key = c.wanted or (length(least(c.key, c.wanted)) >= 4 and (c.key like '%' || c.wanted || '%' or c.wanted like '%' || c.key || '%'))))
     or c.distance_m <= 150
  order by (c.key = c.wanted) desc, c.distance_m asc
  limit 5;
$$;

-- Búsqueda por nombre, localidad, dirección o clase. Solo devuelve datos del listado (sin contactos ni notas).
create or replace function search_map_points(p_query text, p_limit integer default 8)
returns table (id uuid, name text, type map_reference_point_type, subtype text, locality text)
language sql
stable
set search_path = public
as $$
  select p.id, p.name, p.type, p.subtype, s.locality
  from map_reference_points p
  left join map_point_sheets s on s.point_id = p.id
  where p.is_active
    and char_length(btrim(coalesce(p_query, ''))) >= 2
    and (
      p.name ilike '%' || btrim(p_query) || '%'
      or coalesce(s.locality, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(s.address, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(p.subtype, '') ilike '%' || btrim(p_query) || '%'
    )
  order by p.name
  limit least(greatest(coalesce(p_limit, 8), 1), 25);
$$;

revoke all on function map_name_key(text) from public, anon;
revoke all on function find_similar_map_points(text, numeric, numeric) from public, anon;
grant execute on function map_name_key(text) to authenticated;
revoke all on function search_map_points(text, integer) from public, anon;
grant execute on function find_similar_map_points(text, numeric, numeric) to authenticated;
grant execute on function search_map_points(text, integer) to authenticated;
