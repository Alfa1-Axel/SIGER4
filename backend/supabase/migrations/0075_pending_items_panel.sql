-- SIGER4 - Panel de Pendientes por Rol
--
-- Objetivo: mostrarle a cada usuario una lista de tareas/pendientes
-- relevantes segun su rol y alcance, sin crear un sistema de tareas nuevo
-- -- 100% derivado de datos que YA existen (station_compliance,
-- calendar_events, inventory_loan_requests, documents pendientes,
-- department_activity_reports, courses, profiles). No se inventa ni estima
-- ningun dato: cada fila del resultado corresponde a una fila real de otra
-- tabla, con su propio id, para poder linkear directo a "ver/resolver".
--
-- Disenio: una sola funcion get_pending_items(), SECURITY DEFINER STABLE,
-- que arma el resultado con UNION ALL de subqueries -- una por tipo de
-- pendiente, cada una scopeada de forma independiente reutilizando los
-- MISMOS helpers que ya usa el resto del sistema para RLS
-- (is_informatica_r4(), is_regional_role(), is_escuela_role(),
-- my_station_ids(), my_region_ids(), current_profile_id()) -- asi que el
-- alcance de "que pendientes ve cada quien" nunca puede desincronizarse de
-- lo que esa persona ya puede ver/hacer en el resto de la app: si un
-- pendiente linkea a una pantalla que esa persona no puede ver, es porque
-- se filtro mal en esta funcion, un bug a corregir aca, no una capa de
-- permisos nueva y paralela.
--
-- No envia ninguna notificacion nueva (pedido explicito: "esto es solo
-- panel visual" por ahora) -- ver el comentario final sobre el enganche
-- futuro con notifications si algun tipo de pendiente amerita recordatorio
-- mas adelante.

create or replace function get_pending_items()
returns table (
  item_key text,
  title text,
  description text,
  priority text,
  module text,
  link_path text,
  sort_key timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_is_admin boolean := is_informatica_r4();
  v_is_regional boolean := is_regional_role();
  v_is_escuela boolean := is_escuela_role();
  v_profile_id uuid := current_profile_id();
begin
  -- ============================================================
  -- 1. Semaforo de cuarteles en rojo/amarillo (station_compliance,
  --    migracion 0052) -- ya viene scopeado solo (security_invoker=true,
  --    hereda RLS real de stations vía stations_select_scope), asi que acá
  --    no hace falta agregar ningun filtro de alcance adicional: lo que
  --    devuelve station_compliance YA es exactamente lo que este usuario
  --    puede ver.
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
  where sc.compliance_status in ('rojo', 'amarillo');

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
      v_is_admin
      or c.event_type in ('escuela', 'capacitacion')
      or (v_is_regional and c.region_id in (select my_region_ids()))
      or (v_is_escuela and c.region_id in (select my_region_ids()))
      or c.station_id in (select my_station_ids())
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
      or d.coordinator_profile_id = v_profile_id
      or exists (select 1 from department_members dm where dm.department_id = d.id and dm.profile_id = v_profile_id)
    );
end;
$$;

comment on function get_pending_items() is 'Panel de Pendientes por Rol (Dashboard): lista normalizada de tareas/pendientes derivados 100% de datos reales existentes (station_compliance, inventory_loan_requests, calendar_events, documents, profiles, courses, department_activity_reports) -- nunca inventa ni estima nada. Cada tipo de pendiente reutiliza el MISMO alcance que ya rige esa pantalla en el resto del sistema (is_informatica_r4/is_regional_role/is_escuela_role/my_station_ids/my_region_ids), asi que un pendiente nunca deberia linkear a algo que ese usuario no pueda ver. No dispara ninguna notificacion -- es solo un panel visual (ver DEPLOYMENT.md, seccion del Panel de Pendientes, para el detalle de cada criterio y el enganche futuro con notifications si hiciera falta).';

revoke all on function get_pending_items() from public;
grant execute on function get_pending_items() to authenticated;
