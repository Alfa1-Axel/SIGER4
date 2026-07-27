import type { RoleKey } from '../../types/roles'

export interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
  hideForRoles?: RoleKey[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Panel', icon: 'grid' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building' },
  { to: '/escuela', label: 'Escuela', icon: 'school' },
  { to: '/reportes', label: 'Reportes', icon: 'chart' },
  { to: '/documentos', label: 'Documentos', icon: 'file' },
  { to: '/auditoria', label: 'Auditoría', icon: 'clipboardList', hideForRoles: ['invitado'] },
  { to: '/usuarios', label: 'Usuarios', icon: 'user', adminOnly: true },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
]
