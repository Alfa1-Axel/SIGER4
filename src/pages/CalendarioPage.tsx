import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchCalendarEvents } from '../lib/api/calendar'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchVisibleDepartments } from '../lib/api/departments'
import type { CalendarEvent, CalendarEventStatus, CalendarEventType, Region, Station, Subsede, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

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
  const { isAdmin, hasRole, profile, scopes, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const hasDepartments = coordinatedDepartmentIds.length > 0 || memberDepartmentIds.length > 0
  const canCreate =
    isAdmin ||
    hasDepartments ||
    hasRole('secretario_regional', 'director_escuela', 'instructor', 'presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision')
  // El cuartel del usuario puede venir de profiles.station_id o de una fila
  // en user_scopes con scope_type='station' (mismo criterio que
  // my_station_ids() en la base) — usar solo profile.station_id dejaba el
  // filtro "Mi cuartel" invisible y sin match para estos usuarios.
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
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
    Promise.all([fetchCalendarEvents(), fetchRegions(), fetchSubsedes(), fetchStations(), fetchVisibleDepartments().catch(() => [])])
      .then(([eventsData, regionsData, subsedesData, stationsData, departmentsData]) => {
        if (!active) return
        setEvents(eventsData)
        setDepartments(departmentsData)
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar el calendario')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  // Para distinguir y filtrar los eventos de cada departamento propio.
  const myDepartments = departments.filter((d) => d.my_relation)

  function scopeLabel(event: CalendarEvent): string {
    if (event.department_id) return `Departamento ${departments.find((d) => d.id === event.department_id)?.name ?? ''}`.trim()
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
            (scopeFilter === 'mi_cuartel' && e.station_id === myStationId) ||
            (scopeFilter === 'departamentos' && e.department_id !== null) ||
            (scopeFilter.startsWith('dep:') && e.department_id === scopeFilter.slice(4)) ||
            (scopeFilter === 'escuela' && (e.event_type === 'escuela' || e.event_type === 'capacitacion'))),
      ),
    [events, typeFilter, statusFilter, scopeFilter, myStationId],
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
          <button type="button" className="chip" aria-pressed={view === 'mes'} onClick={() => setView('mes')}>
            Mes
          </button>
          <button type="button" className="chip" aria-pressed={view === 'lista'} onClick={() => setView('lista')}>
            Listado
          </button>
        </div>
      </div>
      <p className="page-subtitle">Eventos de la Regional, de tu cuartel y de la Escuela. Tocá un día para ver qué hay.</p>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
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
          {myStationId && <option value="mi_cuartel">Mi cuartel</option>}
          <option value="escuela">Escuela</option>
          {myDepartments.length > 1 && <option value="departamentos">Mis departamentos</option>}
          {myDepartments.map((d) => (
            <option key={d.id} value={`dep:${d.id}`}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="loading-state" role="status">Cargando calendario…</div>}

      {!loading && view === 'mes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-outlined btn-sm"
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
              className="btn btn-outlined btn-sm"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="card" style={{ padding: 8, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', padding: 4 }}>
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
                      borderRadius: 'var(--radius-lg)',
                      border: isSelected ? '2px solid var(--color-primary)' : isToday ? '1px solid var(--color-primary)' : '1px solid transparent',
                      background: isSelected ? 'var(--color-primary-soft)' : 'transparent',
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
              <div className="card row-list" style={{ marginBottom: 20 }}>
                {selectedDayEvents.length === 0 && <div className="empty-state">Sin eventos este día.</div>}
                {selectedDayEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={`/calendario/${event.id}`}
                    className="row-item"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere' }}>{event.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {event.all_day ? 'Todo el día' : new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {EVENT_TYPE_LABEL[event.event_type]} · {scopeLabel(event)}
                      </div>
                    </div>
                    <span className={`badge ${EVENT_STATUS_BADGE[event.status]}`} style={{ flexShrink: 0 }}>
                      {EVENT_STATUS_LABEL[event.status]}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!loading && view === 'lista' && (
        <div className="card row-list" style={{ marginBottom: 20 }}>
          {filteredEvents.length === 0 && (
            <div className="empty-state empty-state-action">
              <span>No hay eventos para mostrar con este filtro.</span>
              {canCreate && (
                <Link to="/calendario/nuevo" className="btn btn-outlined">
                  <Icon name="plus" size={16} />
                  Cargar un evento
                </Link>
              )}
            </div>
          )}
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              to={`/calendario/${event.id}`}
              className="row-item"
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
          <span className="fab-label">Nuevo evento</span>
        </Link>
      )}
    </AppShell>
  )
}
