import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

export function BottomNav() {
  const { isAdmin, roles } = useAuth()
  const visibleItems = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && !item.hideForRoles?.some((r) => roles.includes(r)),
  )

  return (
    <nav className="bottom-nav">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-link${isActive ? ' active' : ''}`}
        >
          <Icon name={item.icon} size={20} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
