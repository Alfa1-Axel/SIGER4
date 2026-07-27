import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../hooks/useAuth'
import { ROLE_DEFINITIONS } from '../types/roles'

export function AjustesPage() {
  const { profile, user, roles, signOut } = useAuth()

  return (
    <AppShell title="Ajustes">
      <h1 className="page-title">Ajustes</h1>
      <p className="page-subtitle">Información de tu cuenta y del sistema.</p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="btn btn-icon btn-inverted" style={{ width: 48, height: 48 }}>
            <Icon name="user" size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{profile?.full_name ?? 'Usuario'}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{user?.email}</div>
          </div>
        </div>

        {roles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="kpi-label" style={{ marginBottom: 6 }}>
              Roles asignados
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {roles.map((role) => {
                const def = ROLE_DEFINITIONS.find((r) => r.key === role)
                return (
                  <span key={role} className="badge badge-info">
                    {def?.label ?? role}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Institucional
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logos/logo-escuela.png" alt="Escuela Regional" style={{ height: 40, borderRadius: 8 }} />
          <img src="/logos/logo-informatica.jpeg" alt="Dpto. Informática y Estadística R4" style={{ height: 40, borderRadius: 8 }} />
        </div>
      </div>

      <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
        <Icon name="logout" size={16} />
        Cerrar sesión
      </button>
    </AppShell>
  )
}
