-- SIGER4 - Simplificar el enum role_key
-- Antes (15 valores): informatica_r4, coordinador_informatica, integrante_informatica,
--   director_escuela, instructor, presidente_regional, secretario_regional,
--   presidente_cuartel, jefe_cuerpo_activo, usuario_carga_cuartel, secretario_comision,
--   bombero, aspirante, administrativo, invitado
-- Ahora (11 valores): informatica_r4, integrante_informatica, director_escuela,
--   instructor, secretario_regional, presidente_cuartel, jefe_cuerpo_activo,
--   usuario_carga_cuartel, secretario_comision, administrativo, invitado
--
-- Cambios organizacionales (confirmados por el usuario):
--  - coordinador_informatica se fusiona con informatica_r4 (un solo rol admin).
--  - presidente_regional desaparece: director_escuela pasa a ser tambien la maxima
--    autoridad regional (ademas de su rol en la Escuela).
--  - secretario_regional se mantiene.
--  - bombero y aspirante se eliminan como roles.
--
-- Postgres no permite eliminar valores de un enum existente: se crea un tipo nuevo,
-- se migran los datos con un mapeo defensivo y se reemplaza la columna (mismo patron
-- que 0006_station_status_simplify.sql).
--
-- IMPORTANTE (a diferencia de 0006): has_role(check_role role_key) toma el enum
-- como parametro. Al renombrar el tipo, has_role queda atada a role_key_old por su
-- firma, y 8 policies que la llaman (has_role('presidente_cuartel'), etc.) quedan
-- dependiendo de esa funcion/tipo. "create or replace function" con el mismo
-- nombre pero apuntando a role_key NO reemplaza la version vieja porque la firma
-- (tipo de parametro) es distinta: crea una funcion sobrecargada aparte y deja la
-- vieja intacta. Por eso hay que borrar esas 8 policies y la funcion vieja ANTES
-- de tocar el tipo, y recrear todo al final contra el tipo nuevo.

drop policy if exists "stations_select_scope" on stations;
drop policy if exists "stations_update_admin_regional_or_own" on stations;
drop policy if exists "attendance_write_admin_regional_station" on attendance_summaries;
drop policy if exists "attendance_update_admin_regional_station" on attendance_summaries;
drop policy if exists "interventions_write_admin_regional_station" on intervention_summaries;
drop policy if exists "interventions_update_admin_regional_station" on intervention_summaries;
drop policy if exists "vehicles_write_admin_regional_station" on vehicles;
drop policy if exists "documents_write_admin_regional_station" on documents;

drop function if exists has_role(role_key);

alter type role_key rename to role_key_old;

create type role_key as enum (
  'informatica_r4',
  'integrante_informatica',
  'director_escuela',
  'instructor',
  'secretario_regional',
  'presidente_cuartel',
  'jefe_cuerpo_activo',
  'usuario_carga_cuartel',
  'secretario_comision',
  'administrativo',
  'invitado'
);

alter table user_roles
  alter column role type role_key
  using (
    case role::text
      when 'coordinador_informatica' then 'informatica_r4'
      when 'presidente_regional' then 'director_escuela'
      -- bombero y aspirante no tienen equivalente directo: no deberia existir
      -- ninguna fila con estos valores hoy, pero si existiera se resguarda como
      -- 'invitado' para no romper la migracion y quedar disponible para revision
      -- manual del administrador.
      when 'bombero' then 'invitado'
      when 'aspirante' then 'invitado'
      else role::text
    end
  )::role_key;

drop type role_key_old;

-- ---------------- Helper functions: actualizar listas de roles ----------------

create function has_role(check_role role_key)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and ur.role = check_role
  );
$$;

create or replace function is_informatica_r4()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and ur.role in ('informatica_r4', 'integrante_informatica')
  );
$$;

comment on function is_informatica_r4() is 'Devuelve true si el usuario pertenece al Dpto. de Informatica y Estadistica R4 (administrador maximo del sistema). coordinador_informatica se fusiono con informatica_r4.';

create or replace function is_regional_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and ur.role in ('secretario_regional', 'director_escuela')
  );
$$;

comment on function is_regional_role() is 'Devuelve true si el usuario tiene autoridad de alcance regional (secretario_regional o director_escuela). presidente_regional se elimino: director_escuela paso a ser la maxima autoridad regional.';

create or replace function is_escuela_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.profile_id
    where p.auth_user_id = auth.uid()
      and ur.role in ('director_escuela', 'instructor')
  );
$$;

-- ---------------- Recrear las 8 policies borradas al inicio ----------------
-- Mismo texto exacto que 0003_rls_policies.sql; al recrearse ahora quedan atadas
-- a la funcion has_role() y al tipo role_key vigentes (los nuevos).

create policy "stations_select_scope" on stations
  for select using (
    is_informatica_r4()
    or is_regional_role() and region_id in (select my_region_ids())
    or id in (select my_station_ids())
    or has_role('invitado') and id in (select my_station_ids())
  );

create policy "stations_update_admin_regional_or_own" on stations
  for update using (
    is_informatica_r4()
    or (is_regional_role() and region_id in (select my_region_ids()))
    or (id in (select my_station_ids()) and (
      has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel')
    ))
  );

create policy "attendance_write_admin_regional_station" on attendance_summaries
  for insert with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "attendance_update_admin_regional_station" on attendance_summaries
  for update using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "interventions_write_admin_regional_station" on intervention_summaries
  for insert with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "interventions_update_admin_regional_station" on intervention_summaries
  for update using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "vehicles_write_admin_regional_station" on vehicles
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('jefe_cuerpo_activo') or has_role('presidente_cuartel')
    ))
  );

create policy "documents_write_admin_regional_station" on documents
  for all using (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  )
  with check (
    is_informatica_r4()
    or is_regional_role()
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision')
    ))
  );
