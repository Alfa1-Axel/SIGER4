import type { RoleKey } from '../../types/roles'

export interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
  hideForRoles?: RoleKey[]
  // Se muestra solo si el usuario tiene alguno de estos roles (además de
  // isAdmin, que ya cubre adminOnly).
  showForRoles?: RoleKey[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Panel', icon: 'grid' },
  { to: '/cuarteles', label: 'Cuarteles', icon: 'building' },
  { to: '/calendario', label: 'Calendario', icon: 'calendar' },
  { to: '/escuela', label: 'Escuela', icon: 'school' },
  // Acceso total: informatica_r4/integrante_informatica (isAdmin). Alcance
  // regional/subsede/cuartel: director_escuela, secretario_regional. Solo su
  // propio cuartel: jefe_cuerpo_activo, usuario_carga_cuartel. El resto de
  // roles no ve Reportes (ver ReportsRoute para la guarda real de acceso).
  {
    to: '/reportes',
    label: 'Reportes',
    icon: 'chart',
    showForRoles: ['director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel'],
  },
  { to: '/documentos', label: 'Documentos', icon: 'file' },
  { to: '/inventario', label: 'Inventario', icon: 'tag' },
  { to: '/departamentos', label: 'Departamentos', icon: 'building' },
  { to: '/auditoria', label: 'Auditoría', icon: 'clipboardList', hideForRoles: ['invitado'] },
  // /usuarios ya no es adminOnly: jefe_cuerpo_activo también entra, pero ve
  // el listado filtrado a su propio cuartel (ver UsuariosPage/UserManagerRoute).
  { to: '/usuarios', label: 'Usuarios', icon: 'user', showForRoles: ['jefe_cuerpo_activo'] },
  // director_escuela no ve el listado /usuarios (sigue exclusivo de
  // informatica_r4/integrante_informatica/jefe_cuerpo_activo), pero conserva
  // el acceso directo a "Nuevo Usuario" (puede crear usuarios de Escuela/
  // formación, ver UserCreatorRoute).
  { to: '/usuarios/nuevo', label: 'Nuevo Usuario', icon: 'user', showForRoles: ['director_escuela'] },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
]
