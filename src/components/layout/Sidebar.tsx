import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

export function Sidebar() {
  const { profile, signOut, isAdmin } = useAuth()
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <img src="/logos/logo-escuela.png" alt="Escuela Regional de Bomberos" />
        <span>SIGER4</span>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
          <img
            src="/logos/logo-informatica.jpeg"
            alt="Dpto. Informática y Estadística R4"
            style={{ height: 28, width: 28, borderRadius: 8, objectFit: 'cover' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name ?? 'Usuario'}
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
          <Icon name="logout" size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
