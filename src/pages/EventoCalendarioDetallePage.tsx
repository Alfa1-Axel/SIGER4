import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { deleteCalendarEvent, fetchCalendarEventById, updateCalendarEvent } from '../lib/api/calendar'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import type { CalendarEvent, Region, Station, Subsede } from '../types/database'
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL } from './CalendarioPage'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function EventoCalendarioDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isEscuelaRole = hasRole('director_escuela', 'instructor')
  const isRegionalRole = hasRole('secretario_regional')
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null

  const [event, setEvent] = useState<CalendarEvent | null>(null)
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchCalendarEventById(id), fetchRegions(), fetchSubsedes(), fetchStations()]).then(
      ([eventData, regionsData, subsedesData, stationsData]) => {
        if (!active) return
        setEvent(eventData)
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [id])

  // Refleja calendar_events_write_admin_regional_station_escuela (migración
  // 0051) en vez de solo chequear el rol: antes se mostraba Editar/Cancelar/
  // Eliminar en CUALQUIER evento con solo tener el rol adecuado, y la RLS
  // rechazaba el guardado si el evento no era del alcance propio del usuario.
  const canManage = (() => {
    if (isAdmin || !event) return isAdmin
    if (['escuela', 'capacitacion'].includes(event.event_type)) return isEscuelaRole
    if (isRegionalRole) {
      if (event.region_id) return event.region_id === myRegionId
      if (event.station_id) return stations.find((s) => s.id === event.station_id)?.region_id === myRegionId
      if (event.subsede_id) return subsedes.find((s) => s.id === event.subsede_id)?.region_id === myRegionId
      return false
    }
    if (isStationRole) return Boolean(event.station_id) && event.station_id === myStationId
    return false
  })()

  function scopeLabel(e: CalendarEvent): string {
    if (e.station_id) return stations.find((s) => s.id === e.station_id)?.name ?? 'Cuartel'
    if (e.subsede_id) return subsedes.find((s) => s.id === e.subsede_id)?.name ?? 'Subsede'
    if (e.region_id) return regions.find((r) => r.id === e.region_id)?.name ?? 'Regional'
    return 'Escuela Regional'
  }

  async function handleCancel() {
    if (!id || !event) return
    if (!window.confirm('¿Cancelar este evento? Sigue visible en el calendario, marcado como cancelado.')) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await updateCalendarEvent(id, { status: 'cancelado' })
      setEvent(updated)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cancelar el evento.'))
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!window.confirm('¿Eliminar este evento definitivamente? Esta acción no se puede deshacer.')) return
    setError(null)
    try {
      await deleteCalendarEvent(id)
      navigate('/calendario')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos eliminar el evento.'))
    }
  }

  if (loading) {
    return (
      <AppShell title="Evento">
        <div className="empty-state">Cargando evento…</div>
      </AppShell>
    )
  }

  if (!event) {
    return (
      <AppShell title="Evento">
        <div className="empty-state">No se encontró el evento solicitado.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Evento">
      <Link to="/calendario" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Calendario
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h1 className="page-title">{event.title}</h1>
        <span className={`badge ${event.status === 'cancelado' ? 'badge-danger' : event.status === 'finalizado' ? 'badge-info' : 'badge-success'}`}>
          {EVENT_STATUS_LABEL[event.status]}
        </span>
      </div>
      <p className="page-subtitle">
        {EVENT_TYPE_LABEL[event.event_type]} · {scopeLabel(event)}
      </p>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <div>
            <strong>Inicio:</strong>{' '}
            {event.all_day
              ? new Date(event.starts_at).toLocaleDateString('es-AR', { dateStyle: 'full' })
              : new Date(event.starts_at).toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}
          </div>
          {event.ends_at && (
            <div>
              <strong>Fin:</strong> {new Date(event.ends_at).toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}
            </div>
          )}
          {event.description && (
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{event.description}</div>
          )}
          {event.notify_before_minutes && (
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Recordatorio previo: {event.notify_before_minutes} minutos antes
              {event.reminder_sent_at ? ' (ya enviado)' : ''}.
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/calendario/${event.id}/editar`} className="btn btn-outlined" style={{ padding: '8px 16px', fontSize: 13 }}>
            <Icon name="edit" size={14} />
            Editar
          </Link>
          {event.status === 'programado' && (
            <button type="button" className="btn btn-outlined" style={{ padding: '8px 16px', fontSize: 13 }} disabled={updating} onClick={handleCancel}>
              Cancelar evento
            </button>
          )}
          <button type="button" className="btn btn-outlined" style={{ padding: '8px 16px', fontSize: 13 }} onClick={handleDelete}>
            <Icon name="trash" size={14} />
            Eliminar
          </button>
        </div>
      )}
    </AppShell>
  )
}
