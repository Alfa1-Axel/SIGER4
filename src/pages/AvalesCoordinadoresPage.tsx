import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { Icon } from '../components/ui/Icon'
import {
  assignSchoolDepartmentCoordinator,
  fetchProfileIdsWithRole,
  fetchSchoolDepartmentMembers,
  removeSchoolDepartmentCoordinator,
} from '../lib/api/schoolAvales'
import { fetchDepartments } from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import { describeSupabaseError } from '../lib/api/errors'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { Department, Profile, SchoolDepartmentMember } from '../types/database'

// Coordinadores de Avales regionales por departamento. Los departamentos son
// los de la tabla única departments (sección Departamentos): esta pantalla no
// crea, renombra ni desactiva departamentos, solo asigna quién coordina cada
// uno dentro de Avales. Solo informatica_r4 (can_manage_school_avales()): las
// RPC de asignación rechazan a cualquier otro rol.
export function AvalesCoordinadoresPage() {
  const { canManage } = useSchoolAvalesAccess()

  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<SchoolDepartmentMember[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesWithRole, setProfilesWithRole] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingCoordinator, setPendingCoordinator] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!canManage) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetchDepartments(),
      fetchSchoolDepartmentMembers(),
      fetchProfiles(),
      fetchProfileIdsWithRole('coordinador_departamento_escuela'),
    ])
      .then(([departmentsData, membersData, profilesData, roleProfileIds]) => {
        if (!active) return
        setDepartments(departmentsData)
        setMembers(membersData)
        setProfiles(profilesData)
        setProfilesWithRole(new Set(roleProfileIds))
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los departamentos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [canManage, reloadKey])

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const activeProfiles = useMemo(() => profiles.filter((p) => p.is_active), [profiles])
  const visibleDepartments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? departments.filter((d) => d.name.toLowerCase().includes(q)) : departments
  }, [departments, query])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  // También sirve para "restaurar acceso" a un coordinador ya asignado al que
  // le quitaron el rol a mano: la RPC reactiva la asignación si hace falta y
  // vuelve a agregar el rol.
  async function handleAssign(department: Department, explicitProfileId?: string) {
    const profileId = explicitProfileId ?? pendingCoordinator[department.id]
    if (!profileId) return setError('Elegí el usuario que va a coordinar el departamento.')
    setError(null)
    setNotice(null)
    setSavingId(department.id)
    try {
      await assignSchoolDepartmentCoordinator(department.id, profileId)
      if (!explicitProfileId) setPendingCoordinator((prev) => ({ ...prev, [department.id]: '' }))
      setNotice(`${profileById.get(profileId)?.full_name ?? 'El usuario'} ahora coordina ${department.name} en Avales.`)
      reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos asignar el coordinador.'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleRemove(department: Department, member: SchoolDepartmentMember) {
    const name = profileById.get(member.profile_id)?.full_name ?? 'este usuario'
    if (!window.confirm(`¿Quitar a ${name} como coordinador de ${department.name} en Avales? Deja de ver los avales de ese departamento.`)) return
    setError(null)
    setNotice(null)
    setSavingId(department.id)
    try {
      await removeSchoolDepartmentCoordinator(department.id, member.profile_id)
      setNotice(`${name} ya no coordina ${department.name} en Avales.`)
      reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos quitar el coordinador.'))
    } finally {
      setSavingId(null)
    }
  }

  if (!canManage) {
    return (
      <AppShell title="Coordinadores de Avales">
        <EscuelaHeader />
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>Solo Informática R4 puede asignar coordinadores de Avales.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Coordinadores de Avales">
      <EscuelaHeader />
      <Link to="/escuela/avales" className="back-link">
        ← Volver a Avales
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Coordinadores de Avales</h1>
          <p className="page-subtitle">
            Quién coordina cada departamento dentro de Avales regionales. Es la misma lista de la sección Departamentos.
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/departamentos" className="btn btn-outlined">
            <Icon name="building" size={16} />
            Ir a Departamentos
          </Link>
          <Link to="/departamentos/nuevo" className="btn btn-outlined">
            <Icon name="plus" size={16} />
            Nuevo departamento
          </Link>
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-content">
          Crear, renombrar, desactivar o eliminar un departamento se hace en la sección Departamentos, y el cambio se ve
          enseguida en Avales. Un departamento desactivado se puede consultar pero no admite avales nuevos, y uno con avales
          cargados no se puede eliminar.
        </span>
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="loading-state" role="status">
          Cargando departamentos…
        </div>
      )}
      {!loading && loadError && (
        <div className="empty-state">
          <p className="field-error" style={{ marginBottom: 12 }}>
            {loadError}
          </p>
          <button type="button" className="btn btn-outlined" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {!loading && !loadError && departments.length === 0 && (
        <div className="empty-state">Todavía no hay departamentos. Crealos desde la sección Departamentos.</div>
      )}

      {!loading && !loadError && departments.length > 0 && (
        <>
          <div className="search-input" style={{ marginBottom: 16 }}>
            <Icon name="search" size={16} />
            <input placeholder="Buscar departamento…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar departamento" />
          </div>

          {visibleDepartments.length === 0 && <div className="empty-state">No hay departamentos que coincidan con la búsqueda.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleDepartments.map((department) => {
              const departmentMembers = members.filter((m) => m.department_id === department.id)
              const assignedIds = new Set(departmentMembers.map((m) => m.profile_id))
              const candidates = activeProfiles.filter((p) => !assignedIds.has(p.id))
              const isSaving = savingId === department.id
              return (
                <section key={department.id} className="card-solid" aria-label={department.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: 15, overflowWrap: 'anywhere' }}>
                        {department.name}{' '}
                        <span className={`badge ${department.is_active ? 'badge-success' : 'badge-warning'}`}>
                          {department.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </h2>
                      {department.description && <p className="row-item-meta" style={{ margin: '4px 0 0' }}>{department.description}</p>}
                    </div>
                    <Link to={`/departamentos/${department.id}`} className="link-muted">
                      Ver en Departamentos
                    </Link>
                  </div>

                  <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <div className="kpi-label" style={{ marginBottom: 6 }}>
                      Coordinadores en Avales
                    </div>
                    {departmentMembers.length === 0 && (
                      <p className="field-help" style={{ marginBottom: 8 }}>
                        Sin coordinador asignado.
                      </p>
                    )}
                    {departmentMembers.map((member) => {
                      const profile = profileById.get(member.profile_id)
                      const missingRole = !profilesWithRole.has(member.profile_id)
                      return (
                        <div
                          key={member.id}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}
                        >
                          <span style={{ fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>
                            <strong>{profile?.full_name ?? 'Usuario no disponible'}</strong>
                            {profile?.email && <span className="text-secondary"> · {profile.email}</span>}
                            {profile && !profile.is_active && (
                              <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                                Usuario inactivo
                              </span>
                            )}
                            {missingRole && (
                              <span className="badge badge-warning" style={{ marginLeft: 6 }} title="Le quitaron el rol a mano: volvé a asignarlo para darle acceso.">
                                Sin rol: sin acceso
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'flex', gap: 6 }}>
                            {missingRole && profile?.is_active && (
                              <button type="button" className="btn btn-outlined btn-sm" disabled={isSaving} onClick={() => handleAssign(department, member.profile_id)}>
                                Restaurar acceso
                              </button>
                            )}
                            <button type="button" className="btn btn-danger-outline btn-sm" disabled={isSaving} onClick={() => handleRemove(department, member)}>
                              Quitar
                            </button>
                          </span>
                        </div>
                      )
                    })}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                      <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                        <label htmlFor={`coord-${department.id}`}>Asignar coordinador</label>
                        <select
                          id={`coord-${department.id}`}
                          value={pendingCoordinator[department.id] ?? ''}
                          onChange={(e) => setPendingCoordinator((prev) => ({ ...prev, [department.id]: e.target.value }))}
                        >
                          <option value="">Seleccionar usuario</option>
                          {candidates.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.full_name} ({profile.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="btn btn-outlined" disabled={isSaving} onClick={() => handleAssign(department)}>
                        {isSaving ? 'Guardando…' : 'Asignar'}
                      </button>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>

          <p className="field-help" style={{ marginTop: 16 }}>
            Al asignar, el usuario recibe también el rol "Coordinador de departamento (Escuela)". Al quitarlo de su último
            departamento, el rol se le quita. Es independiente del coordinador que figura en la sección Departamentos.
          </p>
        </>
      )}
    </AppShell>
  )
}
