-- SIGER4 - Mapa Regional: puntos de abastecimiento con historial de verificación (v1.14.0)
--
-- Un punto de abastecimiento (hidrante, reserva, cisterna, otro) es un punto
-- del mapa de tipo "abastecimiento" con su ficha (0114). Cada vez que alguien
-- lo verifica queda una VERIFICACIÓN: fecha, quién, resultado, problemas
-- detectados, seguimiento pendiente y, si hay, la foto o evidencia. Las
-- verificaciones no se pisan: se agrega una nueva y la anterior queda en el
-- historial.
--
-- Lo que esto NO es: no dice si el punto sirve ahora. Una verificación vieja
-- es un dato de esa fecha, no la disponibilidad actual. No se inventan caudales,
-- capacidades ni plazos: el único vencimiento posible sale de la regla que
-- alguien cargó a propósito en la ficha del punto (review_every_days).
--
-- Quién verifica: quien puede cargar en el cuartel del punto (Presidente de CD,
-- jefe de cuerpo activo, secretario de comisión, usuario de carga) y quienes
-- validan (Informática, Secretario Regional en su Regional). Quién ve las
-- verificaciones: quien ve el punto.
--
-- Es idempotente. No modifica datos existentes.

-- ============================================================
-- 1. Verificaciones
-- ============================================================

create table if not exists map_point_verifications (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references map_reference_points(id) on delete cascade,
  verified_on date not null,
  verified_by_profile_id uuid references profiles(id) on delete set null,
  -- Copia del nombre al momento de verificar: la historia no cambia si después cambian el nombre o el usuario.
  verified_by_name text,
  result text not null check (result in ('sin_problemas_informados', 'problema_informado', 'no_se_pudo_verificar')),
  problems text,
  notes text,
  -- Seguimiento pendiente (qué falta hacer) y cómo se resolvió.
  follow_up text,
  follow_up_status text check (follow_up_status in ('pendiente', 'resuelto')),
  follow_up_resolved_on date,
  follow_up_resolved_by_profile_id uuid references profiles(id) on delete set null,
  follow_up_resolved_by_name text,
  follow_up_resolution text,
  created_at timestamptz not null default now(),
  constraint map_point_verifications_date check (verified_on <= current_date + 1),
  constraint map_point_verifications_problem_text check (result <> 'problema_informado' or char_length(btrim(coalesce(problems, ''))) > 0),
  constraint map_point_verifications_lengths check (
    char_length(coalesce(problems, '')) <= 1500 and char_length(coalesce(notes, '')) <= 1500
    and char_length(coalesce(follow_up, '')) <= 500 and char_length(coalesce(follow_up_resolution, '')) <= 500
  )
);

comment on table map_point_verifications is 'Historial de verificaciones de un punto de abastecimiento (0114/0115): una fila por verificación, que no se pisa ni se edita. Lo único que cambia después es la resolución del seguimiento (resolve_map_point_followup).';
comment on column map_point_verifications.result is 'sin_problemas_informados: quien verificó no informó problemas EN ESA FECHA (no es una garantía de disponibilidad). problema_informado: informó un problema. no_se_pudo_verificar: se fue a verificar y no se pudo.';

create index if not exists idx_map_point_verifications_point on map_point_verifications(point_id, verified_on desc);

-- Disparador: lo que decide la base y no el cliente.
create or replace function map_point_verifications_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := current_profile_id();
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from map_reference_points p where p.id = new.point_id and p.type = 'abastecimiento') then
      raise exception 'Solo los puntos de abastecimiento tienen verificaciones.' using errcode = '22023';
    end if;
    if auth.uid() is not null then
      new.verified_by_profile_id := v_actor;
    end if;
    new.verified_by_name := (select full_name from profiles where id = new.verified_by_profile_id);
    new.created_at := now();
    new.follow_up := nullif(btrim(coalesce(new.follow_up, '')), '');
    new.problems := nullif(btrim(coalesce(new.problems, '')), '');
    new.notes := nullif(btrim(coalesce(new.notes, '')), '');
    -- Un problema siempre queda con seguimiento pendiente; lo demás, solo si se pidió uno.
    new.follow_up_status := case when new.result = 'problema_informado' or new.follow_up is not null then 'pendiente' else null end;
    new.follow_up_resolved_on := null;
    new.follow_up_resolved_by_profile_id := null;
    new.follow_up_resolved_by_name := null;
    new.follow_up_resolution := null;
  else
    -- Después de cargada, solo cambia la resolución del seguimiento.
    if new.id is distinct from old.id or new.point_id is distinct from old.point_id or new.verified_on is distinct from old.verified_on
       or new.verified_by_profile_id is distinct from old.verified_by_profile_id or new.verified_by_name is distinct from old.verified_by_name
       or new.result is distinct from old.result or new.problems is distinct from old.problems or new.notes is distinct from old.notes
       or new.follow_up is distinct from old.follow_up or new.created_at is distinct from old.created_at then
      raise exception 'Una verificación cargada no se modifica. Si hubo un error, cargá una nueva.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function map_point_verifications_before_write() from public, anon, authenticated;

drop trigger if exists trg_map_point_verifications_before_write on map_point_verifications;
create trigger trg_map_point_verifications_before_write before insert or update on map_point_verifications
  for each row execute function map_point_verifications_before_write();

drop trigger if exists trg_audit_map_point_verifications on map_point_verifications;
create trigger trg_audit_map_point_verifications after insert or update or delete on map_point_verifications
  for each row execute function audit_row_change();

alter table map_point_verifications enable row level security;
revoke all on map_point_verifications from anon;
revoke update on map_point_verifications from authenticated;

drop policy if exists "map_point_verifications_select" on map_point_verifications;
create policy "map_point_verifications_select" on map_point_verifications
  for select using (exists (select 1 from map_reference_points p where p.id = map_point_verifications.point_id));

drop policy if exists "map_point_verifications_insert" on map_point_verifications;
create policy "map_point_verifications_insert" on map_point_verifications
  for insert with check (can_propose_map_point(point_id));

-- Borrar una verificación cargada por error: solo Informática (queda en Auditoría).
drop policy if exists "map_point_verifications_delete" on map_point_verifications;
create policy "map_point_verifications_delete" on map_point_verifications
  for delete using (is_informatica_r4());

-- Resolver el seguimiento: quien puede cargar en el cuartel del punto o valida.
create or replace function resolve_map_point_followup(p_verification_id uuid, p_resolution text)
returns setof map_point_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_row map_point_verifications%rowtype;
begin
  select * into v_row from map_point_verifications where id = p_verification_id for update;
  if not found then
    raise exception 'No encontramos la verificación.' using errcode = 'P0001';
  end if;
  if v_profile is null or not can_propose_map_point(v_row.point_id) then
    raise exception 'No tenés permiso para resolver el seguimiento de este punto.' using errcode = '42501';
  end if;
  if v_row.follow_up_status is distinct from 'pendiente' then
    raise exception 'Esta verificación no tiene un seguimiento pendiente.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_resolution, '')) > 500 then
    raise exception 'La resolución no puede superar los 500 caracteres.' using errcode = '22023';
  end if;
  update map_point_verifications set
    follow_up_status = 'resuelto',
    follow_up_resolved_on = current_date,
    follow_up_resolved_by_profile_id = v_profile,
    follow_up_resolved_by_name = (select full_name from profiles where id = v_profile),
    follow_up_resolution = nullif(btrim(p_resolution), '')
  where id = p_verification_id;
  return query select * from map_point_verifications where id = p_verification_id;
end;
$$;

revoke all on function resolve_map_point_followup(uuid, text) from public, anon;
grant execute on function resolve_map_point_followup(uuid, text) to authenticated;

-- ============================================================
-- 2. Evidencia: archivos de una verificación
-- ============================================================

alter table map_point_files drop constraint if exists map_point_files_verification_fk;
alter table map_point_files add constraint map_point_files_verification_fk
  foreign key (verification_id) references map_point_verifications(id) on delete cascade;
create index if not exists idx_map_point_files_verification on map_point_files(verification_id) where verification_id is not null;

-- Misma función de 0114 con una regla más: la evidencia de una verificación
-- tiene que ser del mismo punto y la sube quien la cargó; queda validada.
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
      if new.verification_id is not null then
        if not exists (
          select 1 from map_point_verifications v
          where v.id = new.verification_id and v.point_id = new.point_id and v.verified_by_profile_id = v_actor
        ) then
          raise exception 'Solo quien cargó la verificación puede agregarle evidencia.' using errcode = '42501';
        end if;
        new.status := 'validado';
      else
        -- Lo que sube quien valida queda validado; lo demás espera su validación.
        new.status := case when can_validate_map_point(new.point_id) then 'validado' else 'pendiente' end;
      end if;
    end if;
    new.created_at := now();
  else
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

-- ============================================================
-- 3. Estado del punto de abastecimiento (derivado, con la RLS de quien consulta)
-- ============================================================

-- Una vista con security_invoker: cada persona ve solo los puntos que ya puede ver.
-- Estados:
--   pendiente_verificar   sin verificaciones, o la última fue "no se pudo verificar".
--   problema_informado    la última verificación informó un problema y su seguimiento sigue pendiente.
--   pendiente_revision    la regla de revisión de la ficha (review_every_days) venció, o el problema
--                         ya se resolvió y falta volver a verificar.
--   ultima_sin_problemas  la última verificación no informó problemas en su fecha. NO significa
--                         que hoy esté disponible.
create or replace view map_supply_point_status with (security_invoker = true) as
select
  p.id as point_id,
  lv.id as last_verification_id,
  lv.verified_on as last_verified_on,
  lv.result as last_result,
  lv.verified_by_name as last_verified_by_name,
  lv.problems as last_problems,
  coalesce(pf.pending_followups, 0)::integer as pending_followups,
  s.review_every_days,
  case
    when lv.id is null or lv.result = 'no_se_pudo_verificar' then 'pendiente_verificar'
    when lv.result = 'problema_informado' and lv.follow_up_status is distinct from 'resuelto' then 'problema_informado'
    when lv.result = 'problema_informado' then 'pendiente_revision'
    when s.review_every_days is not null and lv.verified_on + s.review_every_days < current_date then 'pendiente_revision'
    else 'ultima_sin_problemas'
  end as status,
  case when s.review_every_days is not null and lv.verified_on is not null then lv.verified_on + s.review_every_days end as review_due_on
from map_reference_points p
left join lateral (
  select v.* from map_point_verifications v where v.point_id = p.id order by v.verified_on desc, v.created_at desc limit 1
) lv on true
left join map_point_sheets s on s.point_id = p.id
left join lateral (
  select count(*) as pending_followups from map_point_verifications v where v.point_id = p.id and v.follow_up_status = 'pendiente'
) pf on true
where p.type = 'abastecimiento' and p.is_active;

revoke all on map_supply_point_status from anon;

-- ============================================================
-- 4. Pendientes del Mapa (se suman a get_pending_items en la pantalla)
-- ============================================================

-- Con la RLS de quien consulta: solo aparecen puntos que ya ve, y solo a quien
-- puede actuar sobre ellos. Un ítem por punto, así que no hay avisos repetidos.
-- No toca get_pending_items(): la pantalla suma los dos resultados.
create or replace function get_map_pending_items()
returns table (item_key text, title text, description text, priority text, module text, link_path text, sort_key timestamptz)
language plpgsql
stable
set search_path = public
as $$
begin
  if is_department_only() or current_profile_id() is null then
    return;
  end if;

  -- 1. Problemas informados con seguimiento pendiente.
  return query
  select
    'map_problem_' || st.point_id::text,
    'Problema informado en un punto de abastecimiento: ' || p.name,
    'Verificado el ' || to_char(st.last_verified_on, 'DD/MM/YYYY') || ' por ' || coalesce(st.last_verified_by_name, 'una persona')
      || '. El seguimiento sigue pendiente.',
    'alta',
    'Mapa Regional',
    '/mapa/puntos/' || p.id::text,
    st.last_verified_on::timestamptz
  from map_supply_point_status st
  join map_reference_points p on p.id = st.point_id
  where st.status = 'problema_informado' and can_propose_map_point(p.id);

  -- 2. Revisión vencida según la regla cargada en la ficha (sin regla no hay vencimiento).
  return query
  select
    'map_review_' || st.point_id::text,
    'Punto de abastecimiento pendiente de nueva revisión: ' || p.name,
    'La última verificación fue el ' || to_char(st.last_verified_on, 'DD/MM/YYYY') || '. La regla cargada para este punto es revisarlo cada '
      || st.review_every_days::text || ' días.',
    'media',
    'Mapa Regional',
    '/mapa/puntos/' || p.id::text,
    st.review_due_on::timestamptz
  from map_supply_point_status st
  join map_reference_points p on p.id = st.point_id
  where st.review_every_days is not null
    and st.last_verified_on is not null
    and st.last_result <> 'no_se_pudo_verificar'
    and st.status = 'pendiente_revision'
    and st.review_due_on < current_date
    and can_propose_map_point(p.id);

  -- 3. Cambios propuestos a una ficha, para quien valida.
  return query
  select
    'map_proposals_' || pr.point_id::text,
    'Cambios propuestos para validar: ' || p.name,
    count(*)::text || case when count(*) = 1 then ' propuesta de ficha espera' else ' propuestas de ficha esperan' end || ' validación.',
    'media',
    'Mapa Regional',
    '/mapa/puntos/' || p.id::text,
    min(pr.proposed_at)
  from map_point_sheet_proposals pr
  join map_reference_points p on p.id = pr.point_id
  where pr.status = 'pendiente' and can_validate_map_point(pr.point_id)
  group by pr.point_id, p.id, p.name;
end;
$$;

comment on function get_map_pending_items() is 'Pendientes del Mapa Regional (0115): problemas informados en puntos de abastecimiento, revisiones vencidas según la regla de la ficha y propuestas de ficha por validar. Con la RLS de quien consulta; la pantalla de Pendientes la suma a get_pending_items().';

revoke all on function get_map_pending_items() from public, anon;
grant execute on function get_map_pending_items() to authenticated;
