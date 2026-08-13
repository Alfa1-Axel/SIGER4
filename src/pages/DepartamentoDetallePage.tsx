import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ContactLink } from '../components/ui/ContactLink'
import {
  fetchDepartmentById,
  updateDepartment,
  deleteDepartment,
  fetchDepartmentMembers,
  addDepartmentMember,
  removeDepartmentMember,
  fetchDepartmentManualMembers,
  createDepartmentManualMember,
  updateDepartmentManualMember,
  type DepartmentMemberWithProfile,
} from '../lib/api/departments'
import { fetchDepartmentActivityReports, deleteDepartmentActivityReport } from '../lib/api/departmentActivityReports'
import { fetchProfiles } from '../lib/api/users'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import type {
  Department,
  DepartmentActivityReport,
  DepartmentActivityType,
  DepartmentManualMember,
  Profile,
  Station,
  Subsede,
} from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export const DEPARTMENT_ACTIVITY_TYPE_LABEL: Record<DepartmentActivityType, string> = {
  reunion: 'Reunión',
  capacitacion: 'Capacitación',
  practica: 'Práctica',
  mantenimiento: 'Mantenimiento',
  gestion: 'Gestión',
  informe: 'Informe',
  otro: 'Otro',
}

const MONTH_LABEL_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Fila de barra simple (una sola serie, sin librería de gráficos, ver
// styles.css .simple-bar-*) — el ancho de la barra es proporcional al valor
// más alto del conjunto (maxValue), nunca a un eje fijo, para que la barra
// más grande siempre llegue al 100% del ancho disponible.
function SimpleBarRow({ label, value, maxValue, formatValue }: { label: string; value: number; maxValue: number; formatValue?: (v: number) => string }) {
  const percent = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 3 : 0) : 0
  return (
    <div className="simple-bar-row">
      <span className="simple-bar-label" title={label}>
        {label}
      </span>
      <div className="simple-bar-track">
        <div className="simple-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="simple-bar-value">{formatValue ? formatValue(value) : value}</span>
    </div>
  )
}

export function DepartamentoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin, hasRole } = useAuth()

  const [department, setDepartment] = useState<Department | null>(null)
  const [members, setMembers] = useState<DepartmentMemberWithProfile[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [reports, setReports] = useState<DepartmentActivityReport[]>([])
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

  const [manualMembers, setManualMembers] = useState<DepartmentManualMember[]>([])
  const [manualMemberForm, setManualMemberForm] = useState<{
    id: string | null
    firstName: string
    lastName: string
    stationId: string
    roleFunction: string
    contactInfo: string
    observations: string
    isActive: boolean
  } | null>(null)
  const [savingManualMember, setSavingManualMember] = useState(false)
  const [showInactiveManualMembers, setShowInactiveManualMembers] = useState(false)

  const [typeFilter, setTypeFilter] = useState('')
  const [stationFilter, setStationFilter] = useState('')
  const [subsedeFilter, setSubsedeFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  const canManage = isAdmin || (department?.coordinator_profile_id && department.coordinator_profile_id === currentProfile?.id)
  const isMember = Boolean(currentProfile?.id) && members.some((m) => m.profile_id === currentProfile?.id)
  // Cualquier miembro puede cargar/editar informes de actividad de su
  // departamento (department_members no distingue roles internos, ver
  // migración 0061) -- no solo el coordinador, a diferencia de canManage
  // (que rige los datos del departamento en sí y la lista de miembros).
  // secretario_regional (is_regional_role()) tiene ese mismo permiso a nivel
  // RLS para CUALQUIER departamento, sea o no miembro/coordinador (ver
  // department_manual_members_write_member_or_admin, migración 0062, y la
  // policy análoga de department_activity_reports) -- se suma acá para que
  // la UI deje de ser más estricta que el backend.
  const canLogActivity = canManage || isMember || hasRole('secretario_regional')

  async function reload() {
    if (!id) return
    const [departmentData, membersData, manualMembersData, reportsData] = await Promise.all([
      fetchDepartmentById(id),
      fetchDepartmentMembers(id),
      fetchDepartmentManualMembers(id),
      fetchDepartmentActivityReports(id),
    ])
    if (departmentData) {
      setDepartment(departmentData)
      setName(departmentData.name)
      setDescription(departmentData.description ?? '')
      setCoordinatorProfileId(departmentData.coordinator_profile_id ?? '')
      setContactInfo(departmentData.contact_info ?? '')
      setIsActive(departmentData.is_active)
    }
    setMembers(membersData)
    setManualMembers(manualMembersData)
    setReports(reportsData)
  }

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      fetchDepartmentById(id),
      fetchDepartmentMembers(id),
      fetchDepartmentManualMembers(id),
      fetchDepartmentActivityReports(id),
      fetchProfiles(),
      fetchStations(),
      fetchSubsedes(),
    ])
      .then(([departmentData, membersData, manualMembersData, reportsData, profilesData, stationsData, subsedesData]) => {
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
        setManualMembers(manualMembersData)
        setReports(reportsData)
        setProfiles(profilesData)
        setStations(stationsData)
        setSubsedes(subsedesData)
        setLoading(false)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar el departamento')))
    return () => {
      active = false
    }
  }, [id])

  function stationName(stationId: string | null): string {
    if (!stationId) return 'Sin cuartel asignado'
    return stations.find((s) => s.id === stationId)?.name ?? 'Sin cuartel asignado'
  }

  function subsedeName(subsedeId: string | null): string {
    if (!subsedeId) return '—'
    return subsedes.find((s) => s.id === subsedeId)?.name ?? '—'
  }

  const filteredReports = useMemo(() => {
    return reports.filter(
      (r) =>
        (!typeFilter || r.activity_type === typeFilter) &&
        (!stationFilter || r.station_id === stationFilter) &&
        (!subsedeFilter || r.subsede_id === subsedeFilter) &&
        (!dateFromFilter || r.activity_date >= dateFromFilter) &&
        (!dateToFilter || r.activity_date <= dateToFilter),
    )
  }, [reports, typeFilter, stationFilter, subsedeFilter, dateFromFilter, dateToFilter])

  // KPIs y datos de gráficos se calculan SIEMPRE sobre filteredReports (no
  // sobre el total) -- así los filtros de arriba también recalculan las
  // estadísticas livianas, no solo la lista.
  const kpis = useMemo(() => {
    const totalActivities = filteredReports.length
    const totalHours = filteredReports.reduce((sum, r) => sum + Number(r.hours_worked), 0)
    const totalAttendees = filteredReports.reduce((sum, r) => sum + r.attendees_count, 0)
    return { totalActivities, totalHours, totalAttendees }
  }, [filteredReports])

  const byType = useMemo(() => {
    const counts = new Map<DepartmentActivityType, number>()
    for (const r of filteredReports) counts.set(r.activity_type, (counts.get(r.activity_type) ?? 0) + 1)
    return (Object.keys(DEPARTMENT_ACTIVITY_TYPE_LABEL) as DepartmentActivityType[])
      .map((type) => ({ type, label: DEPARTMENT_ACTIVITY_TYPE_LABEL[type], count: counts.get(type) ?? 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [filteredReports])

  // Últimos 6 meses con actividad (incluyendo el actual), para no mostrar un
  // gráfico vacío de 12 meses cuando recién se está empezando a cargar
  // informes -- si hay actividad más vieja que eso, se sigue viendo en la
  // lista/filtros, solo no entra en el gráfico de barras por mes.
  const byMonth = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; activities: number; hours: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ key, label: `${MONTH_LABEL_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, activities: 0, hours: 0 })
    }
    const byKey = new Map(months.map((m) => [m.key, m]))
    for (const r of filteredReports) {
      const key = r.activity_date.slice(0, 7)
      const bucket = byKey.get(key)
      if (bucket) {
        bucket.activities += 1
        bucket.hours += Number(r.hours_worked)
      }
    }
    return months
  }, [filteredReports])

  const byStation = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of filteredReports) {
      const label = r.station_id ? stationName(r.station_id) : r.subsede_id ? subsedeName(r.subsede_id) : null
      if (!label) continue
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReports, stations, subsedes])

  async function handleDeleteReport(report: DepartmentActivityReport) {
    if (!window.confirm(`¿Eliminar el informe "${report.title}"? Esta acción no se puede deshacer.`)) return
    setError(null)
    setDeletingReportId(report.id)
    try {
      await deleteDepartmentActivityReport(report.id)
      setReports((prev) => prev.filter((r) => r.id !== report.id))
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos eliminar el informe.'))
    } finally {
      setDeletingReportId(null)
    }
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

  function startNewManualMember() {
    setManualMemberForm({
      id: null,
      firstName: '',
      lastName: '',
      stationId: '',
      roleFunction: '',
      contactInfo: '',
      observations: '',
      isActive: true,
    })
  }

  function startEditManualMember(member: DepartmentManualMember) {
    setManualMemberForm({
      id: member.id,
      firstName: member.first_name,
      lastName: member.last_name,
      stationId: member.station_id ?? '',
      roleFunction: member.role_function ?? '',
      contactInfo: member.contact_info ?? '',
      observations: member.observations ?? '',
      isActive: member.is_active,
    })
  }

  async function handleSaveManualMember(event: FormEvent) {
    event.preventDefault()
    if (!id || !manualMemberForm) return
    setError(null)
    setSavingManualMember(true)
    try {
      const input = {
        department_id: id,
        first_name: manualMemberForm.firstName,
        last_name: manualMemberForm.lastName,
        station_id: manualMemberForm.stationId || null,
        role_function: manualMemberForm.roleFunction || null,
        contact_info: manualMemberForm.contactInfo || null,
        observations: manualMemberForm.observations || null,
        is_active: manualMemberForm.isActive,
      }
      if (manualMemberForm.id) {
        await updateDepartmentManualMember(manualMemberForm.id, input)
      } else {
        await createDepartmentManualMember({ ...input, created_by_profile_id: currentProfile?.id ?? null })
      }
      setManualMemberForm(null)
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el integrante.'))
    } finally {
      setSavingManualMember(false)
    }
  }

  async function handleToggleManualMemberActive(member: DepartmentManualMember) {
    setError(null)
    try {
      await updateDepartmentManualMember(member.id, { is_active: !member.is_active })
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos actualizar el integrante.'))
    }
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
          {department.contact_info && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span>Contacto:</span>
              <ContactLink kind="auto" value={department.contact_info} />
            </div>
          )}
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
                <div className="contact-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <ContactLink kind="email" value={member.profile.email} />
                  {member.profile.phone && <ContactLink kind="phone" value={member.profile.phone} />}
                </div>
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

      <div className="section-header">
        <h2 className="section-title">Integrantes sin usuario</h2>
        {canLogActivity && !manualMemberForm && (
          <button type="button" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={startNewManualMember}>
            <Icon name="plus" size={14} />
            Nuevo integrante
          </button>
        )}
      </div>
      <p className="page-subtitle" style={{ marginTop: -8, marginBottom: 12 }}>
        Personas que integran el departamento sin cuenta en el sistema (no ocupan usuario ni requieren rol).
      </p>
      <div className="card" style={{ marginBottom: 20 }}>
        {manualMemberForm && (
          <form
            onSubmit={handleSaveManualMember}
            className="card-solid"
            style={{ marginBottom: 16, border: '1px solid var(--color-border)' }}
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="manualFirstName">Nombre</label>
                <input
                  id="manualFirstName"
                  required
                  value={manualMemberForm.firstName}
                  onChange={(e) => setManualMemberForm({ ...manualMemberForm, firstName: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="manualLastName">Apellido</label>
                <input
                  id="manualLastName"
                  required
                  value={manualMemberForm.lastName}
                  onChange={(e) => setManualMemberForm({ ...manualMemberForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="manualStation">Cuartel (opcional)</label>
                <select
                  id="manualStation"
                  value={manualMemberForm.stationId}
                  onChange={(e) => setManualMemberForm({ ...manualMemberForm, stationId: e.target.value })}
                >
                  <option value="">Sin asignar</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="manualRoleFunction">Cargo / función (opcional)</label>
                <input
                  id="manualRoleFunction"
                  value={manualMemberForm.roleFunction}
                  onChange={(e) => setManualMemberForm({ ...manualMemberForm, roleFunction: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="manualContactInfo">Contacto (opcional)</label>
              <input
                id="manualContactInfo"
                value={manualMemberForm.contactInfo}
                onChange={(e) => setManualMemberForm({ ...manualMemberForm, contactInfo: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="manualObservations">Observaciones (opcional)</label>
              <textarea
                id="manualObservations"
                rows={2}
                value={manualMemberForm.observations}
                onChange={(e) => setManualMemberForm({ ...manualMemberForm, observations: e.target.value })}
              />
            </div>
            {manualMemberForm.id && (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={manualMemberForm.isActive}
                    onChange={(e) => setManualMemberForm({ ...manualMemberForm, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Integrante activo
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={savingManualMember}>
                {savingManualMember ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="btn btn-outlined" onClick={() => setManualMemberForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {manualMembers.filter((m) => m.is_active).length === 0 && !manualMemberForm && (
          <div className="empty-state">Sin integrantes manuales cargados todavía.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {manualMembers
            .filter((m) => showInactiveManualMembers || m.is_active)
            .map((member) => (
              <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: member.is_active ? 1 : 0.55 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {member.first_name} {member.last_name}
                    {!member.is_active && (
                      <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {[member.role_function, stationName(member.station_id)].filter(Boolean).join(' · ')}
                  </div>
                  {member.contact_info && <ContactLink kind="auto" value={member.contact_info} />}
                </div>
                {canLogActivity && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-outlined"
                      style={{ padding: '4px 8px' }}
                      onClick={() => startEditManualMember(member)}
                      aria-label="Editar integrante"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outlined"
                      style={{ padding: '4px 8px' }}
                      onClick={() => handleToggleManualMemberActive(member)}
                      aria-label={member.is_active ? 'Desactivar integrante' : 'Reactivar integrante'}
                    >
                      <Icon name={member.is_active ? 'trash' : 'check'} size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>

        {manualMembers.some((m) => !m.is_active) && (
          <button
            type="button"
            className="link-muted"
            style={{ marginTop: 12, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setShowInactiveManualMembers((v) => !v)}
          >
            {showInactiveManualMembers ? 'Ocultar inactivos' : 'Mostrar inactivos'}
          </button>
        )}
      </div>

      <div className="section-header">
        <h2 className="section-title">Actividad / Informes</h2>
        {canLogActivity && (
          <Link to={`/departamentos/${department.id}/informes/nuevo`} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>
            <Icon name="plus" size={14} />
            Nuevo informe
          </Link>
        )}
      </div>

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Actividades</div>
          <div className="kpi-value">{kpis.totalActivities}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Horas acumuladas</div>
          <div className="kpi-value">{kpis.totalHours.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Asistentes acumulados</div>
          <div className="kpi-value">{kpis.totalAttendees}</div>
        </div>
      </div>

      {reports.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="kpi-label" style={{ marginBottom: 10 }}>
                Actividades por mes (últimos 6 meses)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byMonth.map((m) => (
                  <SimpleBarRow key={m.key} label={m.label} value={m.activities} maxValue={Math.max(...byMonth.map((x) => x.activities), 1)} />
                ))}
              </div>
            </div>

            <div>
              <div className="kpi-label" style={{ marginBottom: 10 }}>
                Horas por mes (últimos 6 meses)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byMonth.map((m) => (
                  <SimpleBarRow
                    key={m.key}
                    label={m.label}
                    value={m.hours}
                    maxValue={Math.max(...byMonth.map((x) => x.hours), 1)}
                    formatValue={(v) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                  />
                ))}
              </div>
            </div>

            {byType.length > 0 && (
              <div>
                <div className="kpi-label" style={{ marginBottom: 10 }}>
                  Actividad por tipo
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {byType.map((row) => (
                    <SimpleBarRow key={row.type} label={row.label} value={row.count} maxValue={byType[0].count} />
                  ))}
                </div>
              </div>
            )}

            {byStation.length > 0 && (
              <div>
                <div className="kpi-label" style={{ marginBottom: 10 }}>
                  Cuarteles / subsedes involucrados
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {byStation.map((row) => (
                    <SimpleBarRow key={row.label} label={row.label} value={row.count} maxValue={byStation[0].count} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: reports.length > 0 ? 16 : 0 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos los tipos</option>
            {(Object.entries(DEPARTMENT_ACTIVITY_TYPE_LABEL) as [DepartmentActivityType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos los cuarteles</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={subsedeFilter} onChange={(e) => setSubsedeFilter(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todas las subsedes</option>
            {subsedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} style={{ fontSize: 12 }} aria-label="Desde" />
          <input type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} style={{ fontSize: 12 }} aria-label="Hasta" />
        </div>

        {reports.length === 0 && <div className="empty-state">Sin informes de actividad cargados todavía.</div>}
        {reports.length > 0 && filteredReports.length === 0 && <div className="empty-state">Ningún informe coincide con los filtros.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredReports.map((report) => {
            // Editar: cualquiera con canLogActivity (coordinador, miembro, o
            // rol regional/admin) puede editar CUALQUIER informe del
            // departamento, coincide con la RLS de escritura (migración
            // 0061) -- distinto del borrado, más restrictivo (ver
            // canDeleteReport).
            const canEditReport = canLogActivity
            const canDeleteReport = isAdmin || report.created_by_profile_id === currentProfile?.id
            return (
              <div key={report.id} className="card-solid list-item">
                <div className="list-item-body">
                  <h3 className="list-item-title">{report.title}</h3>
                  {report.description && <p className="list-item-subtitle">{report.description}</p>}
                  <div className="list-item-meta">
                    <span className="badge badge-info">{DEPARTMENT_ACTIVITY_TYPE_LABEL[report.activity_type]}</span>
                    <span>{new Date(report.activity_date + 'T00:00:00').toLocaleDateString('es-AR', { dateStyle: 'medium' })}</span>
                    {report.attendees_count > 0 && <span>{report.attendees_count} asistentes</span>}
                    {Number(report.hours_worked) > 0 && <span>{Number(report.hours_worked).toLocaleString('es-AR')} hs</span>}
                    {(report.station_id || report.subsede_id) && (
                      <span>{report.station_id ? stationName(report.station_id) : subsedeName(report.subsede_id)}</span>
                    )}
                  </div>
                </div>
                {(canEditReport || canDeleteReport) && (
                  <div className="list-item-actions">
                    {canEditReport && (
                      <Link to={`/informes/${report.id}/editar`} className="btn btn-outlined btn-icon-sm" aria-label="Editar">
                        <Icon name="edit" size={14} />
                      </Link>
                    )}
                    {canDeleteReport && (
                      <button
                        type="button"
                        className="btn btn-outlined btn-icon-sm"
                        disabled={deletingReportId === report.id}
                        onClick={() => handleDeleteReport(report)}
                        aria-label="Eliminar"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
