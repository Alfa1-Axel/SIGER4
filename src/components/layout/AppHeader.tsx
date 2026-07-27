import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'

interface AppHeaderProps {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  const { profile } = useAuth()

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
        <button type="button" className="btn btn-icon btn-outlined" aria-label="Notificaciones">
          <Icon name="bell" size={18} />
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
