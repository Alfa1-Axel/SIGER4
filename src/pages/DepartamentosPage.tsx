import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { fetchDepartments } from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import type { Department, Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentosPage() {
  const { isAdmin, profile } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNavigationNotice()

  useEffect(() => {
    let active = true
    Promise.all([fetchDepartments(), fetchProfiles()])
      .then(([departmentsData, profilesData]) => {
        if (!active) return
        setDepartments(departmentsData)
        setProfiles(profilesData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los departamentos. Reintentá en unos segundos.')))
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Departamentos</h1>
          <p className="page-subtitle">
            Áreas de la Regional 4 con su coordinador y sus integrantes. Es la única lista de departamentos: Escuela → Avales
            regionales usa estos mismos, y el coordinador de cada uno ve y sube sus avales.
          </p>
        </div>
        {isAdmin && (
          <div className="page-header-actions">
            <Link to="/departamentos/nuevo" className="btn btn-primary">
              <Icon name="plus" size={16} />
              Nuevo departamento
            </Link>
          </div>
        )}
      </div>

      {notice && <SuccessNotice message={notice} onClose={() => setNotice(null)} />}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando departamentos…</div>}
      {!loading && !error && departments.length === 0 && (
        <div className="empty-state empty-state-action">
          <span>Todavía no hay departamentos cargados.</span>
          {isAdmin ? (
            <Link to="/departamentos/nuevo" className="btn btn-primary">
              <Icon name="plus" size={16} />
              Crear el primer departamento
            </Link>
          ) : (
            <span style={{ fontSize: 13 }}>Los crea el Dpto. de Informática y Estadística R4.</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {departments.map((department) => {
          const coordinator = coordinatorName(department.coordinator_profile_id)
          const isMine = !!profile && department.coordinator_profile_id === profile.id
          return (
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
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {department.coordinator_profile_id ? `Coordinador: ${coordinator ?? 'asignado'}` : 'Sin coordinador'}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                {isMine && <span className="badge badge-info">Tu departamento</span>}
                <span className={`badge ${department.is_active ? 'badge-success' : 'badge-danger'}`}>
                  {department.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </AppShell>
  )
}
