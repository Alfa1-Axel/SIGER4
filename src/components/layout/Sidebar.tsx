import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS, NAV_SECTIONS } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

function UserAvatar({ avatarUrl }: { avatarUrl: string | null | undefined }) {
  if (avatarUrl) return <img src={avatarUrl} alt="" className="avatar" style={{ width: 28, height: 28 }} />
  return (
    <span className="avatar avatar-placeholder" style={{ width: 28, height: 28 }} aria-hidden="true">
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
  const { profile, signOut, isAdmin, isSuperAdmin, hasRole } = useAuth()
  const visibleItems = NAV_ITEMS.filter((item) => !item.visible || item.visible({ isAdmin, isSuperAdmin, hasRole }))

  return (
    <aside className={`app-sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand-row">
        <Link to="/panel" className="sidebar-brand" aria-label="SIGER4: ir al inicio" onClick={onClose}>
          <img src="/logos/logo-escuela.png" alt="" />
          <span>SIGER4</span>
        </Link>
        <button type="button" className="btn btn-icon btn-ghost sidebar-close-button" onClick={onClose} aria-label="Cerrar menú">
          <Icon name="close" size={18} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Menú principal">
        {NAV_SECTIONS.map((section) => {
          const items = visibleItems.filter((item) => item.section === section)
          if (items.length === 0) return null
          return (
            <div key={section} className="sidebar-section">
              <span className="sidebar-section-title">{section}</span>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  // end: un ítem cuya ruta es prefijo de otro ítem (Usuarios /
                  // Nuevo usuario) no debe quedar activo en la ruta del otro.
                  end={NAV_ITEMS.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`))}
                  onClick={onClose}
                  className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <Link to="/ajustes" className="sidebar-user" aria-label={`${profile?.full_name ?? 'Usuario'}: ir a mi perfil`} onClick={onClose}>
          <UserAvatar avatarUrl={profile?.avatar_url} />
          <span className="sidebar-user-name">{profile?.full_name ?? 'Usuario'}</span>
        </Link>
        <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
          <Icon name="logout" size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
