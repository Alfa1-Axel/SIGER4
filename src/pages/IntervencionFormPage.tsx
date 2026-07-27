import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createInterventionSummary,
  fetchInterventionSummaryById,
  updateInterventionSummary,
} from '../lib/api/interventions'

export function IntervencionFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [category, setCategory] = useState('')
  const [totalCount, setTotalCount] = useState('')

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
        category,
        total_count: Number(totalCount),
      }
      if (isEditing && id) {
        await updateInterventionSummary(id, input)
      } else {
        await createInterventionSummary(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el resumen de intervenciones.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={isEditing ? 'Editar Intervenciones' : 'Nuevo Resumen de Intervenciones'}>
      <h1 className="page-title">{isEditing ? 'Editar Intervenciones' : 'Nuevo Resumen de Intervenciones'}</h1>
      <p className="page-subtitle">Resumen de intervenciones del cuartel para un período determinado.</p>

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
            <label htmlFor="category">Categoría</label>
            <input
              id="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="incendio_estructural"
            />
          </div>

          <div className="field">
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

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
