import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchProfiles } from '../lib/api/users'
import type { Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

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
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los usuarios. Reintentá en unos segundos.')))
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">
            {isJefeCuerpoActivo ? 'Usuarios de tu cuartel. Tocá uno para editar sus datos o su contraseña.' : 'Cuentas del sistema con sus roles y alcances. Tocá una para editarla.'}
          </p>
        </div>
        <Link to="/roles" className="btn btn-outlined btn-sm" style={{ whiteSpace: 'nowrap' }}>
          <Icon name="clipboardList" size={14} />
          Roles y permisos
        </Link>
      </div>

      <div className="search-input" style={{ marginBottom: 20 }}>
        <Icon name="search" size={16} />
        <input
          placeholder="Buscar por nombre o email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando usuarios…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No encontramos usuarios con esa búsqueda. Probá con otro nombre o email.</div>}

      <div className="card row-list">
        {filtered.map((profile) => (
          <Link
            key={profile.id}
            to={`/usuarios/${profile.id}`}
            className="row-item"
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{profile.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{profile.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
          <span className="fab-label">Nuevo usuario</span>
      </Link>
    </AppShell>
  )
}
