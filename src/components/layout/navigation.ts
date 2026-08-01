import type { RoleKey } from '../../types/roles'

export interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
  hideForRoles?: RoleKey[]
  // Se muestra solo si el usuario tiene alguno de estos roles (además de
  // isAdmin, que ya cubre adminOnly). Usado para dar a director_escuela y
  // jefe_cuerpo_activo un acceso directo a "Nuevo Usuario" sin exponerles el
  // listado completo de /usuarios (que sigue exclusivo de informatica_r4/
  // integrante_informatica vía AdminRoute).
  showForRoles?: RoleKey[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Panel', icon: 'grid' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building' },
  { to: '/escuela', label: 'Escuela', icon: 'school' },
  { to: '/reportes', label: 'Reportes', icon: 'chart' },
  { to: '/documentos', label: 'Documentos', icon: 'file' },
  { to: '/auditoria', label: 'Auditoría', icon: 'clipboardList', hideForRoles: ['invitado'] },
  { to: '/usuarios', label: 'Usuarios', icon: 'user', adminOnly: true },
  { to: '/usuarios/nuevo', label: 'Nuevo Usuario', icon: 'user', showForRoles: ['director_escuela', 'jefe_cuerpo_activo'] },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
]
