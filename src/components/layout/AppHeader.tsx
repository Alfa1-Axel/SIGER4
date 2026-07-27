import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'
import { fetchNotificationsForProfile } from '../../lib/api/notifications'

interface AppHeaderProps {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile) return
    let active = true
    fetchNotificationsForProfile(profile.id)
      .then((data) => {
        if (!active) return
        setUnreadCount(data.filter((n) => !n.is_read).length)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src="/logos/logo-informatica.jpeg"
          alt="Dpto. Informática y Estadística R4"
          style={{ height: 24, width: 24, borderRadius: 6, objectFit: 'cover' }}
        />
        <strong style={{ fontSize: 14 }}>{title}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn btn-icon btn-outlined" aria-label="Buscar">
          <Icon name="search" size={18} />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-outlined"
          aria-label="Notificaciones"
          onClick={() => navigate('/notificaciones')}
          style={{ position: 'relative' }}
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.full_name} className="avatar" />
        ) : (
          <div className="btn btn-icon btn-inverted" aria-label={profile?.full_name ?? 'Usuario'}>
            <Icon name="user" size={16} />
          </div>
        )}
      </div>
    </header>
  )
}
