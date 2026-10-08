import type { RoleKey } from '../types/roles'

// Accesos rápidos del Inicio según el rol: pocos (hasta MAX_HOME_ACTIONS), con
// un verbo o un nombre concreto y en el orden en que se usan. Es solo comodidad:
// cada pantalla tiene su guarda y la base su RLS.

export interface HomeAction {
  to: string
  label: string
  description: string
  icon: string
}

export interface HomeActionContext {
  isAdmin: boolean
  isSuperAdmin: boolean
  hasRole: (...roles: RoleKey[]) => boolean
  // Cuartel propio (el de su perfil o su alcance), si tiene.
  ownStationId: string | null
  canRequestLoans: boolean
  hasAvalesAccess: boolean
  canUploadDocuments: boolean
}

export const MAX_HOME_ACTIONS = 6

export function buildHomeActions(ctx: HomeActionContext): HomeAction[] {
  const { isAdmin, isSuperAdmin, hasRole, ownStationId: station } = ctx
  const stationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const loansManager = isAdmin || hasRole('secretario_regional', 'director_escuela')
  const canReports = isAdmin || hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const canManageUsers = isAdmin || hasRole('jefe_cuerpo_activo')

  const attendance: HomeAction | null =
    stationRole && station ? { to: `/cuarteles/${station}/asistencia/nueva`, label: 'Registrar asistencia', description: 'Resumen del período', icon: 'clipboardList' } : null
  const effectives: HomeAction | null =
    stationRole && station ? { to: `/cuarteles/${station}#efectivos`, label: 'Actualizar efectivos', description: 'Cantidad por categoría', icon: 'user' } : null
  const loans: HomeAction | null = ctx.canRequestLoans
    ? loansManager
      ? { to: '/inventario/solicitudes', label: 'Solicitudes de préstamo', description: 'Aprobar y registrar', icon: 'tag' }
      : { to: '/inventario', label: 'Solicitar elemento', description: 'Inventario Regional', icon: 'tag' }
    : null
  const myStation: HomeAction | null = station && !isAdmin ? { to: `/cuarteles/${station}`, label: 'Mi cuartel', description: 'Ficha y cargas', icon: 'building' } : null
  const report: HomeAction | null = canReports ? { to: '/reportes', label: 'Generar reporte', description: 'PDF del cuartel o la Regional', icon: 'chart' } : null
  const users: HomeAction | null = canManageUsers ? { to: '/usuarios', label: 'Usuarios', description: 'Altas, roles y accesos', icon: 'user' } : null
  const stations: HomeAction = { to: '/cuarteles', label: 'Cuarteles', description: 'Efectivos, móviles y estado', icon: 'building' }
  const school: HomeAction = { to: '/escuela', label: 'Escuela', description: 'Cursos y capacitaciones', icon: 'school' }
  // Los avales son del trabajo de la Escuela; quien los ve por coordinar un
  // departamento los tiene en la tarjeta de su departamento.
  const avales: HomeAction | null = ctx.hasAvalesAccess && hasRole('coordinador_escuela', 'secretario_escuela') ? { to: '/escuela/avales', label: 'Avales regionales', description: 'Ver y subir avales', icon: 'school' } : null
  const departments: HomeAction = { to: '/departamentos', label: 'Departamentos', description: 'Informes, actas y eventos', icon: 'clipboardList' }
  const documents: HomeAction = ctx.canUploadDocuments
    ? { to: '/documentos/nuevo', label: 'Subir documento', description: 'Circulares y archivos', icon: 'download' }
    : { to: '/documentos', label: 'Documentos', description: 'Circulares y archivos', icon: 'file' }
  const audit: HomeAction | null = isSuperAdmin ? { to: '/auditoria', label: 'Auditoría', description: 'Registro de cambios', icon: 'eye' } : null
  const calendar: HomeAction = { to: '/calendario', label: 'Calendario', description: 'Eventos y vencimientos', icon: 'calendar' }

  const candidates: (HomeAction | null)[] = isAdmin
    ? // Informática: administración y lo que se consulta todos los días.
      [users, stations, report, documents, loans, audit ?? departments, calendar]
    : [
        attendance,
        effectives,
        // Quien trabaja a nivel Regional o en la Escuela empieza por sus módulos.
        hasRole('secretario_regional', 'director_escuela') ? stations : null,
        hasRole('director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela') ? school : null,
        avales,
        loans,
        myStation,
        report,
        users,
        hasRole('secretario_regional', 'director_escuela') ? departments : null,
        documents,
        calendar,
      ]

  const seen = new Set<string>()
  const result: HomeAction[] = []
  for (const action of candidates) {
    if (!action || seen.has(action.to)) continue
    seen.add(action.to)
    result.push(action)
    if (result.length === MAX_HOME_ACTIONS) break
  }
  return result
}
