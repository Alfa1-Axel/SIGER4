-- SIGER4 - Alta de Miembros de Departamento por el Coordinador de su departamento (v1.17.0)
--
-- Un Coordinador de Departamento puede dar de alta usuarios nuevos, pero SOLO como Miembros de
-- Departamento y SOLO de los departamentos que él coordina. La cuenta de acceso la crea la Edge
-- Function admin-create-user (hace falta la clave de servicio de Supabase Auth); esta migración suma
-- la parte de la base, que NO depende de lo que haga la función:
--
--   record_delegated_member_creation(actor, perfil_nuevo, departamentos)
--     1. Revisa, ya creado todo, que se cumpla la regla: el actor está activo y tiene el rol
--        Coordinador de Departamento; coordina (departments.coordinator_profile_id) cada uno de los
--        departamentos pedidos y están activos; el perfil nuevo está activo, tiene cuenta de acceso,
--        no tiene cuartel, tiene UN solo rol (Miembro de Departamento), UN solo alcance (Regional) y es
--        miembro exactamente de esos departamentos y de ninguno más.
--     2. Aplica un tope diario de altas por coordinador (30 por día), para que una cuenta de
--        coordinador comprometida no pueda llenar el sistema de usuarios.
--     3. Deja la trazabilidad: una fila de Auditoría por departamento (acción "delegated_create")
--        con quién creó la cuenta, a quién y para qué departamento. Informática ya recibe sus avisos
--        de "Usuario creado", rol y alcance por los disparadores de siempre (no se duplican).
--   Si algo no se cumple, la función falla y la Edge Function revierte lo creado (no queda ni la
--   cuenta ni el perfil).
--
-- La función solo la puede ejecutar la clave de servicio (service_role): no queda expuesta a la API de
-- usuarios (ni authenticated ni anon).
--
-- No cambia ninguna política de RLS: la inserción de la pertenencia al departamento (department_members)
-- la hace la Edge Function con la sesión del propio coordinador, de modo que la RLS existente
-- (coordinates_department) también impide agregar a otros departamentos.
--
-- Es idempotente: se puede volver a correr. No modifica datos.
set client_encoding = 'UTF8';

create or replace function record_delegated_member_creation(
  p_actor_profile_id uuid,
  p_new_profile_id uuid,
  p_department_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_limit constant integer := 30;
  v_actor record;
  v_new record;
  v_dept record;
  v_distinct uuid[];
  v_created_today integer;
  v_roles text[];
  v_scopes text[];
  v_memberships uuid[];
begin
  if p_actor_profile_id is null or p_new_profile_id is null or p_department_ids is null or coalesce(array_length(p_department_ids, 1), 0) = 0 then
    raise exception 'Faltan datos para registrar el alta delegada.' using errcode = '22023';
  end if;

  select array_agg(distinct d) into v_distinct from unnest(p_department_ids) as d where d is not null;
  if coalesce(array_length(v_distinct, 1), 0) <> array_length(p_department_ids, 1) then
    raise exception 'La lista de departamentos tiene repetidos o vacíos.' using errcode = '22023';
  end if;
  if array_length(v_distinct, 1) > 10 then
    raise exception 'Demasiados departamentos en un mismo alta.' using errcode = '22023';
  end if;

  -- Quien da de alta.
  select p.id, p.full_name, p.is_active into v_actor from profiles p where p.id = p_actor_profile_id;
  if v_actor.id is null or v_actor.is_active is not true then
    raise exception 'Quien da de alta no tiene una cuenta activa.' using errcode = '42501';
  end if;
  if not exists (select 1 from user_roles where profile_id = p_actor_profile_id and role = 'coordinador_departamento') then
    raise exception 'Quien da de alta no es Coordinador de Departamento.' using errcode = '42501';
  end if;

  -- Cada departamento: lo coordina y está activo.
  for v_dept in
    select d.id, d.name, d.is_active, d.coordinator_profile_id
    from departments d
    where d.id = any (v_distinct)
  loop
    if v_dept.coordinator_profile_id is distinct from p_actor_profile_id then
      raise exception 'No coordinás el departamento "%".', v_dept.name using errcode = '42501';
    end if;
    if v_dept.is_active is not true then
      raise exception 'El departamento "%" está inactivo.', v_dept.name using errcode = '42501';
    end if;
  end loop;
  if (select count(*) from departments d where d.id = any (v_distinct)) <> array_length(v_distinct, 1) then
    raise exception 'Alguno de los departamentos no existe.' using errcode = '22023';
  end if;

  -- La cuenta nueva: Miembro de Departamento y nada más.
  select p.id, p.full_name, p.is_active, p.auth_user_id, p.station_id, p.region_id into v_new from profiles p where p.id = p_new_profile_id;
  if v_new.id is null then
    raise exception 'No se encontró la cuenta nueva.' using errcode = '22023';
  end if;
  if v_new.is_active is not true or v_new.auth_user_id is null or v_new.station_id is not null then
    raise exception 'La cuenta nueva no cumple lo esperado (activa, con acceso y sin cuartel).' using errcode = '42501';
  end if;

  select coalesce(array_agg(role::text order by role::text), array[]::text[]) into v_roles from user_roles where profile_id = p_new_profile_id;
  if v_roles <> array['miembro_departamento'] then
    raise exception 'El alta delegada solo puede dejar el rol Miembro de Departamento.' using errcode = '42501';
  end if;

  select coalesce(array_agg(scope_type::text order by scope_type::text), array[]::text[]) into v_scopes from user_scopes where profile_id = p_new_profile_id;
  if v_scopes <> array['region'] then
    raise exception 'El alta delegada solo puede dejar el alcance Regional.' using errcode = '42501';
  end if;

  select coalesce(array_agg(department_id order by department_id), array[]::uuid[]) into v_memberships from department_members where profile_id = p_new_profile_id;
  if v_memberships <> (select array_agg(d order by d) from unnest(v_distinct) as d) then
    raise exception 'La cuenta nueva debe ser miembro exactamente de los departamentos pedidos.' using errcode = '42501';
  end if;

  -- Tope diario por coordinador (sin contar esta alta, que todavía no se registró).
  select count(distinct record_id) into v_created_today
  from audit_logs
  where actor_profile_id = p_actor_profile_id
    and action = 'delegated_create'
    and table_name = 'profiles'
    and created_at > now() - interval '1 day';
  if v_created_today >= c_daily_limit then
    raise exception 'Llegaste al tope de % altas por día. Para dar de alta a más personas, pedile a Informática y Estadística.', c_daily_limit using errcode = '54000';
  end if;

  -- Trazabilidad: una fila por departamento.
  insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, department_id)
  select
    p_actor_profile_id,
    'delegated_create',
    'profiles',
    p_new_profile_id::text,
    null,
    jsonb_build_object(
      'full_name', v_new.full_name,
      'created_by', v_actor.full_name,
      'created_by_role', 'coordinador_departamento',
      'role', 'miembro_departamento',
      'department_id', d.id,
      'department_name', d.name
    ),
    v_new.region_id,
    d.id
  from departments d
  where d.id = any (v_distinct)
  order by d.name;
end;
$$;

comment on function record_delegated_member_creation(uuid, uuid, uuid[]) is 'Alta de un Miembro de Departamento por el coordinador de su departamento (0120): comprueba que la cuenta nueva y el actor cumplen la regla (falla si no) y registra la trazabilidad en la Auditoría. Solo la ejecuta la Edge Function admin-create-user con la clave de servicio.';

revoke all on function record_delegated_member_creation(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function record_delegated_member_creation(uuid, uuid, uuid[]) to service_role;
