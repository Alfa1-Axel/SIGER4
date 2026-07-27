import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchProfiles } from '../lib/api/users'
import type { Profile } from '../types/database'

export function UsuariosPage() {
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

  const filtered = useMemo(() => {
    if (!query) return profiles
    const q = query.toLowerCase()
    return profiles.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  }, [profiles, query])

  return (
    <AppShell title="Usuarios">
      <h1 className="page-title">Gestión de Usuarios</h1>
      <p className="page-subtitle">Cuentas del sistema, roles y alcances asignados.</p>

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
