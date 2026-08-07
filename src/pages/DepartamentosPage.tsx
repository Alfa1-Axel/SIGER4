import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchDepartments } from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import type { Department, Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentosPage() {
  const { isAdmin } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchDepartments(), fetchProfiles()])
      .then(([departmentsData, profilesData]) => {
        if (!active) return
        setDepartments(departmentsData)
        setProfiles(profilesData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar departamentos')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  function coordinatorName(coordinatorProfileId: string | null): string | null {
    if (!coordinatorProfileId) return null
    return profiles.find((p) => p.id === coordinatorProfileId)?.full_name ?? null
  }

  return (
    <AppShell title="Departamentos">
      <h1 className="page-title">Departamentos Regionales</h1>
      <p className="page-subtitle">Áreas y departamentos de la Regional 4, sus coordinadores y miembros.</p>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando departamentos…</div>}
      {!loading && departments.length === 0 && <div className="empty-state">No hay departamentos cargados todavía.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {departments.map((department) => (
          <Link
            key={department.id}
            to={`/departamentos/${department.id}`}
            className="card-solid"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{department.name}</h3>
              {department.description && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{department.description}</p>
              )}
              {coordinatorName(department.coordinator_profile_id) && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Coordinador: {coordinatorName(department.coordinator_profile_id)}
                </p>
              )}
            </div>
            <span className={`badge ${department.is_active ? 'badge-success' : 'badge-danger'}`}>
              {department.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <Link to="/departamentos/nuevo" className="btn btn-primary btn-icon fab" aria-label="Nuevo departamento">
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
