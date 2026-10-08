import { DEPARTMENT_ROLES } from '../types/roles'
import type { RoleKey } from '../types/roles'

// Modo departamento: quien tiene SOLO roles de departamento (Coordinador o
// Miembro de Departamento) usa la aplicación a través de su departamento:
// Inicio departamental, el departamento (miembros, informes, actas, eventos
// y avisos), el calendario de su departamento, Notificaciones y su perfil.
// Todo lo demás (cuarteles, mapa, Escuela, Documentos,
// Inventario, Reportes, Usuarios, Auditoría) no se le ofrece: ni en el menú,
// ni en el Inicio, ni en la búsqueda, ni por URL directa.
//
// Con un rol más (Informática, Escuela, un cuartel…) ya no es modo
// departamento: los permisos se suman y rige lo de siempre. Es el espejo de
// is_department_only() (0107): la base lo aplica con RLS, esto solo evita
// ofrecer lo que después no se podría abrir.

export type AppModule =
  | 'inicio'
  | 'cuarteles'
  | 'mapa'
  | 'calendario'
  | 'escuela'
  | 'avales'
  | 'documentos'
  | 'departamentos'
  | 'inventario'
  | 'reportes'
  | 'usuarios'
  | 'auditoria'
  | 'notificaciones'
  | 'ajustes'

export function isDepartmentOnly(roles: readonly RoleKey[]): boolean {
  return roles.length > 0 && roles.every((r) => DEPARTMENT_ROLES.includes(r))
}

// Módulos que el modo departamento sí abre. 'avales' lo abre cada coordinador
// para su departamento (SchoolAvalesRoute decide por su acceso real).
const DEPARTMENT_ONLY_MODULES: ReadonlySet<AppModule> = new Set<AppModule>([
  'inicio',
  'departamentos',
  'calendario',
  'avales',
  'notificaciones',
  'ajustes',
])

export function canUseModule(module: AppModule, departmentOnly: boolean): boolean {
  return !departmentOnly || DEPARTMENT_ONLY_MODULES.has(module)
}

// Prefijos de ruta de cada módulo. El primero que coincide manda, por eso
// '/escuela/avales' va antes que '/escuela'.
const PATH_MODULES: [string, AppModule][] = [
  ['/panel', 'inicio'],
  ['/cuarteles', 'cuarteles'],
  ['/vehiculos', 'cuarteles'],
  ['/asistencia', 'cuarteles'],
  ['/intervenciones', 'cuarteles'],
  ['/personal', 'cuarteles'],
  ['/historial', 'cuarteles'],
  ['/mapa', 'mapa'],
  ['/calendario', 'calendario'],
  ['/escuela/avales', 'avales'],
  ['/escuela', 'escuela'],
  ['/documentos', 'documentos'],
  ['/departamentos', 'departamentos'],
  ['/informes', 'departamentos'],
  ['/inventario', 'inventario'],
  ['/reportes', 'reportes'],
  ['/usuarios', 'usuarios'],
  ['/auditoria', 'auditoria'],
  ['/notificaciones', 'notificaciones'],
  ['/ajustes', 'ajustes'],
]

// Módulo al que pertenece una ruta interna (con o sin query o #ancla), o
// null si no es una ruta conocida.
export function moduleForPath(path: string): AppModule | null {
  const clean = path.split(/[?#]/)[0]
  for (const [prefix, module] of PATH_MODULES) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return module
  }
  return null
}

// ¿Puede abrir este enlace? Un enlace a una ruta desconocida o externa no se
// toca (no es de un módulo). Sirve para no mostrar "Abrir" en avisos que
// llevarían a una pantalla sin permiso.
export function canOpenPath(path: string | null | undefined, departmentOnly: boolean, hasAvalesAccess = false): boolean {
  if (!path) return false
  const module = moduleForPath(path)
  if (!module) return true
  if (!canUseModule(module, departmentOnly)) return false
  if (module === 'avales' && departmentOnly) return hasAvalesAccess
  return true
}
