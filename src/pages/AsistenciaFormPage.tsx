import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createAttendanceSummary,
  fetchAttendanceSummaryById,
  updateAttendanceSummary,
} from '../lib/api/attendance'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function AsistenciaFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_regional')

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [attendanceRate, setAttendanceRate] = useState('')
  const [totalMembers, setTotalMembers] = useState('')
  const [presentAverage, setPresentAverage] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchAttendanceSummaryById(id).then((summary) => {
      if (!active || !summary) return
      setResolvedStationId(summary.station_id)
      setPeriodStart(summary.period_start)
      setPeriodEnd(summary.period_end)
      setAttendanceRate(String(summary.attendance_rate))
      setTotalMembers(String(summary.total_members))
      setPresentAverage(String(summary.present_average))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input = {
        station_id: resolvedStationId,
        period_start: periodStart,
        period_end: periodEnd,
        attendance_rate: Number(attendanceRate),
        total_members: Number(totalMembers),
        present_average: Number(presentAverage),
      }
      if (isEditing && id) {
        await updateAttendanceSummary(id, input)
      } else {
        await createAttendanceSummary(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el resumen de asistencia.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Asistencia">
        <div className="empty-state">No tenés permisos para cargar resúmenes de asistencia.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Asistencia' : 'Nuevo Resumen de Asistencia'}>
      <h1 className="page-title">{isEditing ? 'Editar Asistencia' : 'Nuevo Resumen de Asistencia'}</h1>
      <p className="page-subtitle">Resumen de asistencia del cuartel para un período determinado.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del resumen…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="periodStart">Inicio del período</label>
            <input id="periodStart" type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="periodEnd">Fin del período</label>
            <input id="periodEnd" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="attendanceRate">Tasa de asistencia (%)</label>
            <input
              id="attendanceRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={attendanceRate}
              onChange={(e) => setAttendanceRate(e.target.value)}
              placeholder="85.5"
            />
          </div>

          <div className="field">
            <label htmlFor="totalMembers">Total de miembros</label>
            <input
              id="totalMembers"
              type="number"
              min="0"
              required
              value={totalMembers}
              onChange={(e) => setTotalMembers(e.target.value)}
              placeholder="42"
            />
          </div>

          <div className="field">
            <label htmlFor="presentAverage">Promedio de presentes</label>
            <input
              id="presentAverage"
              type="number"
              min="0"
              step="0.01"
              required
              value={presentAverage}
              onChange={(e) => setPresentAverage(e.target.value)}
              placeholder="36"
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
