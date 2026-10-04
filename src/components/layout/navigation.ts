import type { RoleKey } from '../../types/roles'

export interface NavContext {
  isAdmin: boolean
  isSuperAdmin: boolean
  hasRole: (...roles: RoleKey[]) => boolean
}

export type NavSection = 'Gestión' | 'Administración' | 'Cuenta'

export interface NavItem {
  to: string
  label: string
  icon: string
  section: NavSection
  // Sin visible(), el ítem se muestra a cualquier usuario autenticado. La
  // visibilidad es solo comodidad: cada ruta tiene su guarda y la base su RLS.
  visible?: (ctx: NavContext) => boolean
}

const canManageUsers = (ctx: NavContext) => ctx.isAdmin || ctx.hasRole('jefe_cuerpo_activo')

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Inicio', icon: 'home', section: 'Gestión' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building', section: 'Gestión' },
  { to: '/mapa', label: 'Mapa Regional', icon: 'mapPin', section: 'Gestión' },
  { to: '/calendario', label: 'Calendario', icon: 'calendar', section: 'Gestión' },
  { to: '/escuela', label: 'Escuela', icon: 'school', section: 'Gestión' },
  { to: '/documentos', label: 'Documentos', icon: 'file', section: 'Gestión' },
  { to: '/departamentos', label: 'Departamentos', icon: 'building', section: 'Gestión' },
  { to: '/inventario', label: 'Inventario', icon: 'tag', section: 'Gestión' },
  // Misma regla que ReportsRoute.
  {
    to: '/reportes',
    label: 'Reportes',
    icon: 'chart',
    section: 'Gestión',
    visible: (ctx) => ctx.isAdmin || ctx.hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel'),
  },
  // Listado de usuarios: Informática y jefe_cuerpo_activo (filtrado a su
  // cuartel). Ver UserManagerRoute.
  { to: '/usuarios', label: 'Usuarios', icon: 'user', section: 'Administración', visible: canManageUsers },
  // Acceso directo solo para quien puede crear usuarios pero no ve el
  // listado (director_escuela): el resto lo tiene en Usuarios.
  {
    to: '/usuarios/nuevo',
    label: 'Nuevo usuario',
    icon: 'plus',
    section: 'Administración',
    visible: (ctx) => ctx.hasRole('director_escuela') && !canManageUsers(ctx),
  },
  // Solo informatica_r4 (is_super_admin() en la base, ver 0097).
  { to: '/auditoria', label: 'Auditoría', icon: 'clipboardList', section: 'Administración', visible: (ctx) => ctx.isSuperAdmin },
  { to: '/notificaciones', label: 'Notificaciones', icon: 'bell', section: 'Cuenta' },
  { to: '/ajustes', label: 'Mi perfil y ajustes', icon: 'settings', section: 'Cuenta' },
  { to: '/roles', label: 'Roles y permisos', icon: 'info', section: 'Cuenta' },
  { to: '/novedades', label: 'Novedades', icon: 'magic', section: 'Cuenta' },
]

export const NAV_SECTIONS: NavSection[] = ['Gestión', 'Administración', 'Cuenta']
