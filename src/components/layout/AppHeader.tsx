import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { GlobalSearch } from '../GlobalSearch'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { NOTIFICATIONS_CHANGED_EVENT, fetchUnreadNotificationCount } from '../../lib/api/notifications'

interface AppHeaderProps {
  title: string
  onOpenMenu: () => void
}

export function AppHeader({ title, onOpenMenu }: AppHeaderProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [unreadCount, setUnreadCount] = useState(0)
  const { pathname } = useLocation()
  const profileId = profile?.id ?? null

  // El contador sale de la misma bandeja que /notificaciones (my_notifications,
  // 0102) y se recalcula al marcar leídas, al cambiar de pantalla y al volver
  // a la pestaña, para que siempre coincida.
  useEffect(() => {
    if (!profileId) return
    let active = true
    const refresh = () => {
      fetchUnreadNotificationCount()
        .then((count) => {
          if (active) setUnreadCount(count)
        })
        .catch(() => {
          // Si falla la carga del contador, simplemente no se muestra el badge.
        })
    }
    refresh()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [profileId, pathname])

  return (
    <header className="app-header">
      <div className="app-header-lead">
        <button type="button" className="btn btn-icon btn-ghost hamburger-button" aria-label="Abrir menú" onClick={onOpenMenu}>
          <Icon name="menu" size={18} />
        </button>
        <Link to="/panel" className="app-header-home" aria-label="Ir al inicio" title="Ir al inicio">
          <img src="/logos/logo-informatica.png" alt="" className="app-header-logo" />
        </Link>
        <span className="app-header-title">{title}</span>
      </div>
      <div className="app-header-actions">
        <GlobalSearch />
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={toggleTheme}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'}
          title="Notificaciones"
          onClick={() => navigate('/notificaciones')}
          style={{ position: 'relative' }}
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 && <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
        {/* La foto lleva directo al perfil (Mi perfil y ajustes). */}
        <Link to="/ajustes" className="app-header-avatar-link" aria-label="Ir a mi perfil" title="Mi perfil">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="avatar" />
          ) : (
            <span className="avatar avatar-placeholder" aria-hidden="true">
              <Icon name="user" size={16} />
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
