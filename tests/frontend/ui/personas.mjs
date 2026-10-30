// Personas (un perfil por variante de rol del sistema) y pantallas que recorre tests/frontend/ui/check.mjs. Cada persona parte de un
// perfil del backend simulado y le aplica los roles y el alcance de su variante. Los ids de las rutas salen del mismo
// simulado: las pantallas de detalle y de edición se abren con registros que existen.
import { AUTH, ST, DEP, PROF, buildTables } from './mock-supabase/fixtures.mjs'
import { addFixtures70 } from './mock-supabase/mock70.mjs'
import { addFixtures71 } from './mock-supabase/mock71.mjs'

// ---------- Personas: los 14 roles, varios roles y sin rol ----------
const REGION = '11111111-1111-4111-8111-111111111111'
const asRoles = (who, roles, { station, region } = {}) => (t) => {
  const pid = PROF[who]
  t.user_roles = t.user_roles.filter((r) => r.profile_id !== pid)
  for (const role of roles) t.user_roles.push({ id: `r-${role}-${pid}`, profile_id: pid, role, created_at: new Date().toISOString() })
  const p = t.profiles.find((x) => x.id === pid)
  if (station !== undefined) p.station_id = station
  if (region) p.region_id = REGION
  t.user_scopes = t.user_scopes.filter((s) => s.profile_id !== pid)
  if (station) t.user_scopes.push({ id: `s-${pid}`, profile_id: pid, scope_type: 'station', region_id: null, subsede_id: null, station_id: station, created_at: new Date().toISOString() })
  else if (region) t.user_scopes.push({ id: `s-${pid}`, profile_id: pid, scope_type: 'region', region_id: REGION, subsede_id: null, station_id: null, created_at: new Date().toISOString() })
}
export const PERSONAS = {
  informatica: { who: 'admin' },
  integrante: { who: 'integ' },
  sec_regional: { who: 'secre' },
  presidente_cd: { who: 'comun' },
  jefe_cuerpo: { who: 'exm', mutate: asRoles('exm', ['jefe_cuerpo_activo'], { station: ST[0] }) },
  usuario_carga: { who: 'exm', mutate: asRoles('exm', ['usuario_carga_cuartel'], { station: ST[2] }) },
  sec_comision: { who: 'exm', mutate: asRoles('exm', ['secretario_comision'], { station: ST[2] }) },
  invitado: { who: 'exm', mutate: asRoles('exm', ['invitado'], { station: ST[2] }) },
  director_escuela: { who: 'exm', mutate: asRoles('exm', ['director_escuela'], { region: true }) },
  instructor: { who: 'exm', mutate: asRoles('exm', ['instructor'], { region: true }) },
  coord_escuela: { who: 'coord' },
  sec_escuela: { who: 'exm', mutate: asRoles('exm', ['secretario_escuela'], { region: true }) },
  coord_depto: { who: 'fuego', mutate: asRoles('fuego', ['coordinador_departamento'], { region: true }) },
  miembro_depto: { who: 'mfuego', mutate: asRoles('mfuego', ['miembro_departamento'], { region: true }) },
  varios_roles: { who: 'jefe' },
  sin_rol: { who: 'exm', mutate: asRoles('exm', [], { station: null }) },
}

// ---------- Rutas con ids reales del backend simulado ----------
const T = buildTables()
T.form_drafts = []
addFixtures70(T)
addFixtures71(T)
const first = (k) => T[k]?.[0]?.id ?? '00000000-0000-4000-8000-000000000000'
const ID = {
  s0: ST[0], s2: ST[2], veh: first('vehicles'), per: first('personnel'), att: first('attendance_summaries'), int: first('intervention_summaries'),
  doc: first('documents'), fol: first('document_folders'), ev: first('calendar_events'), inv: first('inventory_items'), loan: first('inventory_loan_requests'),
  course: first('courses'), aval: first('school_avales_documents'), rep: first('department_reports'), pt: first('map_reference_points'), user: PROF.mfuego,
  fuego: DEP.fuego, forestal: DEP.forestal, noti: first('notifications'),
}
export const ROUTES = [
  ['panel', '/panel'], ['pendientes', '/pendientes'],
  ['cuarteles', '/cuarteles'], ['cuartel-propio', `/cuarteles/${ID.s2}`], ['cuartel-otro', `/cuarteles/${ID.s0}`], ['cuartel-nuevo', '/cuarteles/nuevo'], ['cuartel-editar', `/cuarteles/${ID.s0}/editar`],
  ['movil-nuevo', `/cuarteles/${ID.s0}/vehiculos/nuevo`], ['movil-editar', `/vehiculos/${ID.veh}/editar`],
  ['asistencia-nueva', `/cuarteles/${ID.s0}/asistencia/nueva`], ['asistencia-editar', `/asistencia/${ID.att}/editar`],
  ['intervencion-nueva', `/cuarteles/${ID.s0}/intervenciones/nueva`], ['intervencion-editar', `/intervenciones/${ID.int}/editar`],
  ['personal-nuevo', `/cuarteles/${ID.s0}/personal/nuevo`], ['personal-editar', `/personal/${ID.per}/editar`], ['historial-nuevo', `/cuarteles/${ID.s0}/historial/nuevo`],
  ['mapa', '/mapa'], ['mapa-punto', `/mapa/puntos/${ID.pt}`], ['mapa-punto-editar', `/mapa/puntos/${ID.pt}/editar`], ['mapa-verificacion', `/mapa/puntos/${ID.pt}/verificaciones/nueva`],
  ['calendario', '/calendario'], ['evento-nuevo', '/calendario/nuevo'], ['evento', `/calendario/${ID.ev}`], ['evento-editar', `/calendario/${ID.ev}/editar`],
  ['escuela', '/escuela'], ['curso-nuevo', '/escuela/nuevo'], ['curso-editar', `/escuela/${ID.course}/editar`],
  ['avales', '/escuela/avales'], ['aval-nuevo', '/escuela/avales/nuevo'], ['aval-editar', `/escuela/avales/${ID.aval}/editar`], ['aval-renovar', `/escuela/avales/${ID.aval}/renovar`], ['aval-movimientos', '/escuela/avales/movimientos'],
  ['documentos', '/documentos'], ['documento-nuevo', '/documentos/nuevo'], ['documento-editar', `/documentos/${ID.doc}/editar`], ['carpeta-nueva', '/documentos/carpetas/nueva'], ['carpeta', `/documentos/carpetas/${ID.fol}`], ['documentos-depto', `/documentos/departamentos/${ID.fuego}`], ['papelera', '/documentos/papelera'],
  ['departamentos', '/departamentos?todos=1'], ['departamento-nuevo', '/departamentos/nuevo'], ['departamento', `/departamentos/${ID.fuego}`], ['departamento-ajeno', `/departamentos/${ID.forestal}`], ['miembro-nuevo', '/departamentos/miembros/nuevo'],
  ['informe-nuevo', '/departamentos/informes/nuevo?modo=redactar'], ['informe', `/departamentos/informes/${ID.rep}`], ['informe-editar', `/departamentos/informes/${ID.rep}/editar`], ['actividad-nueva', `/departamentos/${ID.fuego}/informes/nuevo`],
  ['inventario', '/inventario'], ['inventario-nuevo', '/inventario/nuevo'], ['inventario-item', `/inventario/${ID.inv}`], ['inventario-editar', `/inventario/${ID.inv}/editar`], ['solicitudes', '/inventario/solicitudes'], ['solicitud', `/inventario/solicitudes/${ID.loan}`], ['solicitud-nueva', `/inventario/${ID.inv}/solicitudes/nueva`],
  ['reportes', '/reportes'], ['usuarios', '/usuarios'], ['usuario-nuevo', '/usuarios/nuevo'], ['usuario', `/usuarios/${ID.user}`], ['auditoria', '/auditoria'],
  ['notificaciones', '/notificaciones'], ['notificacion-nueva', '/notificaciones/nueva'], ['ajustes', '/ajustes'],
  ['ruta-inexistente', '/esta-ruta-no-existe'],
]

