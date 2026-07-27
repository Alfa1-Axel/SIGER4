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
-- Mismas firmas, mismos nombres, solo cambia el `in (...)` interno; no hace falta
-- tocar 0003_rls_policies.sql porque las policies llaman a estas funciones por
-- nombre, nunca inline el `role in (...)`.

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
