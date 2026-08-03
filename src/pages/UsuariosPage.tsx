import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchProfiles } from '../lib/api/users'
import type { Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'

// jefe_cuerpo_activo entra a esta misma pantalla (ver UserManagerRoute), pero
// solo puede ver/gestionar usuarios de su propio cuartel: el listado se
// filtra client-side a profile.station_id === su station_id. Esto es
// conveniencia de UI, no el límite de seguridad real — admin-update-user
// (Edge Function) valida station_id server-side en cada edición.
export function UsuariosPage() {
  const { isAdmin, hasRole, profile: currentProfile } = useAuth()
  const isJefeCuerpoActivo = !isAdmin && hasRole('jefe_cuerpo_activo')

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchProfiles()
      .then((data) => active && setProfiles(data))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar usuarios'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const stationScoped = useMemo(() => {
    if (!isJefeCuerpoActivo) return profiles
    return profiles.filter((p) => p.station_id === currentProfile?.station_id)
  }, [profiles, isJefeCuerpoActivo, currentProfile?.station_id])

  const filtered = useMemo(() => {
    if (!query) return stationScoped
    const q = query.toLowerCase()
    return stationScoped.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  }, [stationScoped, query])

  return (
    <AppShell title="Usuarios">
      <h1 className="page-title">Gestión de Usuarios</h1>
      <p className="page-subtitle">
        {isJefeCuerpoActivo ? 'Usuarios de tu cuartel.' : 'Cuentas del sistema, roles y alcances asignados.'}
      </p>

      <div className="search-input" style={{ marginBottom: 20 }}>
        <Icon name="search" size={16} />
        <input
          placeholder="Buscar por nombre o email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando usuarios…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No se encontraron usuarios.</div>}

      <div className="card" style={{ padding: 0 }}>
        {filtered.map((profile, i) => (
          <Link
            key={profile.id}
            to={`/usuarios/${profile.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{profile.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{profile.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!profile.auth_user_id && <span className="badge badge-warning">Pendiente de activación</span>}
              {!profile.is_active && <span className="badge badge-danger">Inactivo</span>}
              <Icon name="chevronRight" size={18} />
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/usuarios/nuevo"
        className="btn btn-primary btn-icon fab"
        aria-label="Nuevo usuario"
      >
        <Icon name="plus" size={20} />
      </Link>
    </AppShell>
  )
}
