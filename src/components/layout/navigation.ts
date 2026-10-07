import type { RoleKey } from '../../types/roles'
import { canUseModule } from '../../lib/moduleAccess'
import type { AppModule } from '../../lib/moduleAccess'

export interface NavContext {
  isAdmin: boolean
  isSuperAdmin: boolean
  hasRole: (...roles: RoleKey[]) => boolean
  // Coordina al menos un departamento o es miembro de uno (con su rol).
  hasDepartments: boolean
  // Cuántos departamentos coordina o integra.
  departmentCount: number
  // Modo departamento: solo tiene roles de departamento (lib/moduleAccess.ts).
  departmentOnly: boolean
}

export type NavSection = 'Gestión' | 'Administración' | 'Cuenta'

export interface NavItem {
  to: string
  label: string
  // Rótulo según quién mira (ej.: "Mi departamento"). Sin esto, va label.
  labelFor?: (ctx: NavContext) => string
  icon: string
  section: NavSection
  // Módulo al que pertenece: en modo departamento solo se muestran los que
  // ese modo abre (canUseModule).
  module: AppModule
  // Sin visible(), el ítem se muestra a cualquier usuario autenticado. La
  // visibilidad es solo comodidad: cada ruta tiene su guarda y la base su RLS.
  visible?: (ctx: NavContext) => boolean
}

const canManageUsers = (ctx: NavContext) => ctx.isAdmin || ctx.hasRole('jefe_cuerpo_activo')

// Mismo criterio que can_view_department() (0103): sus departamentos, o todos
// para Informática, Secretario Regional y Director de Escuela.
const canSeeDepartments = (ctx: NavContext) => ctx.hasDepartments || ctx.isAdmin || ctx.hasRole('secretario_regional', 'director_escuela')

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Inicio', icon: 'home', section: 'Gestión', module: 'inicio' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building', section: 'Gestión', module: 'cuarteles' },
  { to: '/mapa', label: 'Mapa Regional', icon: 'mapPin', section: 'Gestión', module: 'mapa' },
  { to: '/calendario', label: 'Calendario', icon: 'calendar', section: 'Gestión', module: 'calendario' },
  { to: '/escuela', label: 'Escuela', icon: 'school', section: 'Gestión', module: 'escuela' },
  { to: '/documentos', label: 'Documentos', icon: 'file', section: 'Gestión', module: 'documentos' },
  {
    to: '/departamentos',
    label: 'Departamentos',
    // Quien solo trabaja en su departamento lo ve como "Mi departamento".
    labelFor: (ctx) => (ctx.departmentOnly ? (ctx.departmentCount === 1 ? 'Mi departamento' : 'Mis departamentos') : 'Departamentos'),
    icon: 'building',
    section: 'Gestión',
    module: 'departamentos',
    visible: canSeeDepartments,
  },
  { to: '/inventario', label: 'Inventario', icon: 'tag', section: 'Gestión', module: 'inventario' },
  // Misma regla que ReportsRoute.
  {
    to: '/reportes',
    label: 'Reportes',
    icon: 'chart',
    section: 'Gestión',
    module: 'reportes',
    visible: (ctx) => ctx.isAdmin || ctx.hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel'),
  },
  // Listado de usuarios: Informática y jefe_cuerpo_activo (filtrado a su
  // cuartel). Ver UserManagerRoute.
  { to: '/usuarios', label: 'Usuarios', icon: 'user', section: 'Administración', module: 'usuarios', visible: canManageUsers },
  // Acceso directo solo para quien puede crear usuarios pero no ve el
  // listado (director_escuela): el resto lo tiene en Usuarios.
  {
    to: '/usuarios/nuevo',
    label: 'Nuevo usuario',
    icon: 'plus',
    section: 'Administración',
    module: 'usuarios',
    visible: (ctx) => ctx.hasRole('director_escuela') && !canManageUsers(ctx),
  },
  // Solo informatica_r4 (is_super_admin() en la base, ver 0097).
  { to: '/auditoria', label: 'Auditoría', icon: 'clipboardList', section: 'Administración', module: 'auditoria', visible: (ctx) => ctx.isSuperAdmin },
  { to: '/notificaciones', label: 'Notificaciones', icon: 'bell', section: 'Cuenta', module: 'notificaciones' },
  { to: '/ajustes', label: 'Mi perfil y ajustes', icon: 'settings', section: 'Cuenta', module: 'ajustes' },
  // Página informativa, abierta por URL y desde el perfil y la Ayuda; en
  // modo departamento el menú se limita a lo que usa todos los días (la
  // Ayuda tiene "Qué puedo hacer con mi rol").
  { to: '/roles', label: 'Roles y permisos', icon: 'info', section: 'Cuenta', module: 'roles', visible: (ctx) => !ctx.departmentOnly },
  { to: '/ayuda', label: 'Ayuda', icon: 'help', section: 'Cuenta', module: 'ayuda' },
  { to: '/novedades', label: 'Novedades', icon: 'magic', section: 'Cuenta', module: 'novedades' },
]

export const NAV_SECTIONS: NavSection[] = ['Gestión', 'Administración', 'Cuenta']

export function isNavItemVisible(item: NavItem, ctx: NavContext): boolean {
  return canUseModule(item.module, ctx.departmentOnly) && (!item.visible || item.visible(ctx))
}

export function navItemLabel(item: NavItem, ctx: NavContext): string {
  return item.labelFor ? item.labelFor(ctx) : item.label
}
