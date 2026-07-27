import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

function UserAvatar({ avatarUrl, fullName }: { avatarUrl: string | null | undefined; fullName: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt={fullName} className="avatar" style={{ width: 28, height: 28, flexShrink: 0 }} />
  return (
    <div className="btn btn-icon btn-inverted" style={{ width: 28, height: 28, flexShrink: 0 }} aria-label={fullName}>
      <Icon name="user" size={14} />
    </div>
  )
}

export function Sidebar() {
  const { profile, signOut, isAdmin, roles } = useAuth()
  const visibleItems = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && !item.hideForRoles?.some((r) => roles.includes(r)),
  )

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
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name ?? 'Usuario'} />
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
