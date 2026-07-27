import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { Icon } from '../ui/Icon'

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => (
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
