import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { fetchUnreadNotificationCount } from '../../lib/api/notifications'

interface AppHeaderProps {
  title: string
  onOpenMenu: () => void
}

export function AppHeader({ title, onOpenMenu }: AppHeaderProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile) return
    let active = true
    fetchUnreadNotificationCount()
      .then((count) => {
        if (active) setUnreadCount(count)
      })
      .catch(() => {
        // Si falla la carga del contador, simplemente no se muestra el badge.
      })
    return () => {
      active = false
    }
  }, [profile])

  return (
    <header className="app-header">
      <div className="app-header-lead">
        <button type="button" className="btn btn-icon btn-ghost hamburger-button" aria-label="Abrir menú" onClick={onOpenMenu}>
          <Icon name="menu" size={18} />
        </button>
        <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" className="app-header-logo" />
        <span className="app-header-title">{title}</span>
      </div>
      <div className="app-header-actions">
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
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.full_name} className="avatar" style={{ marginLeft: 4 }} />
        ) : (
          <span className="avatar avatar-placeholder" style={{ marginLeft: 4 }} aria-label={profile?.full_name ?? 'Usuario'} role="img">
            <Icon name="user" size={16} />
          </span>
        )}
      </div>
    </header>
  )
}
