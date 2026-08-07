import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createInterventionSummary,
  fetchInterventionSummaryById,
  updateInterventionSummary,
} from '../lib/api/interventions'
import { fetchStationById } from '../lib/api/stations'
import type { InterventionTimeOfDay } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const TIME_OF_DAY_OPTIONS: { value: InterventionTimeOfDay; label: string }[] = [
  { value: 'diurno', label: 'Diurno' },
  { value: 'nocturno', label: 'Nocturno' },
  { value: 'mixto', label: 'Mixto' },
]

export function IntervencionFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const isRegionalRole = hasRole('secretario_regional')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [targetStationRegionId, setTargetStationRegionId] = useState<string | null>(null)
  // intervention_summaries_write_admin_regional_station (RLS): secretario_regional
  // solo dentro de su propia región, roles de cuartel solo su propio cuartel —
  // se revalida contra el cuartel real del registro, no solo el rol del actor.
  const canEdit =
    isAdmin ||
    (isRegionalRole && Boolean(targetStationRegionId) && targetStationRegionId === myRegionId) ||
    (isStationRole && Boolean(resolvedStationId) && resolvedStationId === myStationId)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [category, setCategory] = useState('')
  const [totalCount, setTotalCount] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<InterventionTimeOfDay | ''>('')
  const [personnelCount, setPersonnelCount] = useState('')
  const [vehiclesCount, setVehiclesCount] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [observations, setObservations] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchInterventionSummaryById(id).then((summary) => {
      if (!active || !summary) return
      setResolvedStationId(summary.station_id)
      setPeriodStart(summary.period_start)
      setPeriodEnd(summary.period_end)
      setCategory(summary.category)
      setTotalCount(String(summary.total_count))
      setTimeOfDay(summary.time_of_day ?? '')
      setPersonnelCount(String(summary.personnel_count))
      setVehiclesCount(String(summary.vehicles_count))
      setWorkHours(String(summary.work_hours))
      setObservations(summary.observations ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!resolvedStationId) return
    let active = true
    fetchStationById(resolvedStationId).then((s) => {
      if (active) setTargetStationRegionId(s?.region_id ?? null)
    })
    return () => {
      active = false
    }
  }, [resolvedStationId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input = {
        station_id: resolvedStationId,
        period_start: periodStart,
        period_end: periodEnd,
        category,
        total_count: Number(totalCount),
        time_of_day: timeOfDay || null,
        personnel_count: personnelCount ? Number(personnelCount) : 0,
        vehicles_count: vehiclesCount ? Number(vehiclesCount) : 0,
        work_hours: workHours ? Number(workHours) : 0,
        observations: observations || null,
      }
      if (isEditing && id) {
        await updateInterventionSummary(id, input)
      } else {
        await createInterventionSummary(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el resumen de intervenciones.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Intervenciones">
        <div className="empty-state">No tenés permisos para cargar resúmenes de intervenciones.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Intervenciones' : 'Nuevo Resumen de Intervenciones'}>
      <h1 className="page-title">{isEditing ? 'Editar Intervenciones' : 'Nuevo Resumen de Intervenciones'}</h1>
      <p className="page-subtitle">Resumen de intervenciones del cuartel para un período determinado.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del resumen…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="periodStart">Inicio del período</label>
              <input id="periodStart" type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="periodEnd">Fin del período</label>
              <input id="periodEnd" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="category">Tipo de intervención</label>
            <input
              id="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="incendio_estructural"
            />
          </div>

          <div className="field">
            <label>Franja horaria predominante (opcional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIME_OF_DAY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeOfDay((current) => (current === option.value ? '' : option.value))}
                  className={`btn ${timeOfDay === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="totalCount">Cantidad total</label>
              <input
                id="totalCount"
                type="number"
                min="0"
                required
                value={totalCount}
                onChange={(e) => setTotalCount(e.target.value)}
                placeholder="3"
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="personnelCount">Cantidad de personal</label>
              <input
                id="personnelCount"
                type="number"
                min="0"
                value={personnelCount}
                onChange={(e) => setPersonnelCount(e.target.value)}
                placeholder="8"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="vehiclesCount">Cantidad de móviles</label>
              <input
                id="vehiclesCount"
                type="number"
                min="0"
                value={vehiclesCount}
                onChange={(e) => setVehiclesCount(e.target.value)}
                placeholder="2"
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="workHours">Horas de trabajo</label>
              <input
                id="workHours"
                type="number"
                min="0"
                step="0.5"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                placeholder="12.5"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Notas generales del período (sin datos de víctimas ni direcciones exactas)."
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
