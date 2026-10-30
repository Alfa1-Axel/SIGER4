import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { fetchUpcomingCalendarEvents } from '../lib/api/calendar'
import type { CalendarEvent } from '../types/database'

const MAX_EVENTS = 3

// "Próximos eventos" del Inicio: los tres siguientes, sin más. El calendario
// completo tiene su pantalla.
export function HomeAgenda() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)

  useEffect(() => {
    let active = true
    fetchUpcomingCalendarEvents(MAX_EVENTS)
      .then((list) => active && setEvents(list))
      .catch(() => active && setEvents([]))
    return () => {
      active = false
    }
  }, [])

  // Si no se pudo consultar o no hay nada, no ocupa lugar en el Inicio.
  if (!events || events.length === 0) return null

  return (
    <section aria-labelledby="agenda-title" style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2 id="agenda-title" className="section-title">
          Próximos eventos
        </h2>
        <Link to="/calendario" className="link-muted">
          Ver calendario
        </Link>
      </div>
      <div className="card row-list">
        {events.map((event) => (
          <Link key={event.id} to={`/calendario/${event.id}`} className="row-item">
            <div style={{ minWidth: 0 }}>
              <div className="row-item-title">{event.title}</div>
              <div className="row-item-meta">
                {new Date(event.starts_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                {!event.all_day && ` · ${new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
            <Icon name="chevronRight" size={18} />
          </Link>
        ))}
      </div>
    </section>
  )
}
