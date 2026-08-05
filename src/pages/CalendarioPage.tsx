import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchCalendarEvents } from '../lib/api/calendar'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import type { CalendarEvent, CalendarEventStatus, CalendarEventType, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  regional: 'Regional',
  cuartel: 'Cuartel',
  escuela: 'Escuela',
  capacitacion: 'Capacitación',
  vencimiento: 'Vencimiento',
  guardia: 'Guardia',
  reunion: 'Reunión',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
}

export const EVENT_STATUS_LABEL: Record<CalendarEventStatus, string> = {
  programado: 'Programado',
  cancelado: 'Cancelado',
  finalizado: 'Finalizado',
}

const EVENT_STATUS_BADGE: Record<CalendarEventStatus, string> = {
  programado: 'badge-success',
  cancelado: 'badge-danger',
  finalizado: 'badge-info',
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Grilla de 6 semanas (42 días) empezando en lunes, suficiente para
// cualquier mes sin lógica de "semanas variables" — celdas fuera del mes
// quedan atenuadas.
function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7 // lunes=0
  const gridStart = new Date(year, month, 1 - firstWeekday)
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
}

export function CalendarioPage() {
  const { isAdmin, hasRole, profile } = useAuth()
  const canCreate =
    isAdmin ||
    hasRole('secretario_regional', 'director_escuela', 'instructor', 'presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision')

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<'mes' | 'lista'>('mes')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const [typeFilter, setTypeFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([fetchCalendarEvents(), fetchRegions(), fetchSubsedes(), fetchStations()])
      .then(([eventsData, regionsData, subsedesData, stationsData]) => {
        if (!active) return
        setEvents(eventsData)
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar el calendario'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  function scopeLabel(event: CalendarEvent): string {
    if (event.station_id) return stations.find((s) => s.id === event.station_id)?.name ?? 'Cuartel'
    if (event.subsede_id) return subsedes.find((s) => s.id === event.subsede_id)?.name ?? 'Subsede'
    if (event.region_id) return regions.find((r) => r.id === event.region_id)?.name ?? 'Regional'
    return 'Escuela Regional'
  }

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (!typeFilter || e.event_type === typeFilter) &&
          (!statusFilter || e.status === statusFilter) &&
          (!scopeFilter ||
            (scopeFilter === 'mi_cuartel' && e.station_id === profile?.station_id) ||
            (scopeFilter === 'escuela' && (e.event_type === 'escuela' || e.event_type === 'capacitacion'))),
      ),
    [events, typeFilter, statusFilter, scopeFilter, profile?.station_id],
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of filteredEvents) {
      const key = startOfDay(new Date(event.starts_at)).toDateString()
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [filteredEvents])

  const monthGrid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const selectedDayEvents = selectedDay ? eventsByDay.get(selectedDay.toDateString()) ?? [] : []

  return (
    <AppShell title="Calendario">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 className="page-title">Calendario</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`btn ${view === 'mes' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setView('mes')}>
            Mes
          </button>
          <button type="button" className={`btn ${view === 'lista' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setView('lista')}>
            Listado
          </button>
        </div>
      </div>
      <p className="page-subtitle">Eventos institucionales, regionales, de cuartel y de Escuela.</p>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los tipos</option>
          {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los estados</option>
          {Object.entries(EVENT_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todo el alcance</option>
          {profile?.station_id && <option value="mi_cuartel">Mi cuartel</option>}
          <option value="escuela">Escuela</option>
        </select>
      </div>

      {loading && <div className="empty-state">Cargando calendario…</div>}

      {!loading && view === 'mes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-outlined"
              style={{ padding: '4px 10px' }}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <strong style={{ fontSize: 14 }}>
              {MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}
            </strong>
            <button
              type="button"
              className="btn btn-outlined"
              style={{ padding: '4px 10px' }}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="card" style={{ padding: 8, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', padding: 4 }}>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {monthGrid.map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth()
                const isToday = day.toDateString() === startOfDay(new Date()).toDateString()
                const isSelected = selectedDay?.toDateString() === day.toDateString()
                const dayEvents = eventsByDay.get(day.toDateString()) ?? []
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    style={{
                      minHeight: 44,
                      padding: '4px 2px',
                      borderRadius: 8,
                      border: isSelected ? '2px solid var(--color-primary)' : isToday ? '1px solid var(--color-primary)' : '1px solid transparent',
                      background: isSelected ? 'var(--color-primary-soft, rgba(211,47,47,0.08))' : 'transparent',
                      opacity: inMonth ? 1 : 0.35,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400 }}>{day.getDate()}</span>
                    {dayEvents.length > 0 && (
                      <span style={{ display: 'flex', gap: 2 }}>
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: e.status === 'cancelado' ? 'var(--color-text-muted)' : 'var(--color-primary)',
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedDay && (
            <>
              <div className="section-header">
                <h2 className="section-title">
                  {selectedDay.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
              </div>
              <div className="card" style={{ marginBottom: 20, padding: 0 }}>
                {selectedDayEvents.length === 0 && <div className="empty-state">Sin eventos este día.</div>}
                {selectedDayEvents.map((event, i) => (
                  <Link
                    key={event.id}
                    to={`/calendario/${event.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{event.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {event.all_day ? 'Todo el día' : new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {EVENT_TYPE_LABEL[event.event_type]} · {scopeLabel(event)}
                      </div>
                    </div>
                    <span className={`badge ${EVENT_STATUS_BADGE[event.status]}`}>{EVENT_STATUS_LABEL[event.status]}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!loading && view === 'lista' && (
        <div className="card" style={{ marginBottom: 20, padding: 0 }}>
          {filteredEvents.length === 0 && <div className="empty-state">Todavía no hay eventos cargados en el calendario.</div>}
          {filteredEvents.map((event, i) => (
            <Link
              key={event.id}
              to={`/calendario/${event.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                textDecoration: 'none',
                color: 'inherit',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{event.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {new Date(event.starts_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                  {!event.all_day && ` · ${new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                  {' · '}
                  {EVENT_TYPE_LABEL[event.event_type]} · {scopeLabel(event)}
                </div>
              </div>
              <span className={`badge ${EVENT_STATUS_BADGE[event.status]}`}>{EVENT_STATUS_LABEL[event.status]}</span>
            </Link>
          ))}
        </div>
      )}

      {canCreate && (
        <Link to="/calendario/nuevo" className="btn btn-primary btn-icon fab" aria-label="Nuevo evento">
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
