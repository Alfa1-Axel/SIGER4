import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
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
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { isEditConflict } from '../lib/concurrency'
import { useFormDraft } from '../hooks/useFormDraft'
import { DraftRecoveryBanner, DraftStatusLine } from '../components/FormDraftUi'
import type { RowSnapshot } from '../lib/concurrency'

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
  // La actividad tal como se abrió (con su versión) y, si otra persona la cambió
  // mientras se editaba, lo que se intentó guardar.
  const [existing, setExisting] = useState<RowSnapshot | null>(null)
  const [conflict, setConflict] = useState<{ mine: Record<string, unknown> } | null>(null)

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
          setExisting(report as unknown as RowSnapshot)
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
        setError(describeSupabaseError(err, 'No pudimos cargar los datos del informe. Reintentá en unos segundos.'))
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, departmentIdFromQuery])

  // Borrador en el servidor (0113).
  const draftValue = useMemo(
    () => ({ title, description, activityDate, activityType, stationId, subsedeId, attendeesCount, hoursWorked }),
    [title, description, activityDate, activityType, stationId, subsedeId, attendeesCount, hoursWorked],
  )
  const draft = useFormDraft({
    formKey: 'actividad-departamento',
    contextKey: isEditing ? `edit:${id}` : `nuevo:${departmentIdFromQuery ?? 'general'}`,
    value: draftValue,
    enabled: !loading && (isEditing ? Boolean(existing) : true),
    recordId: id ?? null,
    baseVersion: existing?.row_version ?? null,
  })

  function applyDraft(d: typeof draftValue) {
    setTitle(d.title)
    setDescription(d.description)
    setActivityDate(d.activityDate)
    setActivityType(d.activityType)
    setStationId(d.stationId)
    setSubsedeId(d.subsedeId)
    setAttendeesCount(d.attendeesCount)
    setHoursWorked(d.hoursWorked)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Escribí un título para la actividad, por ejemplo: "Capacitación de rescate vehicular".')
    if (!activityDate) return setError('Ingresá la fecha de la actividad.')
    if (!resolvedDepartmentId) return setError('No pudimos determinar el departamento de esta actividad.')

    setSubmitting(true)
    let attempted: Record<string, unknown> | null = null
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
        attempted = input
        await updateDepartmentActivityReport(id, input, existing?.row_version)
      } else {
        // El id lo eligió el borrador de antemano: si la respuesta se pierde y se reintenta,
        // el segundo intento no duplica la actividad.
        try {
          await createDepartmentActivityReport({ ...input, id: draft.clientRecordId, created_by_profile_id: currentProfile?.id ?? null })
        } catch (createErr) {
          if (postgrestCode(createErr) !== '23505' || !(await fetchDepartmentActivityReportById(draft.clientRecordId))) throw createErr
        }
      }
      void draft.resolve()
      navigate(`/departamentos/${resolvedDepartmentId}`, {
        state: { notice: isEditing ? 'Se guardaron los cambios de la actividad.' : 'Actividad registrada. Ya suma en las estadísticas del departamento.' },
      })
    } catch (err) {
      if (isEditing && attempted && isEditConflict(err)) {
        setConflict({ mine: attempted })
      } else {
        setError(describeSupabaseError(err, 'No pudimos guardar la actividad. Reintentá en unos segundos.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Registro de actividad">
        <div className="loading-state" role="status">Cargando…</div>
      </AppShell>
    )
  }

  if (!resolvedDepartmentId || !department) {
    return (
      <AppShell title="Registro de actividad">
        <AccessDenied
          title="No encontramos la actividad"
          message="Puede que la hayan eliminado o que el departamento ya no exista."
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  if (!canLogActivity) {
    return (
      <AppShell title="Registro de actividad">
        <AccessDenied
          title={isEditing ? 'No podés editar esta actividad' : 'No podés registrar actividad acá'}
          message="Registran actividad el coordinador del departamento, sus miembros, el Secretario Regional e Informática."
          backTo={`/departamentos/${resolvedDepartmentId}`}
          backLabel={`Volver a ${department.name}`}
        />
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar actividad' : 'Registrar actividad'}>
      <Link to={`/departamentos/${resolvedDepartmentId}`} className="back-link">
        ← Volver a {department.name}
      </Link>
      <h1 className="page-title">{isEditing ? 'Editar actividad' : 'Registrar actividad'}</h1>
      <p className="page-subtitle">
        Reunión, capacitación o práctica de {department.name}, con horas y asistentes para las estadísticas. Para guardar un
        acta o un informe completo, usá "Cargar informe o acta".
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <DraftRecoveryBanner draft={draft} subject="una actividad" onApply={applyDraft} currentVersion={existing?.row_version ?? null} />
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
                className="chip"
                aria-pressed={activityType === value}
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

        {conflict && existing && id && (
          <EditConflictPanel
            table="department_activity_reports"
            recordId={id}
            base={existing}
            mine={conflict.mine}
            onSave={(patch, version) => updateDepartmentActivityReport(id, patch as Parameters<typeof updateDepartmentActivityReport>[1], version)}
            onResolved={() => navigate(`/departamentos/${resolvedDepartmentId}`, { state: { notice: 'Se guardaron los cambios de la actividad.' } })}
            onDiscard={() => window.location.reload()}
            onClose={() => setConflict(null)}
          />
        )}

        <DraftStatusLine draft={draft} isNew={!isEditing} onApply={applyDraft} />

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar actividad'}
        </button>
      </form>
    </AppShell>
  )
}
