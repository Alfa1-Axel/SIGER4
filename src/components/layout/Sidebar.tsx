import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

function UserAvatar({ avatarUrl, fullName }: { avatarUrl: string | null | undefined; fullName: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt={fullName} className="avatar" style={{ width: 28, height: 28 }} />
  return (
    <span className="avatar avatar-placeholder" style={{ width: 28, height: 28 }} role="img" aria-label={fullName}>
      <Icon name="user" size={14} />
    </span>
  )
}

interface SidebarProps {
  open: boolean
  onClose: () => void
}

// En desktop (≥900px) el sidebar es una columna fija de la grilla, siempre
// visible: "open"/"onClose" no tienen efecto ahí (el CSS ignora .open en ese
// breakpoint). En mobile/tablet es un drawer off-canvas que se desliza según
// la clase "open"; se cierra solo al elegir una opción, tocar el botón de
// cierre, o el backdrop (manejado por AppShell).
export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, signOut, isAdmin, roles } = useAuth()
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.hideForRoles?.some((r) => roles.includes(r))) return false
    if (item.showForRoles) return isAdmin || item.showForRoles.some((r) => roles.includes(r))
    return !item.adminOnly || isAdmin
  })

  return (
    <aside className={`app-sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand-row">
        <div className="sidebar-brand">
          <img src="/logos/logo-escuela.png" alt="SIGER4" />
          <span>SIGER4</span>
        </div>
        <button type="button" className="btn btn-icon btn-ghost sidebar-close-button" onClick={onClose} aria-label="Cerrar menú">
          <Icon name="close" size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            // end: un ítem cuya ruta es prefijo de otro ítem (Usuarios /
            // Nuevo Usuario) no debe quedar activo en la ruta del otro.
            end={NAV_ITEMS.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`))}
            onClick={onClose}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name ?? 'Usuario'} />
          <span className="sidebar-user-name">{profile?.full_name ?? 'Usuario'}</span>
        </div>
        <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
          <Icon name="logout" size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
