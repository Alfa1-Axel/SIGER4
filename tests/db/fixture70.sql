-- Fixture común de las pruebas de la tanda 70 (v1.14.0). Se incluye con \i
-- DENTRO de una transacción abierta (begin;) y deja el escenario armado.
--   R   la Regional.  S1 Villa del Rosario, S2 Río Segundo (de R); S3 Otra Regional (R2).
--   admin / integ   Informática (informatica_r4 / integrante_informatica).
--   secreg          Secretario Regional (R).
--   comun           Presidente de CD de S1.
--   cargaS1         usuario de carga de S1.
--   jefe            usuario de carga de S2.
--   inv1            Invitado de S1.   invr  Invitado con la Regional R.
--   sinrol          usuario sin ningún rol.
--   fuego / mfuego  coordinador / integrante de Fuego (solo departamento).
--   forestal        integrante de Forestal (solo departamento).

create schema if not exists t;
grant usage on schema t to authenticated, anon;
create or replace function t.ok(label text, cond boolean) returns text language sql as $$
  select case when coalesce(cond, false) then 'PASS  ' else 'FAIL  ' end || label
$$;
create or replace function t.login(n text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = lower(n) || '@x'), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create or replace function t.prof(n text) returns uuid language sql stable security definer as $$
  select p.id from public.profiles p join auth.users u on u.id = p.auth_user_id where u.email = lower(n) || '@x'
$$;
create or replace function t.dep(n text) returns uuid language sql stable security definer as $$
  select id from public.departments where lower(btrim(name)) = n
$$;
grant execute on all functions in schema t to authenticated, anon;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
create or replace function pg_temp.rows_changed(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Las funciones de ayuda de las pruebas las llaman los roles de la API: con 0116 las funciones nuevas ya no nacen ejecutables por PUBLIC.
grant execute on function pg_temp.sqlstate_of(text) to public;
grant execute on function pg_temp.rows_changed(text) to public;

insert into regions (id, name, code) values ('eeee0000-0000-4000-8000-000000000002', 'Otra Regional', 'R2')
  on conflict do nothing;

insert into stations (id, region_id, name, code) values
  ('aaaa0000-0000-4000-8000-000000000001', (select id from regions where id <> 'eeee0000-0000-4000-8000-000000000002' order by name limit 1), 'Villa del Rosario', 'VDR'),
  ('aaaa0000-0000-4000-8000-000000000002', (select id from regions where id <> 'eeee0000-0000-4000-8000-000000000002' order by name limit 1), 'Río Segundo', 'RSE'),
  ('aaaa0000-0000-4000-8000-000000000003', 'eeee0000-0000-4000-8000-000000000002', 'Otra Regional S3', 'OR3');

create or replace function pg_temp.names() returns text[] language sql as $$
  select array['admin','integ','secreg','comun','cargaS1','jefe','inv1','invr','sinrol','fuego','mfuego','forestal']
$$;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid, lower(n) || '@x'
from unnest(pg_temp.names()) with ordinality as u(n, i);

insert into profiles (id, auth_user_id, full_name, email, region_id, station_id)
select ('10000000-0000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid,
       n, lower(n) || '@x',
       case when n in ('secreg','invr') then (select id from regions where id <> 'eeee0000-0000-4000-8000-000000000002' order by name limit 1) else null end,
       case when n in ('comun','inv1','cargaS1') then 'aaaa0000-0000-4000-8000-000000000001'::uuid else null end
from unnest(pg_temp.names()) with ordinality as u(n, i);

alter table user_roles disable trigger trg_protect_super_admin_user_roles;
insert into user_roles (profile_id, role) values
  (t.prof('admin'), 'informatica_r4'),
  (t.prof('integ'), 'integrante_informatica'),
  (t.prof('secreg'), 'secretario_regional'),
  (t.prof('comun'), 'presidente_cuartel'),
  (t.prof('cargas1'), 'usuario_carga_cuartel'),
  (t.prof('jefe'), 'usuario_carga_cuartel'),
  (t.prof('inv1'), 'invitado'),
  (t.prof('invr'), 'invitado');
alter table user_roles enable trigger trg_protect_super_admin_user_roles;
insert into user_scopes (profile_id, scope_type, station_id) values (t.prof('jefe'), 'station', 'aaaa0000-0000-4000-8000-000000000002');

update departments set coordinator_profile_id = t.prof('fuego') where id = t.dep('fuego');
insert into department_members (department_id, profile_id) values
  (t.dep('fuego'), t.prof('mfuego')),
  (t.dep('forestal'), t.prof('forestal'));
update departments set is_active = true where id in (t.dep('fuego'), t.dep('forestal'), t.dep('fasme'));
