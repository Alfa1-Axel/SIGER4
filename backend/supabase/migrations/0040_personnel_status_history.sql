-- SIGER4 - Historial de estado de personal + motivo obligatorio en separaciones
--
-- Mismo patron que 0038_vehicle_lifecycle_history.sql, aplicado a personnel:
--   - renuncia, baja, pase, reserva: requieren motivo obligatorio (implican
--     que la persona deja de contar como dotacion activa real del cuartel).
--     baja es distinta de renuncia: baja = separacion por decision
--     institucional, renuncia = decision propia de la persona.
--   - activo, licencia, aspirante: se siguen editando libremente por UPDATE
--     directo (sin motivo obligatorio), no cambia el flujo existente de
--     PersonalFormPage/CuartelDetallePage para esos casos.
--   - personnel_count ya solo contaba 'activo' desde 0001/0021 — no hace
--     falta tocar sync_station_personnel_count(), los estados nuevos
--     (renuncia/pase) ya quedan excluidos automaticamente al no ser
--     'activo'.

create table personnel_status_history (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references personnel(id) on delete cascade,
  previous_status personnel_status not null,
  new_status personnel_status not null,
  reason text not null,
  changed_by_profile_id uuid references profiles(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table personnel_status_history is 'Historial de cambios de estado de un integrante del personal hacia renuncia/baja/pase/reserva (quien, cuando, motivo, en que cuartel estaba). Se llena via change_personnel_status(), nunca por UPDATE directo.';

create index idx_personnel_status_history_personnel_id on personnel_status_history(personnel_id, created_at desc);

alter table personnel_status_history enable row level security;

create policy "personnel_status_history_select_scope" on personnel_status_history
  for select using (
    is_informatica_r4()
    or station_id in (select my_station_ids())
    or (is_regional_role() and station_id in (select id from stations where region_id in (select my_region_ids())))
    or station_id in (select id from stations where subsede_id in (select my_subsede_ids()))
  );

-- ============================================================
-- Bloquear UPDATE directo hacia estados de separacion (sin motivo)
-- ============================================================

create or replace function block_direct_personnel_separation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('renuncia', 'baja', 'pase', 'reserva') and old.status is distinct from new.status then
    if current_setting('siger4.via_change_personnel_status', true) is distinct from 'true' then
      raise exception 'Para pasar a renuncia, baja, pase o reserva hay que usar el flujo correspondiente (requiere un motivo obligatorio).';
    end if;
  end if;
  return new;
end;
$$;

comment on function block_direct_personnel_separation() is 'Impide pasar personnel.status a renuncia/baja/pase/reserva via UPDATE directo (sin motivo). Solo change_personnel_status() puede hacerlo.';

create trigger trg_block_direct_personnel_separation
  before update on personnel
  for each row execute function block_direct_personnel_separation();

create or replace function change_personnel_status(
  p_personnel_id uuid,
  p_new_status personnel_status,
  p_reason text
)
returns personnel
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person personnel;
  v_actor uuid;
begin
  if p_new_status not in ('renuncia', 'baja', 'pase', 'reserva') then
    raise exception 'change_personnel_status solo se usa para renuncia, baja, pase o reserva. Para otros estados, actualizá el integrante normalmente.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'El motivo es obligatorio para este cambio de estado.';
  end if;

  select * into v_person from personnel where id = p_personnel_id;
  if v_person.id is null then
    raise exception 'Integrante no encontrado.';
  end if;

  -- Misma autorizacion que personnel_write_admin_regional_station (RLS): se
  -- revalida aca porque esta funcion es SECURITY DEFINER y bypasea RLS.
  if not (
    is_informatica_r4()
    or (is_regional_role() and v_person.station_id in (select id from stations where region_id in (select my_region_ids())))
    or (v_person.station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  ) then
    raise exception 'No tenés permiso para cambiar el estado de este integrante.';
  end if;

  v_actor := current_profile_id();

  insert into personnel_status_history (personnel_id, previous_status, new_status, reason, changed_by_profile_id, station_id)
  values (p_personnel_id, v_person.status, p_new_status, trim(p_reason), v_actor, v_person.station_id);

  perform set_config('siger4.via_change_personnel_status', 'true', true);
  update personnel set status = p_new_status, observations = coalesce(observations || E'\n', '') || '[' || p_new_status || '] ' || trim(p_reason)
  where id = p_personnel_id
  returning * into v_person;
  perform set_config('siger4.via_change_personnel_status', 'false', true);

  return v_person;
end;
$$;

comment on function change_personnel_status(uuid, personnel_status, text) is 'Unico camino para pasar un integrante a renuncia/baja/pase/reserva: exige motivo no vacio, registra personnel_status_history (quien/cuando/motivo/cuartel) y agrega el motivo a observations.';

revoke all on function change_personnel_status(uuid, personnel_status, text) from public;
grant execute on function change_personnel_status(uuid, personnel_status, text) to authenticated;

revoke all on function block_direct_personnel_separation() from public;
