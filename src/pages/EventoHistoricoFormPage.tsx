import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createStationHistoryEvent,
  fetchStationHistoryEventById,
  updateStationHistoryEvent,
} from '../lib/api/stationHistory'
import type { StationHistoryCategory } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const CATEGORY_OPTIONS: { value: StationHistoryCategory; label: string }[] = [
  { value: 'institucional', label: 'Institucional' },
  { value: 'operativo', label: 'Operativo' },
  { value: 'personal', label: 'Personal' },
  { value: 'vehiculos', label: 'Vehículos' },
  { value: 'infraestructura', label: 'Infraestructura' },
  { value: 'capacitacion', label: 'Capacitación' },
  { value: 'documentacion', label: 'Documentación' },
  { value: 'autoridad', label: 'Autoridad' },
  { value: 'otro', label: 'Otro' },
]

export function EventoHistoricoFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'secretario_regional')

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [category, setCategory] = useState<StationHistoryCategory>('institucional')
  const [isHighlighted, setIsHighlighted] = useState(false)

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchStationHistoryEventById(id).then((event) => {
      if (!active || !event) return
      setResolvedStationId(event.station_id)
      setTitle(event.title)
      setDescription(event.description ?? '')
      setEventDate(event.event_date)
      setCategory(event.category)
      setIsHighlighted(event.is_highlighted)
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
        title,
        description: description || null,
        event_date: eventDate,
        category,
        is_highlighted: isHighlighted,
      }
      if (isEditing && id) {
        await updateStationHistoryEvent(id, input)
      } else {
        await createStationHistoryEvent(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el evento histórico.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Historial Institucional">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'cargar'} eventos históricos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Evento' : 'Nuevo Evento Histórico'}>
      <h1 className="page-title">{isEditing ? 'Editar Evento' : 'Nuevo Evento Histórico'}</h1>
      <p className="page-subtitle">
        Hechos relevantes de la historia del cuartel: cambios de autoridades, hitos, reconocimientos,
        decisiones institucionales. No reemplaza la auditoría técnica del sistema.
      </p>

      {loading ? (
        <div className="empty-state">Cargando datos del evento…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="title">Título</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inauguración del cuartel, cambio de comisión directiva..." />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="eventDate">Fecha del evento</label>
              <input id="eventDate" type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="category">Categoría</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value as StationHistoryCategory)}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Detalle del hecho, contexto, personas involucradas..." />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={isHighlighted} onChange={(e) => setIsHighlighted(e.target.checked)} style={{ width: 'auto' }} />
              Marcar como evento destacado
            </label>
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
