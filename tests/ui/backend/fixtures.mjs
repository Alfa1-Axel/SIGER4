// Datos de ejemplo para capturas visuales (backend simulado).
const now = new Date('2026-10-02T12:00:00-03:00')
const iso = (days, hours = 0) => new Date(now.getTime() + days * 86400000 + hours * 3600000).toISOString()
const date = (days) => iso(days).slice(0, 10)
const realIso = (days, hours = 0) => new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString()

export const REGION = '11111111-1111-4111-8111-111111111111'
export const SUB = ['21111111-1111-4111-8111-111111111111', '22222222-1111-4111-8111-111111111111', '23333333-1111-4111-8111-111111111111']
export const ST = [
  '31111111-1111-4111-8111-111111111111',
  '32222222-1111-4111-8111-111111111111',
  '33333333-1111-4111-8111-111111111111',
  '34444444-1111-4111-8111-111111111111',
  '35555555-1111-4111-8111-111111111111',
]
export const AUTH = {
  admin: 'a0000000-0000-4000-8000-00000000000a',
  coord: 'a0000000-0000-4000-8000-00000000000c',
  fuego: 'a0000000-0000-4000-8000-00000000000e',
  comun: 'a0000000-0000-4000-8000-000000000011',
  integ: 'a0000000-0000-4000-8000-000000000016',
  jefe: 'a0000000-0000-4000-8000-000000000012',
  secre: 'a0000000-0000-4000-8000-000000000013',
  mfuego: 'a0000000-0000-4000-8000-000000000017',
  exm: 'a0000000-0000-4000-8000-000000000018',
  mfor: 'a0000000-0000-4000-8000-000000000019',
  carga: 'a0000000-0000-4000-8000-000000000015',
}
export const PROF = {
  admin: 'b0000000-0000-4000-8000-00000000000a',
  coord: 'b0000000-0000-4000-8000-00000000000c',
  fuego: 'b0000000-0000-4000-8000-00000000000e',
  comun: 'b0000000-0000-4000-8000-000000000011',
  jefe: 'b0000000-0000-4000-8000-000000000012',
  secre: 'b0000000-0000-4000-8000-000000000013',
  instr: 'b0000000-0000-4000-8000-000000000014',
  carga: 'b0000000-0000-4000-8000-000000000015',
  integ: 'b0000000-0000-4000-8000-000000000016',
  mfuego: 'b0000000-0000-4000-8000-000000000017',
  exm: 'b0000000-0000-4000-8000-000000000018',
  mfor: 'b0000000-0000-4000-8000-000000000019',
}
export const DEP = {
  fuego: 'd0000000-0000-4000-8000-000000000001',
  forestal: 'd0000000-0000-4000-8000-000000000002',
  fasme: 'd0000000-0000-4000-8000-000000000003',
}

const base = { created_at: iso(-200), updated_at: iso(-10) }

const profile = (id, authId, full_name, email, extra = {}) => ({
  id,
  auth_user_id: authId,
  full_name,
  email,
  avatar_url: null,
  rank: 'Oficial',
  phone: '0351 4123456',
  position: null,
  seniority_start_date: '2015-03-01',
  region_id: REGION,
  station_id: ST[0],
  is_active: true,
  must_change_password: false,
  weekly_reminder_enabled: true,
  weekly_admin_summary_enabled: true,
  ...base,
  ...extra,
})

const stationNames = ['Villa del Rosario', 'Las Varillas', 'Luque', 'Río Primero', 'Santiago Temple']

export function buildTables() {
  const stations = stationNames.map((name, i) => ({
    id: ST[i],
    region_id: REGION,
    subsede_id: SUB[i % 3],
    name,
    code: `C${i + 1}`,
    address: `Av. Principal ${100 + i * 37}`,
    zone: 'Urbana',
    phone: i === 3 ? null : '03573 42' + (1000 + i),
    whatsapp_phone: null,
    email: i === 3 ? null : `cuartel${i + 1}@example.org`,
    social_media: null,
    description: 'Cuartel de Bomberos Voluntarios.',
    status: i === 4 ? 'no_operativo' : 'operativo',
    response_time_minutes: 6 + i,
    personnel_count: 28 + i * 3,
    vehicles_count: 4 + i,
    founded_year: 1970 + i * 4,
    cover_image_url: null,
    logo_url: null,
    latitude: -31.55 - i * 0.12,
    longitude: -63.53 + i * 0.15,
    map_notes: null,
    ...base,
  }))

  const profiles = [
    profile(PROF.admin, AUTH.admin, 'Alejandro Ríos', 'alejandro.rios@example.org', { position: 'Dpto. Informática y Estadística' }),
    profile(PROF.coord, AUTH.coord, 'María Fernanda López', 'mf.lopez@example.org', { position: 'Coordinadora de Escuela' }),
    profile(PROF.fuego, AUTH.fuego, 'Julián Ortega', 'julian.ortega@example.org', { station_id: ST[1] }),
    profile(PROF.comun, AUTH.comun, 'Lucía Benítez', 'lucia.benitez@example.org', { station_id: ST[2] }),
    profile(PROF.integ, AUTH.integ, 'Sofía Paredes', 'sofia.paredes@example.org', { position: 'Dpto. Informática y Estadística' }),
    profile(PROF.jefe, 'a0000000-0000-4000-8000-000000000012', 'Ramiro Quinteros', 'ramiro.quinteros@example.org', { station_id: ST[0] }),
    profile(PROF.secre, 'a0000000-0000-4000-8000-000000000013', 'Carla Méndez', 'carla.mendez@example.org', { station_id: null }),
    profile(PROF.instr, 'a0000000-0000-4000-8000-000000000014', 'Diego Sosa', 'diego.sosa@example.org', { station_id: ST[3], is_active: false }),
    profile(PROF.carga, 'a0000000-0000-4000-8000-000000000015', 'Natalia Giménez con un nombre bastante largo para probar cortes', 'natalia.gimenez.cuenta.institucional.larga@example.org', { station_id: ST[4], must_change_password: true }),
    profile(PROF.mfuego, 'a0000000-0000-4000-8000-000000000017', 'Martín Aguirre', 'martin.aguirre@example.org', { station_id: ST[3] }),
    // Figura en Fuego pero sin el rol Miembro de Departamento: no tiene acceso (0106).
    profile(PROF.exm, 'a0000000-0000-4000-8000-000000000018', 'Pablo Ruiz', 'pablo.ruiz@example.org', { station_id: ST[4] }),
    // Solo es Miembro de Departamento (Forestal): su único rol.
    profile(PROF.mfor, 'a0000000-0000-4000-8000-000000000019', 'Valeria Funes', 'valeria.funes@example.org', { station_id: null }),
  ]

  const role = (profile_id, r) => ({ id: `${profile_id.slice(0, 8)}-r-${r}`, profile_id, role: r, created_at: iso(-100) })
  const user_roles = [
    role(PROF.admin, 'informatica_r4'),
    role(PROF.coord, 'coordinador_escuela'),
    role(PROF.fuego, 'usuario_carga_cuartel'),
    role(PROF.integ, 'integrante_informatica'),
    role(PROF.comun, 'presidente_cuartel'),
    role(PROF.jefe, 'jefe_cuerpo_activo'),
    role(PROF.secre, 'secretario_regional'),
    role(PROF.instr, 'instructor'),
    role(PROF.carga, 'usuario_carga_cuartel'),
    role(PROF.mfuego, 'usuario_carga_cuartel'),
    // Roles de departamento (0105/0106), sincronizados con sus departamentos.
    role(PROF.fuego, 'coordinador_departamento'),
    role(PROF.mfuego, 'miembro_departamento'),
    role(PROF.jefe, 'coordinador_departamento'),
    role(PROF.jefe, 'miembro_departamento'),
    role(PROF.carga, 'miembro_departamento'),
    role(PROF.exm, 'usuario_carga_cuartel'),
    role(PROF.mfor, 'miembro_departamento'),
  ]
  const user_scopes = [
    { id: 's1', profile_id: PROF.admin, scope_type: 'system', region_id: null, subsede_id: null, station_id: null, created_at: iso(-100) },
    { id: 's2', profile_id: PROF.coord, scope_type: 'escuela', region_id: null, subsede_id: null, station_id: null, created_at: iso(-100) },
    { id: 's3', profile_id: PROF.fuego, scope_type: 'station', region_id: null, subsede_id: null, station_id: ST[1], created_at: iso(-100) },
    { id: 's5', profile_id: PROF.integ, scope_type: 'system', region_id: null, subsede_id: null, station_id: null, created_at: iso(-100) },
    { id: 's4', profile_id: PROF.comun, scope_type: 'station', region_id: null, subsede_id: null, station_id: ST[2], created_at: iso(-100) },
    { id: 's6', profile_id: PROF.mfuego, scope_type: 'station', region_id: null, subsede_id: null, station_id: ST[3], created_at: iso(-100) },
  ]

  const courses = [
    ['Incendios Estructurales Nivel I', 'Fuego', 'en_curso', 42, 24, 4],
    ['Rescate Vehicular', 'Rescate', 'planificado', null, 16, 2],
    ['Primeros Auxilios y RCP', 'Socorrismo', 'finalizado', 58, 12, 2],
    ['Combate de Incendios Forestales', 'Forestal', 'en_curso', 35, 30, 5],
  ].map(([title, category, status, attendees, hours, days], i) => ({
    id: `c0000000-0000-4000-8000-00000000000${i}`,
    region_id: REGION,
    title,
    category,
    status,
    start_date: date(-20 + i * 10),
    end_date: date(10 + i * 10),
    progress_percent: [60, 0, 100, 40][i],
    enrolled_count: 40 + i,
    attendees_count: attendees,
    hours,
    days,
    speakers: 'Cmdte. Pérez, Of. Ayudante Ruiz',
    instructor_profile_id: PROF.instr,
    ...base,
  }))

  const school_departments = [
    { id: DEP.fuego, name: 'Fuego', slug: 'fuego', description: 'Fuego estructural y técnicas de ataque.', is_active: true, created_by_profile_id: null, ...base },
    { id: DEP.forestal, name: 'Forestal', slug: 'forestal', description: null, is_active: true, created_by_profile_id: null, ...base },
    { id: DEP.fasme, name: 'FASME', slug: 'fasme', description: null, is_active: false, created_by_profile_id: null, ...base },
  ]
  const aval = (i, dep, title, file, size, uploader, extra = {}) => ({
    id: `e0000000-0000-4000-8000-00000000000${i}`,
    department_id: dep,
    title,
    description: i % 2 === 0 ? 'Aval regional emitido para el ciclo lectivo 2026, con firma del coordinador del departamento.' : null,
    observations: i === 1 ? 'Pendiente de entrega del original en papel.' : null,
    storage_bucket: 'school-avales',
    storage_path: `${dep}/e0000000-0000-4000-8000-00000000000${i}/${file}`,
    file_name: file,
    mime_type: 'application/pdf',
    file_size: size,
    uploaded_by_profile_id: null,
    uploaded_by_name: uploader,
    is_archived: false,
    archived_at: null,
    archived_by_profile_id: null,
    // Relativo al reloj real: el aviso "avales nuevos de la semana" cuenta los últimos 7 días de verdad.
    created_at: realIso(-i * 6),
    updated_at: realIso(-i * 6),
    ...extra,
  })
  const school_avales_documents = [
    aval(0, DEP.fuego, 'Aval curso Incendios Estructurales Nivel I', 'aval-incendios-estructurales.pdf', 482133, 'María Fernanda López'),
    aval(1, DEP.fuego, 'Aval instructores Fuego 2026', 'instructores-fuego-2026.pdf', 1288012, 'Julián Ortega'),
    aval(2, DEP.forestal, 'Aval campaña de prevención forestal temporada 2026-2027', 'Aval_campaña_prevención_forestal_temporada_2026_2027_version_final_firmada.pdf', 3402111, 'Alejandro Ríos'),
    aval(3, DEP.fasme, 'Aval jornada FASME', 'jornada-fasme.pdf', 90211, 'María Fernanda López', { is_archived: true, archived_at: iso(-1), archived_by_profile_id: PROF.admin }),
  ]

  const document_folders = [
    { id: 'f0000000-0000-4000-8000-000000000001', name: 'Circulares 2026', description: 'Circulares regionales del año en curso.', region_id: REGION, subsede_id: null, station_id: null, profile_id: null, is_active: true, created_by_profile_id: PROF.admin, ...base },
    { id: 'f0000000-0000-4000-8000-000000000002', name: 'Actas de comisión', description: null, region_id: null, subsede_id: null, station_id: ST[0], profile_id: null, is_active: true, created_by_profile_id: PROF.admin, ...base },
    { id: 'f0000000-0000-4000-8000-000000000003', name: 'Manuales operativos', description: 'Procedimientos y manuales técnicos.', region_id: REGION, subsede_id: null, station_id: null, profile_id: null, is_active: true, created_by_profile_id: PROF.admin, ...base },
  ]
  const doc = (i, title, category, folder, extra = {}) => ({
    id: `90000000-0000-4000-8000-00000000000${i}`,
    region_id: REGION,
    subsede_id: null,
    station_id: null,
    profile_id: null,
    department_id: null,
    visibility: 'alcance',
    title,
    category,
    description: i === 0 ? 'Lineamientos para la carga de asistencia mensual.' : null,
    storage_path: `90000000-0000-4000-8000-00000000000${i}/doc.pdf`,
    uploaded_by_profile_id: PROF.admin,
    folder_id: folder,
    deleted_at: null,
    deleted_by_profile_id: null,
    delete_reason: null,
    purge_after: null,
    restored_at: null,
    restored_by_profile_id: null,
    created_at: iso(-i * 4),
    updated_at: iso(-i * 4),
    ...extra,
  })
  const documents = [
    doc(0, 'Circular N°12 — Carga de asistencia', 'Circular', document_folders[0].id),
    doc(1, 'Circular N°13 — Calendario de guardias', 'Circular', document_folders[0].id),
    doc(2, 'Manual de procedimientos operativos', 'Manual', document_folders[2].id),
    doc(3, 'Acta de reunión de comisión directiva', 'Acta', null),
    doc(4, 'Reglamento interno (versión anterior)', 'Reglamento', null, { deleted_at: iso(-2), purge_after: iso(28), delete_reason: 'Reemplazado por la versión 2026.' }),
    // 0110: publicado para todos, restringido y documentos de departamento.
    doc(5, 'Calendario institucional 2027', 'Circular', null, { visibility: 'todos' }),
    doc(6, 'Instructivo interno de claves', 'Informe', null, { visibility: 'restringido' }),
    doc(7, 'Protocolo de ataque interior', 'Manual', null, { region_id: null, department_id: DEP.fuego, uploaded_by_profile_id: PROF.mfuego }),
    doc(8, 'Plan de prevención forestal', 'Plan', null, { region_id: null, department_id: DEP.forestal, uploaded_by_profile_id: PROF.mfor }),
    doc(9, 'Manual de campo (publicado desde Forestal)', 'Manual', null, { region_id: null, department_id: DEP.forestal, uploaded_by_profile_id: PROF.mfor, visibility: 'todos' }),
  ]

  const ev = (i, title, event_type, days, extra = {}) => ({
    id: `70000000-0000-4000-8000-00000000000${i}`,
    title,
    description: 'Actividad institucional programada.',
    event_type,
    starts_at: iso(days, 9),
    ends_at: iso(days, 12),
    all_day: false,
    region_id: REGION,
    subsede_id: null,
    station_id: null,
    status: 'programado',
    notify_on_create: true,
    notify_before_minutes: 60,
    reminder_sent_at: null,
    created_by_profile_id: PROF.admin,
    department_id: null,
    ...base,
    ...extra,
  })
  const calendar_events = [
    // Eventos de departamento (0103): sin alcance territorial.
    // Los eventos de departamento son "próximos" según el reloj real, no el de los datos.
    ev(6, 'Práctica de ataque interior', 'capacitacion', 7, { department_id: DEP.fuego, region_id: null, created_by_profile_id: PROF.fuego, starts_at: realIso(7, 9), ends_at: realIso(7, 12) }),
    ev(7, 'Reunión de Forestal', 'reunion', 5, { department_id: DEP.forestal, region_id: null, starts_at: realIso(5, 9), ends_at: realIso(5, 12) }),
    ev(8, 'Prueba de equipos de radio', 'mantenimiento', 4, { department_id: '50000000-0000-4000-8000-000000000001', region_id: null, created_by_profile_id: PROF.jefe, starts_at: realIso(4, 9), ends_at: realIso(4, 12) }),
    ev(0, 'Reunión regional de jefes de cuerpo', 'reunion', 0),
    ev(1, 'Curso de Rescate Vehicular', 'capacitacion', 3),
    ev(2, 'Vencimiento de seguros de móviles', 'vencimiento', 6, { all_day: true }),
    ev(3, 'Guardia regional', 'guardia', 9),
    ev(4, 'Mantenimiento de equipos autónomos', 'mantenimiento', 12, { station_id: ST[0], region_id: null }),
    ev(5, 'Jornada de Escuela', 'escuela', -3, { status: 'finalizado' }),
  ]

  const notif = (i, type, title, body, read, days) => ({
    id: `60000000-0000-4000-8000-00000000000${i}`,
    profile_id: i % 2 === 0 ? PROF.admin : null,
    region_id: i % 2 === 0 ? null : REGION,
    subsede_id: null,
    station_id: null,
    type,
    title,
    body,
    is_read: read,
    created_at: iso(-days),
    app_update_id: null,
    link_path: null,
    department_id: null,
  })
  const notifications = [
    notif(0, 'documento_actualizado', 'Nuevo documento: Circular N°13', 'Se cargó un nuevo documento (Circular) en tu alcance.', false, 0.1),
    notif(1, 'curso_nuevo', 'Nuevo curso: Rescate Vehicular', 'Se publicó un nuevo curso de la Escuela Regional: Rescate.', false, 0.5),
    notif(2, 'alerta_admin', 'Cambio de rol de usuario', 'Roles asignados:\nMaría Fernanda López → "coordinador_escuela"', true, 1),
    notif(3, 'cambio_estado', 'Cambio de estado: Santiago Temple', 'El cuartel Santiago Temple pasó a estado "no_operativo".', true, 2),
    notif(4, 'prestamo_solicitado', 'Nueva solicitud de préstamo', 'Las Varillas solicitó Motobomba portátil.', true, 4),
    { ...notif(5, 'prestamo_aprobado', 'Tu solicitud fue aprobada: Cámara térmica', 'Coordiná el retiro con el responsable.', false, 0.2), profile_id: PROF.comun, region_id: null },
    { ...notif(6, 'informe_departamento', 'Nuevo informe en Fuego: Acta reunión mensual de octubre', 'Lo cargó Alejandro Ríos.', false, 0.3), profile_id: PROF.fuego, region_id: null, link_path: '/departamentos/informes/r0000000-0000-4000-8000-000000000001', department_id: DEP.fuego },
    { ...notif(7, 'prestamo_vencido', 'Préstamo vencido: Motobomba portátil', 'La devolución estaba prevista para ayer.', false, 1.5), profile_id: PROF.comun, region_id: null },
    { ...notif(8, 'circular_nueva', 'Guardia del sábado', 'Nos juntamos a las 9 en Las Varillas.', false, 0.1), profile_id: PROF.mfuego, region_id: null, link_path: `/departamentos/${DEP.fuego}`, department_id: DEP.fuego },
    { ...notif(9, 'aviso_departamento', 'Nuevo aval de Fuego: Aval curso Incendios Estructurales Nivel I', 'Lo cargó María Fernanda López.', false, 0.05), profile_id: PROF.fuego, region_id: null, link_path: `/escuela/avales?departamento=${DEP.fuego}`, department_id: DEP.fuego },
  ]

  const inventory_items = [
    ['Motobomba portátil', 'equipo', 'disponible'],
    ['Juego de herramientas de rescate', 'herramienta_manual', 'no_disponible'],
    ['Maniquí de RCP adulto', 'elementos_practica', 'disponible'],
    ['Generador eléctrico 5 kVA', 'mecanica', 'mantenimiento'],
    ['Cámara térmica', 'equipo', 'disponible'],
  ].map(([name, category, status], i) => ({
    id: `80000000-0000-4000-8000-00000000000${i}`,
    name,
    category,
    category_other_label: null,
    description: 'Elemento del inventario regional disponible para préstamo.',
    status,
    region_id: REGION,
    subsede_id: null,
    station_id: ST[i % 5],
    responsible_profile_id: PROF.jefe,
    responsible_name: 'Ramiro Quinteros',
    contact_info: '03573 421000',
    observations: null,
    created_by_profile_id: PROF.admin,
    ...base,
  }))

  const departmentsBase = [
    { id: '50000000-0000-4000-8000-000000000001', name: 'Comunicaciones', description: 'Coordinación de radio y comunicaciones regionales.', coordinator_profile_id: PROF.jefe, contact_info: 'comunicaciones@example.org', is_active: true, created_by_profile_id: PROF.admin, ...base },
    { id: '50000000-0000-4000-8000-000000000002', name: 'Logística', description: null, coordinator_profile_id: null, contact_info: null, is_active: true, created_by_profile_id: PROF.admin, ...base },
  ]

  const departments = [
    ...departmentsBase,
    ...school_departments.map((d) => ({ id: d.id, name: d.name, description: d.description, coordinator_profile_id: d.id === DEP.fuego ? PROF.fuego : null, contact_info: null, is_active: d.is_active, created_by_profile_id: null, created_at: d.created_at, updated_at: d.updated_at })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  // Informes de Departamentos (0098).
  const rep = (i, dep, type, title, date, author, extra = {}) => ({
    id: `r0000000-0000-4000-8000-00000000000${i}`,
    department_id: dep,
    report_type: type,
    title,
    body: null,
    observations: null,
    report_date: date,
    created_by_profile_id: author,
    created_by_name: profiles.find((p) => p.id === author)?.full_name ?? null,
    is_archived: false,
    archived_at: null,
    archived_by_profile_id: null,
    created_at: iso(-i * 3),
    updated_at: iso(-i * 3),
    ...extra,
  })
  const department_reports = [
    rep(1, DEP.fuego, 'acta_reunion', 'Acta reunión mensual de octubre', date(-1), PROF.fuego, {
      body: 'Se trató el plan de capacitación del último trimestre. Participaron los jefes de los cuarteles de la subsede Norte.\n\nResoluciones:\n1. Práctica de fuego estructural el 18/10 en Villa del Rosario.\n2. Relevamiento de equipos autónomos antes de fin de mes.',
      observations: 'El original firmado queda en la Secretaría Regional.',
    }),
    rep(2, DEP.fuego, 'informe_operativo', 'Informe práctica de ataque interior', date(-6), PROF.fuego, {
      body: 'Práctica con 14 bomberos de 3 cuarteles. Se trabajó ingreso con cámara térmica y ventilación por presión positiva. Sin incidentes.',
    }),
    rep(3, DEP.fuego, 'registro_fotografico', 'Registro fotográfico simulacro', date(-12), PROF.admin),
    rep(4, DEP.forestal, 'informe_administrativo', 'Inventario de herramientas forestales', date(-20), PROF.admin, { body: 'Relevamiento de batefuegos, mochilas y motosierras por cuartel.' }),
    rep(5, DEP.fuego, 'otro', 'Borrador viejo', date(-60), PROF.fuego, { is_archived: true, archived_at: iso(-30) }),
  ]
  const rfile = (i, reportIdx, dep, name, mime, size, kind) => ({
    id: `f1000000-0000-4000-8000-00000000000${i}`,
    report_id: `r0000000-0000-4000-8000-00000000000${reportIdx}`,
    department_id: dep,
    storage_path: `${dep}/r0000000-0000-4000-8000-00000000000${reportIdx}/f1000000-0000-4000-8000-00000000000${i}/${name}`,
    file_name: name,
    mime_type: mime,
    file_size: size,
    file_kind: kind,
    uploaded_by_profile_id: PROF.fuego,
    created_at: iso(-reportIdx * 3),
  })
  const department_report_files = [
    rfile(1, 1, DEP.fuego, 'Acta octubre firmada.pdf', 'application/pdf', 812345, 'documento'),
    rfile(2, 1, DEP.fuego, 'IMG_20261001_1830.jpg', 'image/jpeg', 2345678, 'imagen'),
    rfile(3, 3, DEP.fuego, 'simulacro_01.jpg', 'image/jpeg', 1945678, 'imagen'),
    rfile(4, 3, DEP.fuego, 'simulacro_02.jpg', 'image/jpeg', 2045678, 'imagen'),
    rfile(5, 3, DEP.fuego, 'IMG_0042.HEIC', 'image/heic', 3045678, 'imagen'),
    rfile(6, 3, DEP.fuego, 'ingreso_equipo.mp4', 'video/mp4', 18045678, 'video'),
    rfile(7, 2, DEP.fuego, 'planilla asistencia.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 45678, 'documento'),
  ]

  const compliance = stations.map((s, i) => ({
    station_id: s.id,
    station_name: s.name,
    region_id: REGION,
    subsede_id: s.subsede_id,
    has_contact_info: i !== 3,
    has_personnel: true,
    has_vehicles: true,
    attendance_recent: i < 3,
    interventions_recent: i < 2,
    has_documents: i < 4,
    has_history_events: i === 0,
    has_calendar_events: i < 2,
    last_relevant_update_at: iso(-i * 9),
    compliant_count: [8, 6, 5, 3, 2][i],
    compliant_total: 8,
    compliance_status: ['verde', 'amarillo', 'amarillo', 'rojo', 'rojo'][i],
  }))

  const personnel = ['Juan Pérez', 'Sofía Acosta', 'Martín Herrera', 'Valentina Ríos'].map((n, i) => ({
    id: `40000000-0000-4000-8000-00000000000${i}`,
    station_id: ST[0],
    first_name: n.split(' ')[0],
    last_name: n.split(' ')[1],
    national_id: null,
    rank: ['Bombero', 'Cabo', 'Sargento', 'Oficial'][i],
    role_function: ['Conductor', null, 'Instructor interno', 'Tesorero'][i],
    status: ['activo', 'activo', 'licencia', 'activo'][i],
    department: 'Cuerpo Activo',
    join_date: '2018-05-01',
    phone: null,
    email: null,
    observations: null,
    ...base,
  }))
  const vehicles = ['Autobomba 1', 'Cisterna 2', 'Rescate 3'].map((n, i) => ({
    id: `41000000-0000-4000-8000-00000000000${i}`,
    station_id: ST[0],
    internal_code: `M-0${i + 1}`,
    vehicle_type: n,
    status: ['operativo', 'mantenimiento', 'operativo'][i],
    plate: `AB${100 + i}CD`,
    water_capacity_liters: [3000, 8000, null][i],
    crew_capacity: 6,
    observations: null,
    last_service_at: date(-40),
    ...base,
  }))

  const auditRow = (i, action, table_name, new_value, old_value, actor, days) => ({
    id: `30000000-0000-4000-8000-00000000000${i}`,
    actor_profile_id: actor?.id ?? null,
    action,
    table_name,
    record_id: new_value?.id ?? old_value?.id ?? null,
    old_value,
    new_value,
    reason: null,
    region_id: REGION,
    subsede_id: null,
    station_id: null,
    created_at: iso(-days),
    actor: actor ?? null,
    region: { id: REGION, name: 'Regional 4', code: 'R4', created_at: iso(-300) },
    subsede: null,
    station: null,
  })
  const audit_logs = [
    auditRow(0, 'insert', 'school_avales_documents', school_avales_documents[0], null, profiles[1], 0.2),
    auditRow(1, 'update', 'stations', { ...stations[4], status: 'no_operativo' }, { ...stations[4], status: 'operativo' }, profiles[0], 1),
    auditRow(2, 'insert', 'user_roles', user_roles[2], null, profiles[0], 1.5),
    auditRow(3, 'delete', 'documents', null, documents[4], profiles[0], 2),
    auditRow(4, 'reporte_generado', 'reports', { tipo: 'Consolidado Regional' }, null, profiles[5], 3),
  ]

  const regions = [{ id: REGION, name: 'Regional 4', code: 'R4', created_at: iso(-300) }]
  const subsedes = [
    { id: SUB[0], region_id: REGION, name: 'SubSede Las Varillas', code: 'LV', created_at: iso(-300) },
    { id: SUB[1], region_id: REGION, name: 'Subsede Luque', code: 'LQ', created_at: iso(-300) },
    { id: SUB[2], region_id: REGION, name: 'Subsede Río Primero', code: 'RP', created_at: iso(-300) },
  ]
  const attendance_summaries = stations.slice(0, 3).map((s, i) => ({
    id: `42000000-0000-4000-8000-00000000000${i}`,
    station_id: s.id,
    period_start: date(-60),
    period_end: date(-30),
    attendance_rate: [82.4, 74.95, 91][i],
    total_members: 30,
    present_average: 24,
    observations: null,
    created_at: iso(-29),
  }))
  // Resumen cargado después de 0104: dotación del personal activo, sin
  // promedio de presentes, con observaciones.
  attendance_summaries.push({
    id: '42000000-0000-4000-8000-000000000009',
    station_id: ST[0],
    period_start: date(-28),
    period_end: date(-1),
    attendance_rate: 77.25,
    total_members: 28,
    present_average: null,
    observations: 'Guardias reforzadas por incendios forestales',
    created_at: iso(-1),
  })
  const intervention_summaries = stations.slice(0, 2).map((s, i) => ({
    id: `43000000-0000-4000-8000-00000000000${i}`,
    station_id: s.id,
    period_start: date(-60),
    period_end: date(-30),
    category: ['Incendio de pastizal', 'Accidente vehicular'][i],
    total_count: [14, 6][i],
    time_of_day: 'mixto',
    observations: null,
    personnel_count: 12,
    vehicles_count: 3,
    work_hours: 36,
    created_at: iso(-29),
  }))

  // El informe más reciente queda dentro de "los últimos 7 días" según el
  // reloj real (informe reciente según el reloj real), no el de los datos.
  department_reports[0].created_at = new Date(Date.now() - 2 * 86400000).toISOString()

  return {
    regions,
    subsedes,
    stations,
    profiles,
    user_roles,
    user_scopes,
    // Dotación por categorías (0108): vacía; cada prueba carga las filas que necesita.
    station_staffing: [],
    // Historial de efectivos (0109): lo escribe la base; el más reciente primero.
    station_staffing_history: [],
    courses,
    course_stations: [],
    school_avales_documents,
    document_folders,
    documents,
    document_versions: [],
    calendar_events,
    notifications,
    inventory_items,
    inventory_loan_requests: [
      // Motobomba: prestada a Río Segundo.
      { id: '90000000-0000-4000-8000-000000000001', inventory_item_id: '80000000-0000-4000-8000-000000000000', requesting_station_id: ST[1], requested_by_profile_id: PROF.fuego, responsible_profile_id: null, status: 'retirada', request_reason: 'Incendio forestal', requested_from: iso(-3), expected_return_at: iso(4), approved_by_profile_id: PROF.admin, approved_at: iso(-3), rejected_by_profile_id: null, rejected_at: null, rejection_reason: null, delivered_at: iso(-2), delivered_by_profile_id: PROF.admin, returned_at: null, returned_by_profile_id: null, delivery_condition: 'Buen estado', return_condition: null, notes: null, created_at: iso(-3), updated_at: iso(-2) },
      // Cámara térmica: aprobada para el cuartel de Lucía, falta retirarla.
      { id: '90000000-0000-4000-8000-000000000003', inventory_item_id: '80000000-0000-4000-8000-000000000004', requesting_station_id: ST[2], requested_by_profile_id: PROF.comun, responsible_profile_id: null, status: 'aprobada', request_reason: 'Rescate en altura', requested_from: iso(-2), expected_return_at: iso(5), approved_by_profile_id: PROF.admin, approved_at: iso(-1), rejected_by_profile_id: null, rejected_at: null, rejection_reason: null, delivered_at: null, delivered_by_profile_id: null, returned_at: null, returned_by_profile_id: null, delivery_condition: null, return_condition: null, notes: null, created_at: iso(-2), updated_at: iso(-1) },
      // Maniquí: pendiente para el cuartel de Lucía (usuario común).
      { id: '90000000-0000-4000-8000-000000000002', inventory_item_id: '80000000-0000-4000-8000-000000000002', requesting_station_id: ST[2], requested_by_profile_id: PROF.comun, responsible_profile_id: null, status: 'pendiente', request_reason: 'Capacitación RCP', requested_from: iso(-1), expected_return_at: null, approved_by_profile_id: null, approved_at: null, rejected_by_profile_id: null, rejected_at: null, rejection_reason: null, delivered_at: null, delivered_by_profile_id: null, returned_at: null, returned_by_profile_id: null, delivery_condition: null, return_condition: null, notes: null, created_at: iso(-1), updated_at: iso(-1) },
    ],
    inventory_item_history: [],
    departments,
    // Fuego: Martín (Río Primero) y Natalia (Santiago Temple). Forestal: Ramiro.
    department_members: [
      { id: 'dm000000-0000-4000-8000-000000000001', department_id: DEP.fuego, profile_id: PROF.mfuego, created_at: iso(-30) },
      { id: 'dm000000-0000-4000-8000-000000000002', department_id: DEP.fuego, profile_id: PROF.carga, created_at: iso(-30) },
      { id: 'dm000000-0000-4000-8000-000000000003', department_id: DEP.forestal, profile_id: PROF.jefe, created_at: iso(-30) },
      { id: 'dm000000-0000-4000-8000-000000000004', department_id: DEP.fuego, profile_id: PROF.exm, created_at: iso(-30) },
      { id: 'dm000000-0000-4000-8000-000000000005', department_id: DEP.forestal, profile_id: PROF.mfor, created_at: iso(-30) },
    ],
    department_reports,
    department_report_files,
    department_manual_members: [],
    department_activity_reports: [],
    station_compliance: compliance,
    personnel,
    vehicles,
    vehicle_status_history: [],
    personnel_status_history: [],
    station_history_events: [],
    audit_logs,
    attendance_summaries,
    intervention_summaries,
    map_reference_points: [],
  }
}

export const RPC = {
  get_pending_items: [
    { item_key: 'a', title: 'Cuartel sin contacto institucional', description: 'Río Primero no tiene teléfono ni email cargados.', priority: 'alta', module: 'Cuarteles', link_path: '/cuarteles', sort_key: iso(-5) },
    { item_key: 'b', title: 'Asistencia sin cargar', description: 'Santiago Temple no cargó la asistencia del último mes.', priority: 'media', module: 'Asistencia', link_path: '/cuarteles', sort_key: iso(-3) },
    { item_key: 'c', title: 'Documento en papelera', description: 'Reglamento interno se purga en 28 días.', priority: 'baja', module: 'Documentos', link_path: '/documentos/papelera', sort_key: iso(-2) },
  ],
  get_own_push_subscription_count: 0,
  get_push_subscription_counts_by_profile: [],
  list_system_settings_status: [],
  get_own_push_diagnostics: [],
}
