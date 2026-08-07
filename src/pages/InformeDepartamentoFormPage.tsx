import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createDepartmentActivityReport,
  fetchDepartmentActivityReportById,
  updateDepartmentActivityReport,
} from '../lib/api/departmentActivityReports'
import { fetchDepartmentById, fetchDepartmentMembers } from '../lib/api/departments'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { DEPARTMENT_ACTIVITY_TYPE_LABEL } from './DepartamentoDetallePage'
import type { Department, DepartmentActivityType, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

function todayDateInputValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Ruta de creacion: /departamentos/:departmentId/informes/nuevo (mismo
// patron que /cuarteles/:stationId/vehiculos/nuevo). Ruta de edicion:
// /informes/:id/editar (top-level, sin parentId en el path -- el propio
// informe ya trae department_id, mismo patron que /vehiculos/:id/editar).
export function InformeDepartamentoFormPage() {
  const { departmentId: departmentIdFromQuery, id } = useParams<{ departmentId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin, hasRole } = useAuth()

  const [department, setDepartment] = useState<Department | null>(null)
  const [resolvedDepartmentId, setResolvedDepartmentId] = useState(departmentIdFromQuery ?? '')
  const [stations, setStations] = useState<Station[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [canLogActivity, setCanLogActivity] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [activityDate, setActivityDate] = useState(todayDateInputValue())
  const [activityType, setActivityType] = useState<DepartmentActivityType>('reunion')
  const [stationId, setStationId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [attendeesCount, setAttendeesCount] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let deptId = departmentIdFromQuery ?? ''
        if (isEditing && id) {
          const report = await fetchDepartmentActivityReportById(id)
          if (!active) return
          if (!report) {
            setLoading(false)
            return
          }
          deptId = report.department_id
          setTitle(report.title)
          setDescription(report.description ?? '')
          setActivityDate(report.activity_date)
          setActivityType(report.activity_type)
          setStationId(report.station_id ?? '')
          setSubsedeId(report.subsede_id ?? '')
          setAttendeesCount(report.attendees_count ? String(report.attendees_count) : '')
          setHoursWorked(Number(report.hours_worked) ? String(report.hours_worked) : '')
        }
        setResolvedDepartmentId(deptId)

        const [departmentData, membersData, stationsData, subsedesData] = await Promise.all([
          deptId ? fetchDepartmentById(deptId) : Promise.resolve(null),
          deptId ? fetchDepartmentMembers(deptId) : Promise.resolve([]),
          fetchStations(),
          fetchSubsedes(),
        ])
        if (!active) return
        setDepartment(departmentData)
        setStations(stationsData)
        setSubsedes(subsedesData)
        // Mismo criterio que canLogActivity en DepartamentoDetallePage.tsx:
        // coordinador, cualquier miembro, o rol regional/admin.
        const isCoordinator = Boolean(departmentData?.coordinator_profile_id) && departmentData?.coordinator_profile_id === currentProfile?.id
        const isMember = membersData.some((m) => m.profile_id === currentProfile?.id)
        setCanLogActivity(isAdmin || hasRole('secretario_regional') || isCoordinator || isMember)
        setLoading(false)
      } catch (err) {
        if (!active) return
        setError(describeSupabaseError(err, 'Error al cargar los datos del informe.'))
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, departmentIdFromQuery])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Ingresá un título para el informe.')
    if (!activityDate) return setError('Ingresá la fecha de la actividad.')
    if (!resolvedDepartmentId) return setError('No pudimos determinar el departamento de este informe.')

    setSubmitting(true)
    try {
      const input = {
        department_id: resolvedDepartmentId,
        title: title.trim(),
        description: description || null,
        activity_date: activityDate,
        activity_type: activityType,
        station_id: stationId || null,
        subsede_id: subsedeId || null,
        attendees_count: attendeesCount ? Number(attendeesCount) : 0,
        hours_worked: hoursWorked ? Number(hoursWorked) : 0,
      }
      if (isEditing && id) {
        await updateDepartmentActivityReport(id, input)
      } else {
        await createDepartmentActivityReport({ ...input, created_by_profile_id: currentProfile?.id ?? null })
      }
      navigate(`/departamentos/${resolvedDepartmentId}`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el informe.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Informe de actividad">
        <div className="empty-state">Cargando…</div>
      </AppShell>
    )
  }

  if (!resolvedDepartmentId || !department) {
    return (
      <AppShell title="Informe de actividad">
        <div className="empty-state">No se encontró el departamento o el informe solicitado.</div>
      </AppShell>
    )
  }

  if (!canLogActivity) {
    return (
      <AppShell title="Informe de actividad">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'cargar'} informes de este departamento.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Informe' : 'Nuevo Informe'}>
      <Link
        to={`/departamentos/${resolvedDepartmentId}`}
        className="link-muted"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}
      >
        ← Volver a {department.name}
      </Link>
      <h1 className="page-title">{isEditing ? 'Editar Informe' : 'Nuevo Informe'}</h1>
      <p className="page-subtitle">Actividad de {department.name}.</p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Capacitación de rescate vehicular" />
        </div>

        <div className="field">
          <label htmlFor="description">Descripción (opcional)</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="field">
          <label>Tipo de actividad</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Object.entries(DEPARTMENT_ACTIVITY_TYPE_LABEL) as [DepartmentActivityType, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActivityType(value)}
                className={`btn ${activityType === value ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="activityDate">Fecha</label>
          <input id="activityDate" type="date" required value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="attendeesCount">Asistentes (opcional)</label>
            <input
              id="attendeesCount"
              type="number"
              min="0"
              value={attendeesCount}
              onChange={(e) => setAttendeesCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="hoursWorked">Horas (opcional)</label>
            <input id="hoursWorked" type="number" min="0" step="0.5" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="station">Cuartel (opcional)</label>
          <select id="station" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Sin asignar</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="subsede">Subsede (opcional)</label>
          <select id="subsede" value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
            <option value="">Sin asignar</option>
            {subsedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar informe'}
        </button>
      </form>
    </AppShell>
  )
}
