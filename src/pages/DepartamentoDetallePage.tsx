import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import {
  fetchDepartmentById,
  updateDepartment,
  deleteDepartment,
  fetchDepartmentMembers,
  addDepartmentMember,
  removeDepartmentMember,
  type DepartmentMemberWithProfile,
} from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import { fetchStations } from '../lib/api/stations'
import type { Department, Profile, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin } = useAuth()

  const [department, setDepartment] = useState<Department | null>(null)
  const [members, setMembers] = useState<DepartmentMemberWithProfile[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [coordinatorProfileId, setCoordinatorProfileId] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [savingDetails, setSavingDetails] = useState(false)

  const [newMemberProfileId, setNewMemberProfileId] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  const canManage = isAdmin || (department?.coordinator_profile_id && department.coordinator_profile_id === currentProfile?.id)

  async function reload() {
    if (!id) return
    const [departmentData, membersData] = await Promise.all([fetchDepartmentById(id), fetchDepartmentMembers(id)])
    if (departmentData) {
      setDepartment(departmentData)
      setName(departmentData.name)
      setDescription(departmentData.description ?? '')
      setCoordinatorProfileId(departmentData.coordinator_profile_id ?? '')
      setContactInfo(departmentData.contact_info ?? '')
      setIsActive(departmentData.is_active)
    }
    setMembers(membersData)
  }

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchDepartmentById(id), fetchDepartmentMembers(id), fetchProfiles(), fetchStations()]).then(
      ([departmentData, membersData, profilesData, stationsData]) => {
        if (!active) return
        if (departmentData) {
          setDepartment(departmentData)
          setName(departmentData.name)
          setDescription(departmentData.description ?? '')
          setCoordinatorProfileId(departmentData.coordinator_profile_id ?? '')
          setContactInfo(departmentData.contact_info ?? '')
          setIsActive(departmentData.is_active)
        }
        setMembers(membersData)
        setProfiles(profilesData)
        setStations(stationsData)
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [id])

  function stationName(stationId: string | null): string {
    if (!stationId) return 'Sin cuartel asignado'
    return stations.find((s) => s.id === stationId)?.name ?? 'Sin cuartel asignado'
  }

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setError(null)
    setSavingDetails(true)
    try {
      await updateDepartment(id, {
        name,
        description: description || null,
        coordinator_profile_id: isAdmin ? coordinatorProfileId || null : department?.coordinator_profile_id ?? null,
        contact_info: contactInfo || null,
        is_active: isActive,
      })
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar los cambios.'))
    } finally {
      setSavingDetails(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!window.confirm('¿Eliminar este departamento? Esta acción no se puede deshacer.')) return
    await deleteDepartment(id)
    navigate('/departamentos')
  }

  async function handleAddMember() {
    if (!id || !newMemberProfileId) return
    setAddingMember(true)
    setError(null)
    try {
      await addDepartmentMember(id, newMemberProfileId)
      setNewMemberProfileId('')
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos agregar el miembro.'))
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(memberRowId: string) {
    await removeDepartmentMember(memberRowId)
    await reload()
  }

  if (loading) {
    return (
      <AppShell title="Departamento">
        <div className="empty-state">Cargando departamento…</div>
      </AppShell>
    )
  }

  if (!department) {
    return (
      <AppShell title="Departamento">
        <div className="empty-state">No se encontró el departamento solicitado.</div>
      </AppShell>
    )
  }

  const availableProfiles = profiles.filter((p) => !members.some((m) => m.profile_id === p.id))

  return (
    <AppShell title={department.name}>
      <Link to="/departamentos" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Departamentos
      </Link>

      <h1 className="page-title">{department.name}</h1>
      <p className="page-subtitle">
        {department.is_active ? 'Departamento activo' : 'Departamento inactivo'}
        {!canManage && ' · Solo el coordinador o Informática pueden modificarlo.'}
      </p>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {canManage ? (
        <form onSubmit={handleSaveDetails} className="card-solid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {isAdmin && (
            <div className="field">
              <label htmlFor="coordinator">Coordinador</label>
              <select id="coordinator" value={coordinatorProfileId} onChange={(e) => setCoordinatorProfileId(e.target.value)}>
                <option value="">Sin asignar</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="contactInfo">Contacto (opcional)</label>
            <input id="contactInfo" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 'auto' }} />
              Departamento activo
            </label>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={savingDetails}>
            {savingDetails ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-outlined btn-block" style={{ marginTop: 8 }} onClick={handleDelete}>
              Eliminar departamento
            </button>
          )}
        </form>
      ) : (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          {department.description && <p style={{ fontSize: 13, marginBottom: 8 }}>{department.description}</p>}
          {department.contact_info && <p style={{ fontSize: 13 }}>Contacto: {department.contact_info}</p>}
        </div>
      )}

      <div className="section-header">
        <h2 className="section-title">Miembros</h2>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        {members.length === 0 && <div className="empty-state">Sin miembros cargados todavía.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map((member) => (
            <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{member.profile.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{stationName(member.profile.station_id)}</div>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-outlined"
                  style={{ padding: '4px 8px' }}
                  onClick={() => handleRemoveMember(member.id)}
                  aria-label="Quitar miembro"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <select value={newMemberProfileId} onChange={(e) => setNewMemberProfileId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">Seleccionar usuario…</option>
              {availableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={!newMemberProfileId || addingMember} onClick={handleAddMember}>
              {addingMember ? 'Agregando…' : 'Agregar'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
