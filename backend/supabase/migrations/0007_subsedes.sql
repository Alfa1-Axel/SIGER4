-- SIGER4 - Subsedes: nuevo nivel jerarquico entre Regional y Cuartel
-- Estructura: Regional 4 -> Subsede (Las Varillas, Luque, Rio Primero) -> Cuarteles
--
-- Cada cuartel pasa a pertenecer a una subsede (ademas de a su region, que ya tenia).
-- subsede_id se agrega como nullable porque aun no existen cuarteles reales cargados
-- en la base en produccion (verificar con `select count(*) from stations;` antes de
-- correr este script: si da 0, no hace falta backfill).

create table if not exists subsedes (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (region_id, code)
);

comment on table subsedes is 'Subsedes de una regional (ej. SubSede Las Varillas, Subsede Luque, Subsede Rio Primero). Cada cuartel pertenece a una subsede.';

alter table stations
  add column if not exists subsede_id uuid references subsedes(id) on delete restrict;

comment on column stations.subsede_id is 'Subsede a la que pertenece el cuartel. Nullable por ahora (no hay cuarteles cargados aun); recomendado hacerlo obligatorio en la UI de carga.';

-- ---------------- RLS: subsedes ----------------
-- Mismo criterio que regions: dato de referencia, lectura abierta a autenticados,
-- escritura solo para informatica_r4.

alter table subsedes enable row level security;

create policy "subsedes_select_authenticated" on subsedes
  for select using (auth.role() = 'authenticated');

create policy "subsedes_write_admin" on subsedes
  for all using (is_informatica_r4()) with check (is_informatica_r4());

-- ---------------- DATOS INICIALES: Subsedes de Regional 4 ----------------

insert into subsedes (region_id, name, code)
select r.id, v.name, v.code
from regions r
cross join (
  values
    ('SubSede Las Varillas', 'LV'),
    ('Subsede Luque', 'LQ'),
    ('Subsede Rio Primero', 'RP')
) as v(name, code)
where r.code = 'R4'
on conflict (region_id, code) do nothing;
