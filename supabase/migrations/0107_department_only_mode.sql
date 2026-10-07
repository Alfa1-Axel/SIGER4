-- SIGER4 - Modo departamento: quien solo es Coordinador o Miembro de
-- Departamento no recibe datos de módulos que su rol no usa
--
-- Modelo (sin tablas nuevas):
--   - "Solo departamento": la persona tiene al menos un rol de departamento
--     (coordinador_departamento, miembro_departamento) y ningún otro rol.
--     Con un rol más (Informática, Escuela, un cuartel...) los permisos se
--     suman y todo sigue como antes: esta migración no le cambia nada.
--   - La pantalla ya no le ofrece cuarteles, mapa, Escuela, Documentos,
--     Inventario, Reportes ni Usuarios (menú, Inicio, búsqueda y URL directa).
--     Acá la base hace lo mismo: aunque alguien llame a la API a mano, esas
--     tablas no le devuelven filas.
--
-- Cómo se aplica: políticas RESTRICTIVAS de lectura. Una política
-- restrictiva se suma con AND a las que ya existen, así que solo puede
-- cerrar acceso, nunca abrirlo: ningún permiso de nadie más se relaja.
--
-- Qué sigue viendo en modo departamento (sin cambios):
--   - sus departamentos, miembros, informes, actas, archivos, eventos y avisos
--     (0098, 0103 y 0106);
--   - los avales de su departamento si lo coordina (0095 y 0097);
--   - sus notificaciones y las generales sin destino en un módulo cerrado;
--   - su perfil, sus roles y las Regionales y subsedes (datos de referencia).
set client_encoding = 'UTF8';

-- ---------------- Helper ----------------

create or replace function is_department_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from user_roles r
      where r.profile_id = current_profile_id()
        and r.role in ('coordinador_departamento', 'miembro_departamento')
    )
    and not exists (
      select 1 from user_roles r
      where r.profile_id = current_profile_id()
        and r.role not in ('coordinador_departamento', 'miembro_departamento')
    );
$$;

comment on function is_department_only() is 'Modo departamento: la persona tiene al menos un rol de departamento y ningún otro rol (current_profile_id() es null si el perfil está inactivo). Espejo de isDepartmentOnly() en src/lib/moduleAccess.ts.';

-- anon también: las políticas restrictivas de abajo la evalúan en cualquier
-- consulta, y para quien no inició sesión devuelve false (sin perfil).
revoke all on function is_department_only() from public;
grant execute on function is_department_only() to anon, authenticated;

-- ---------------- Módulos completos que el modo departamento no usa ----------------
-- Cuarteles y todo lo que cuelga de un cuartel, Documentos, Escuela,
-- Inventario y el mapa. Solo se cierra la lectura: no hay escritura abierta
-- en estas tablas para quien no tiene un rol de cuartel, Regional o Escuela.

do $$
declare
  t text;
begin
  foreach t in array array[
    'stations',
    'vehicles',
    'vehicle_status_history',
    'personnel',
    'personnel_status_history',
    'attendance_summaries',
    'intervention_summaries',
    'station_history_events',
    'documents',
    'document_versions',
    'document_folders',
    'courses',
    'course_stations',
    'inventory_items',
    'inventory_item_history',
    'inventory_loan_requests',
    'map_reference_points'
  ]
  loop
    -- Solo tablas (las vistas heredan la RLS de sus tablas).
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')
    ) then
      execute format('drop policy if exists %I on public.%I', t || '_department_only_block', t);
      execute format(
        'create policy %I on public.%I as restrictive for select using (not is_department_only())',
        t || '_department_only_block', t
      );
    end if;
  end loop;
end $$;

-- Archivos de Documentos (el bucket de informes de departamento y el de
-- avales tienen sus propias políticas y no se tocan).
drop policy if exists "documents_storage_department_only_block" on storage.objects;
create policy "documents_storage_department_only_block" on storage.objects
  as restrictive for select
  using (bucket_id <> 'documents' or not is_department_only());

-- ---------------- Calendario: solo eventos de departamento ----------------
-- Los de Escuela, Regional y cuarteles se los abren otras reglas (por
-- ejemplo, los eventos de Escuela los ve cualquier persona con perfil).

drop policy if exists "calendar_events_department_only_read" on calendar_events;
create policy "calendar_events_department_only_read" on calendar_events
  as restrictive for select
  using (department_id is not null or not is_department_only());

-- ---------------- Notificaciones ----------------
-- Siguen todas las dirigidas a la persona (incluidos los avisos de su
-- departamento, que son personales) y los avisos generales sin enlace o con
-- enlace a un módulo abierto. Se cierran los avisos generales (para toda la
-- Regional, subsede o cuartel) que llevan a un módulo cerrado: un curso
-- nuevo, una circular, un préstamo, un evento regional. Los prefijos son los
-- de los módulos cerrados en src/lib/moduleAccess.ts.

drop policy if exists "notifications_department_only_read" on notifications;
create policy "notifications_department_only_read" on notifications
  as restrictive for select
  using (
    not is_department_only()
    or profile_id is not null
    or link_path is null
    or link_path !~ '^/(cuarteles|vehiculos|asistencia|intervenciones|personal|historial|mapa|calendario|escuela|documentos|inventario|reportes|usuarios|auditoria)(/|\?|#|$)'
  );

-- ---------------- Pendientes del Inicio (get_pending_items) ----------------
-- Misma función de 0106 con tres cambios:
--   - Cuarteles: el semáforo se filtra con el alcance real de cada persona
--     (antes la función, al ser SECURITY DEFINER, devolvía los cuarteles en
--     rojo o amarillo de TODA la base a cualquier usuario: nombre del cuartel
--     y un enlace que no podía abrir).
--   - Préstamos y eventos Regionales, de Escuela o de cuarteles: no se
--     devuelven en modo departamento. Sí los eventos de sus departamentos y
--     los pendientes de sus departamentos (secciones 4 y 8).
--   - Sin cambios para el resto de las secciones ni para los demás roles,
--     salvo lo que dejaba de ver por el alcance de Cuarteles.

create or replace function get_pending_items()
 RETURNS TABLE(item_key text, title text, description text, priority text, module text, link_path text, sort_key timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := is_informatica_r4();
  v_is_regional boolean := is_regional_role();
  v_is_escuela boolean := is_escuela_role();
  v_profile_id uuid := current_profile_id();
  v_department_only boolean := is_department_only();
begin
  -- ============================================================
  -- 1. Semaforo de cuarteles en rojo/amarillo (station_compliance,
  --    migracion 0052). Esta función es SECURITY DEFINER: la vista
  --    station_compliance se lee con los permisos de quien la creó y NO
  --    aplica la RLS de quien consulta, así que el alcance se repite acá, con
  --    el mismo criterio que stations_select_scope: Informática todos; roles
  --    regionales y de Escuela, los de su Regional; el resto, su cuartel y su
  --    subsede. Quien está en modo departamento no recibe ninguno.
  -- ============================================================
  return query
  select
    'compliance_' || sc.station_id::text,
    case when sc.compliance_status = 'rojo' then 'Cuartel desactualizado: ' || sc.station_name
         else 'Cuartel con carga parcial: ' || sc.station_name end,
    case
      when not sc.has_contact_info then 'Falta cargar contacto institucional (teléfono o email).'
      when not sc.has_personnel then 'Falta cargar personal activo.'
      when not sc.has_vehicles then 'Falta cargar vehículos.'
      when not sc.attendance_recent then 'Sin asistencia registrada en los últimos 45 días.'
      when not sc.interventions_recent then 'Sin intervenciones registradas en los últimos 45 días.'
      else 'Sin documentos institucionales cargados.'
    end,
    case when sc.compliance_status = 'rojo' then 'alta' else 'media' end,
    'Cuarteles',
    '/cuarteles/' || sc.station_id::text,
    sc.last_relevant_update_at
  from station_compliance sc
  join stations st on st.id = sc.station_id
  where sc.compliance_status in ('rojo', 'amarillo')
    and not v_department_only
    and (
      v_is_admin
      or ((v_is_regional or v_is_escuela) and st.region_id in (select my_region_ids()))
      or st.id in (select my_station_ids())
      or st.subsede_id in (select my_subsede_ids())
    );

  -- ============================================================
  -- 2. Solicitudes de préstamo pendientes de aprobar -- solo para quien
  --    puede aprobarlas: admin, is_regional_role(), o responsable puntual
  --    del elemento/la solicitud (mismo criterio que
  --    inventory_loan_requests_update_managers, migración 0057).
  -- ============================================================
  return query
  select
    'loan_pending_' || l.id::text,
    'Solicitud de préstamo pendiente: ' || i.name,
    'Solicitada por ' || s.name || '. Requiere aprobación o rechazo.',
    'media',
    'Solicitudes de Préstamo',
    '/inventario/solicitudes/' || l.id::text,
    l.requested_from
  from inventory_loan_requests l
  join inventory_items i on i.id = l.inventory_item_id
  join stations s on s.id = l.requesting_station_id
  where l.status = 'pendiente'
    and not v_department_only
    and (
      v_is_admin
      or v_is_regional
      or i.responsible_profile_id = v_profile_id
      or l.responsible_profile_id = v_profile_id
    );

  -- ============================================================
  -- 3. Préstamos retirados por vencer (próximas 48hs) o ya vencidos --
  --    mismo criterio de destinatarios que send_loan_return_reminders()
  --    (migración 0068): el cuartel solicitante y el responsable puntual.
  --    Acá se agranda un poco la ventana de "por vencer" (48hs en vez de
  --    24hs) porque este panel no es un recordatorio en el momento exacto,
  --    es una foto de "qué falta resolver" que alguien puede mirar en
  --    cualquier momento del día.
  -- ============================================================
  return query
  select
    'loan_overdue_' || l.id::text,
    case when l.expected_return_at < now() then 'Préstamo vencido: ' || i.name
         else 'Préstamo por vencer: ' || i.name end,
    case when l.expected_return_at < now()
      then 'Venció el ' || to_char(l.expected_return_at, 'DD/MM/YYYY HH24:MI') || ' y sigue sin devolverse.'
      else 'Vence el ' || to_char(l.expected_return_at, 'DD/MM/YYYY HH24:MI') || '.'
    end,
    case when l.expected_return_at < now() then 'alta' else 'media' end,
    'Solicitudes de Préstamo',
    '/inventario/solicitudes/' || l.id::text,
    l.expected_return_at
  from inventory_loan_requests l
  join inventory_items i on i.id = l.inventory_item_id
  join stations s on s.id = l.requesting_station_id
  where l.status = 'retirada'
    and l.expected_return_at is not null
    and l.expected_return_at <= now() + interval '48 hours'
    and not v_department_only
    and (
      v_is_admin
      or v_is_regional
      or s.id in (select my_station_ids())
      or i.responsible_profile_id = v_profile_id
      or l.responsible_profile_id = v_profile_id
    );

  -- ============================================================
  -- 4. Eventos de calendario próximos (siguientes 7 días, no cancelados)
  --    dentro del alcance del usuario: su cuartel, su región (si es rol
  --    regional/escuela), o eventos de escuela/capacitación (regional-wide
  --    por definición, visibles para cualquiera). Admin ve todos los
  --    próximos.
  -- ============================================================
  return query
  select
    'event_' || c.id::text,
    'Evento próximo: ' || c.title,
    to_char(c.starts_at, 'DD/MM') || case when c.all_day then ' · todo el día' else ' · ' || to_char(c.starts_at, 'HH24:MI') end,
    'baja',
    'Calendario',
    '/calendario/' || c.id::text,
    c.starts_at
  from calendar_events c
  where c.status = 'programado'
    and c.starts_at between now() and now() + interval '7 days'
    and (
      -- Eventos de departamento (0103): solo para su coordinador e
      -- integrantes, aun para Informática (no son pendientes de todos).
      (c.department_id is not null and c.department_id in (select my_department_ids()))
      or (
        c.department_id is null
        and not v_department_only
        and (
          v_is_admin
          or c.event_type in ('escuela', 'capacitacion')
          or (v_is_regional and c.region_id in (select my_region_ids()))
          or (v_is_escuela and c.region_id in (select my_region_ids()))
          or c.station_id in (select my_station_ids())
        )
      )
    );

  -- ============================================================
  -- 5. Documentos "pending" (fila creada, archivo nunca terminó de subir,
  --    ver createDocument/DocumentoFormPage.tsx) de más de 24hs -- mismo
  --    umbral que cleanup_pending_documents() (migración 0033). Solo
  --    informática puede limpiarlos, así que solo a informática le
  --    interesa como pendiente accionable.
  -- ============================================================
  if v_is_admin then
    return query
    select
      'doc_pending_' || d.id::text,
      'Documento sin archivo subido: ' || d.title,
      'Carga interrumpida hace más de 24hs. Revisar o limpiar desde Documentos.',
      'baja',
      'Documentos',
      '/documentos',
      d.created_at
    from documents d
    where d.storage_path = 'pending'
      and d.deleted_at is null
      and d.created_at < now() - interval '24 hours';
  end if;

  -- ============================================================
  -- 6. Informática: usuarios creados en los últimos 7 días (para revisar
  --    que el alta quedó bien: rol/alcance correctos) y cuarteles sin
  --    ninguna actividad relevante hace más de 30 días (mismo criterio que
  --    el resumen semanal admin, migración 0067 -- reutiliza
  --    last_relevant_update_at de station_compliance en vez de duplicar el
  --    cálculo).
  -- ============================================================
  if v_is_admin then
    return query
    select
      'new_user_' || p.id::text,
      'Usuario nuevo: ' || p.full_name,
      'Creado el ' || to_char(p.created_at, 'DD/MM/YYYY') || '. Confirmar rol y alcance asignados.',
      'baja',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active = true
      and p.created_at >= now() - interval '7 days';

    return query
    select
      'stale_station_' || sc.station_id::text,
      'Cuartel sin actividad reciente: ' || sc.station_name,
      'Sin asistencia, intervenciones ni documentos nuevos hace más de 30 días.',
      'media',
      'Cuarteles',
      '/cuarteles/' || sc.station_id::text,
      sc.last_relevant_update_at
    from station_compliance sc
    where sc.last_relevant_update_at < now() - interval '30 days';
  end if;

  -- ============================================================
  -- 7. Escuela: cursos planificados/en curso con fecha de inicio ya pasada
  --    sin haber pasado a finalizado/cancelado (indicio de que falta
  --    actualizar el estado o cargar asistencia real).
  -- ============================================================
  if v_is_admin or v_is_escuela then
    return query
    select
      'course_stale_' || co.id::text,
      'Curso sin actualizar: ' || co.title,
      case
        when co.status = 'planificado' and co.start_date < current_date then 'La fecha de inicio ya pasó y sigue como "planificado".'
        else 'Sigue "en curso" con fecha de fin ya pasada.'
      end,
      'baja',
      'Escuela',
      '/escuela',
      co.updated_at
    from courses co
    where (
      (co.status = 'planificado' and co.start_date is not null and co.start_date < current_date)
      or (co.status = 'en_curso' and co.end_date is not null and co.end_date < current_date)
    );
  end if;

  -- ============================================================
  -- 8. Departamentos: departamentos donde el usuario es coordinador o
  --    miembro, sin ningún informe de actividad cargado en los últimos 30
  --    días. Admin/is_regional_role() (autoridad total sobre
  --    Departamentos) ven esto para TODOS los departamentos activos, no
  --    solo los propios.
  -- ============================================================
  return query
  select
    'dept_stale_' || d.id::text,
    'Departamento sin actividad reciente: ' || d.name,
    'Sin informes de actividad cargados en los últimos 30 días.',
    'baja',
    'Departamentos',
    '/departamentos/' || d.id::text,
    coalesce((select max(r.created_at) from department_activity_reports r where r.department_id = d.id), d.created_at)
  from departments d
  where d.is_active = true
    and not exists (
      select 1 from department_activity_reports r
      where r.department_id = d.id and r.created_at >= now() - interval '30 days'
    )
    and (
      v_is_admin
      or v_is_regional
      -- Coordinador o miembro con su rol (0106).
      or d.id in (select my_department_ids())
    );

  -- ============================================================
  -- 9. Informática: roles sin su división (0103). Un rol de cuartel sin
  --    cuartel, o un rol de la Regional sin Regional, no ve los datos que le
  --    corresponden. Un departamento activo sin coordinador no tiene quién
  --    lo gestione ni reciba sus avisos.
  -- ============================================================
  if v_is_admin then
    return query
    select
      'role_no_station_' || p.id::text,
      'Rol de cuartel sin cuartel: ' || p.full_name,
      'Tiene un rol de cuartel pero ningún cuartel asignado: no ve los datos de ningún cuartel.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = p.id
          and ur.role in ('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'invitado')
      )
      and p.station_id is null
      and not exists (
        select 1 from user_scopes us
        where us.profile_id = p.id and (us.station_id is not null or us.subsede_id is not null)
      );

    return query
    select
      'role_no_region_' || p.id::text,
      'Rol regional sin Regional: ' || p.full_name,
      'Tiene un rol de la Regional o de la Escuela pero ninguna Regional asignada.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and exists (
        select 1 from user_roles ur
        where ur.profile_id = p.id and ur.role in ('secretario_regional', 'director_escuela', 'instructor')
      )
      and p.region_id is null
      and not exists (select 1 from user_scopes us where us.profile_id = p.id and us.region_id is not null);

    return query
    select
      'dept_no_coordinator_' || d.id::text,
      'Departamento sin coordinador: ' || d.name,
      'Asignale un coordinador para que alguien lo gestione y reciba sus avisos.',
      'media',
      'Departamentos',
      '/departamentos/' || d.id::text,
      d.created_at
    from departments d
    where d.is_active and d.coordinator_profile_id is null;

    -- Roles de departamento (0106): con rol y sin departamento (no ven
    -- ningún departamento), o en un departamento sin su rol (no tienen
    -- acceso a ese departamento).
    return query
    select
      'dept_role_without_department_' || p.id::text,
      'Rol de departamento sin departamento: ' || p.full_name,
      'Tiene el rol Coordinador o Miembro de Departamento pero no figura en ningún departamento con ese rol.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and (
        (
          exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'coordinador_departamento')
          and not exists (select 1 from departments d where d.coordinator_profile_id = p.id)
        )
        or (
          exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'miembro_departamento')
          and not exists (select 1 from department_members dm where dm.profile_id = p.id)
        )
      );

    return query
    select
      'dept_without_role_' || p.id::text,
      'Figura en un departamento sin su rol: ' || p.full_name,
      'Está asignado a un departamento pero no tiene el rol Coordinador o Miembro de Departamento: no ve ese departamento.',
      'media',
      'Usuarios',
      '/usuarios/' || p.id::text,
      p.created_at
    from profiles p
    where p.is_active
      and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role in ('informatica_r4', 'integrante_informatica'))
      and (
        (
          exists (select 1 from departments d where d.coordinator_profile_id = p.id)
          and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'coordinador_departamento')
        )
        or (
          exists (select 1 from department_members dm where dm.profile_id = p.id)
          and not exists (select 1 from user_roles ur where ur.profile_id = p.id and ur.role = 'miembro_departamento')
        )
      );
  end if;
end;
$function$;
