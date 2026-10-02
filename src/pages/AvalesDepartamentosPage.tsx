import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaTabs } from '../components/EscuelaTabs'
import { Icon } from '../components/ui/Icon'
import {
  assignSchoolDepartmentCoordinator,
  createSchoolDepartment,
  fetchProfileIdsWithRole,
  fetchSchoolDepartmentMembers,
  fetchSchoolDepartments,
  removeSchoolDepartmentCoordinator,
  slugifyDepartmentName,
  updateSchoolDepartment,
} from '../lib/api/schoolAvales'
import { fetchProfiles } from '../lib/api/users'
import { describeSupabaseError } from '../lib/api/errors'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { Profile, SchoolDepartment, SchoolDepartmentMember } from '../types/database'

// Administración de departamentos internos de Escuela y de sus
// coordinadores. Solo informatica_r4 (can_manage_school_avales()): la base
// rechaza crear/editar departamentos y las RPC de coordinadores para
// cualquier otro rol.
export function AvalesDepartamentosPage() {
  const { canManage } = useSchoolAvalesAccess()

  const [departments, setDepartments] = useState<SchoolDepartment[]>([])
  const [members, setMembers] = useState<SchoolDepartmentMember[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesWithRole, setProfilesWithRole] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
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
      fetchSchoolDepartments(),
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
  const newSlug = slugifyDepartmentName(newName)

  function reload() {
    setReloadKey((k) => k + 1)
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const name = newName.trim()
    if (!name) return setError('Ingresá el nombre del departamento.')
    if (!newSlug) return setError('El nombre tiene que incluir al menos una letra o número.')
    setCreating(true)
    try {
      await createSchoolDepartment({ name, slug: newSlug, description: newDescription.trim() || null })
      setNewName('')
      setNewDescription('')
      setNotice(`Departamento "${name}" creado.`)
      reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos crear el departamento.'))
    } finally {
      setCreating(false)
    }
  }

  function startEditing(department: SchoolDepartment) {
    setEditingId(department.id)
    setEditName(department.name)
    setEditDescription(department.description ?? '')
    setError(null)
  }

  async function handleSaveEdit(event: FormEvent, department: SchoolDepartment) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!editName.trim()) return setError('El nombre no puede quedar vacío.')
    setSavingId(department.id)
    try {
      const updated = await updateSchoolDepartment(department.id, { name: editName.trim(), description: editDescription.trim() || null })
      setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setEditingId(null)
      setNotice(`Departamento "${updated.name}" actualizado.`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el departamento.'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleActive(department: SchoolDepartment) {
    const deactivating = department.is_active
    const message = deactivating
      ? `¿Desactivar "${department.name}"? Sus avales se siguen pudiendo consultar, pero no se van a poder cargar nuevos.`
      : `¿Reactivar "${department.name}"? Vuelve a admitir cargas nuevas.`
    if (!window.confirm(message)) return
    setError(null)
    setNotice(null)
    setSavingId(department.id)
    try {
      const updated = await updateSchoolDepartment(department.id, { is_active: !department.is_active })
      setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cambiar el estado del departamento.'))
    } finally {
      setSavingId(null)
    }
  }

  // También sirve para "restaurar acceso" a un coordinador ya asignado al que
  // le quitaron el rol a mano: la RPC reactiva la membresía si hace falta y
  // vuelve a agregar el rol.
  async function handleAssign(department: SchoolDepartment, explicitProfileId?: string) {
    const profileId = explicitProfileId ?? pendingCoordinator[department.id]
    if (!profileId) return setError('Elegí el usuario que va a coordinar el departamento.')
    setError(null)
    setNotice(null)
    setSavingId(department.id)
    try {
      await assignSchoolDepartmentCoordinator(department.id, profileId)
      if (!explicitProfileId) setPendingCoordinator((prev) => ({ ...prev, [department.id]: '' }))
      setNotice(`${profileById.get(profileId)?.full_name ?? 'El usuario'} ahora coordina ${department.name}.`)
      reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos asignar el coordinador.'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleRemove(department: SchoolDepartment, member: SchoolDepartmentMember) {
    const name = profileById.get(member.profile_id)?.full_name ?? 'este usuario'
    if (!window.confirm(`¿Quitar a ${name} como coordinador de ${department.name}? Deja de ver los avales de ese departamento.`)) return
    setError(null)
    setNotice(null)
    setSavingId(department.id)
    try {
      await removeSchoolDepartmentCoordinator(department.id, member.profile_id)
      setNotice(`${name} ya no coordina ${department.name}.`)
      reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos quitar el coordinador.'))
    } finally {
      setSavingId(null)
    }
  }

  if (!canManage) {
    return (
      <AppShell title="Departamentos internos">
        <EscuelaTabs />
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>Solo Informática R4 puede administrar los departamentos internos y sus coordinadores.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Departamentos internos">
      <EscuelaTabs />
      <Link to="/escuela/avales" className="back-link">
        ← Volver a Avales
      </Link>
      <h1 className="page-title">Departamentos internos de Escuela</h1>
      <p className="page-subtitle">
        Carpetas de los avales regionales (Fuego, Forestal, FASME…) y quién coordina cada una. No son los Departamentos
        Regionales del módulo Departamentos.
      </p>

      {notice && (
        <div className="card" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--color-success)' }}>{notice}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      <div className="section-header">
        <h2 className="section-title">Nuevo departamento</h2>
      </div>
      <form onSubmit={handleCreate} className="card-solid" style={{ marginBottom: 24 }} noValidate>
        <div className="field">
          <label htmlFor="newName">Nombre</label>
          <input id="newName" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Rescate" />
          {newSlug && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Identificador: {newSlug} (no se puede cambiar después)</span>}
        </div>
        <div className="field">
          <label htmlFor="newDescription">Descripción (opcional)</label>
          <textarea id="newDescription" rows={2} maxLength={500} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? 'Creando…' : 'Crear departamento'}
        </button>
      </form>

      <div className="section-header">
        <h2 className="section-title">Departamentos y coordinadores</h2>
      </div>

      {loading && <div className="loading-state" role="status">Cargando departamentos…</div>}
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
      {!loading && !loadError && departments.length === 0 && <div className="empty-state">Todavía no hay departamentos internos.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!loading &&
          !loadError &&
          departments.map((department) => {
            const departmentMembers = members.filter((m) => m.department_id === department.id)
            const assignedIds = new Set(departmentMembers.map((m) => m.profile_id))
            const candidates = activeProfiles.filter((p) => !assignedIds.has(p.id))
            const isSaving = savingId === department.id
            return (
              <div key={department.id} className="card-solid">
                {editingId === department.id ? (
                  <form onSubmit={(e) => handleSaveEdit(e, department)} noValidate>
                    <div className="field">
                      <label htmlFor={`name-${department.id}`}>Nombre</label>
                      <input id={`name-${department.id}`} maxLength={80} value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`desc-${department.id}`}>Descripción (opcional)</label>
                      <textarea
                        id={`desc-${department.id}`}
                        rows={2}
                        maxLength={500}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={isSaving}>
                        {isSaving ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" className="btn btn-outlined" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 15, overflowWrap: 'anywhere' }}>
                        {department.name}{' '}
                        <span className={`badge ${department.is_active ? 'badge-success' : 'badge-warning'}`}>
                          {department.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Identificador: {department.slug}</div>
                      {department.description && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '6px 0 0' }}>{department.description}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-outlined btn-sm" onClick={() => startEditing(department)} aria-label="Editar departamento">
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outlined btn-sm"
                        disabled={isSaving}
                        onClick={() => handleToggleActive(department)}
                      >
                        {department.is_active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>
                    Coordinadores
                  </div>
                  {departmentMembers.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>Sin coordinador asignado.</p>
                  )}
                  {departmentMembers.map((member) => {
                    const profile = profileById.get(member.profile_id)
                    const missingRole = !profilesWithRole.has(member.profile_id)
                    return (
                      <div
                        key={member.id}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}
                      >
                        <span style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
                          <strong>{profile?.full_name ?? 'Usuario no disponible'}</strong>
                          {profile?.email && <span style={{ color: 'var(--color-text-secondary)' }}> · {profile.email}</span>}
                          {profile && !profile.is_active && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Usuario inactivo</span>}
                          {missingRole && (
                            <span className="badge badge-warning" style={{ marginLeft: 6 }} title="Le quitaron el rol a mano: volvé a asignarlo para darle acceso.">
                              Sin rol: sin acceso
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          {missingRole && profile?.is_active && (
                            <button
                              type="button"
                              className="btn btn-outlined btn-sm"
                              disabled={isSaving}
                              onClick={() => handleAssign(department, member.profile_id)}
                            >
                              Restaurar acceso
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-outlined btn-sm"
                            disabled={isSaving}
                            onClick={() => handleRemove(department, member)}
                          >
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
                    <button type="button" className="btn btn-primary" disabled={isSaving} onClick={() => handleAssign(department)}>
                      {isSaving ? 'Guardando…' : 'Asignar'}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
                    Al asignar, el usuario recibe también el rol "Coordinador de departamento interno". Al quitarlo de su último
                    departamento, el rol se le quita.
                  </p>
                </div>
              </div>
            )
          })}
      </div>
    </AppShell>
  )
}
