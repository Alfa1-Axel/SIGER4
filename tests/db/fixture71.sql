-- Fixture de la tanda 71 (Avales): se incluye con \i DENTRO de una transacción abierta.
-- Parte de fixture70.sql (Informática, Secretario Regional, Presidente de CD, usuarios de carga,
-- Invitados, sin rol, coordinador y miembros de Fuego, miembro de Forestal) y suma:
--   cesc     Coordinador de Escuela (coordinador_escuela)       sesc  Secretario de Escuela
--   dir      Director de Escuela                                 inst  Instructor
--   scom     Secretario de Comisión (secretario_comision, "Secretario de CD")
--   ret      rol retirado (administrativo)
--   cforestal  coordinador de Forestal                           mfuego2  segundo miembro de Fuego
--   mfasme   miembro de FASME
\i fixture70.sql

create or replace function pg_temp.names71() returns text[] language sql as $$
  select array['cesc','sesc','dir','inst','scom','ret','cforestal','mfuego2','mfasme']
$$;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000004' || lpad(i::text, 2, '0'))::uuid, lower(n) || '@x'
from unnest(pg_temp.names71()) with ordinality as u(n, i);

insert into profiles (id, auth_user_id, full_name, email, region_id, station_id)
select ('10000000-0000-0000-0000-0000000004' || lpad(i::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000004' || lpad(i::text, 2, '0'))::uuid,
       n, lower(n) || '@x',
       case when n in ('dir','inst') then (select id from regions where id <> 'eeee0000-0000-4000-8000-000000000002' order by name limit 1) else null end,
       case when n = 'scom' then 'aaaa0000-0000-4000-8000-000000000001'::uuid else null end
from unnest(pg_temp.names71()) with ordinality as u(n, i);

alter table user_roles disable trigger trg_protect_super_admin_user_roles;
insert into user_roles (profile_id, role) values
  (t.prof('cesc'), 'coordinador_escuela'),
  (t.prof('sesc'), 'secretario_escuela'),
  (t.prof('dir'), 'director_escuela'),
  (t.prof('inst'), 'instructor'),
  (t.prof('scom'), 'secretario_comision'),
  (t.prof('ret'), 'administrativo');
alter table user_roles enable trigger trg_protect_super_admin_user_roles;

update departments set coordinator_profile_id = t.prof('cforestal') where id = t.dep('forestal');
insert into department_members (department_id, profile_id) values
  (t.dep('fuego'), t.prof('mfuego2')),
  (t.dep('fasme'), t.prof('mfasme'))
on conflict do nothing;
