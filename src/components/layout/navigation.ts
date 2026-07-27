export interface NavItem {
  to: string
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Panel', icon: 'grid' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building' },
  { to: '/escuela', label: 'Escuela', icon: 'school' },
  { to: '/reportes', label: 'Reportes', icon: 'chart' },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
]
