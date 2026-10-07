import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { DEPARTMENT_REPORT_TYPE_LABEL, fetchRecentDepartmentReports } from '../lib/api/departmentReports'
import { fetchUpcomingDepartmentEvents } from '../lib/api/calendar'
import { fetchUnreadDepartmentNotifications } from '../lib/api/notifications'
import { fetchPendingItems } from '../lib/api/pendingItems'
import type { PendingItem } from '../lib/api/pendingItems'
import { openableNotificationLink } from '../lib/notificationMeta'
import { useAuth } from '../hooks/useAuth'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { CalendarEvent, DepartmentReport, Notification, VisibleDepartment } from '../types/database'

const SELECTED_KEY = 'siger4:inicio-departamento'

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

function saveSelected(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id)
  } catch {
    // Sin almacenamiento local: se vuelve a elegir el primero.
  }
}

function formatDay(iso: string, withTime: boolean): string {
  return new Date(iso).toLocaleString('es-AR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' })
}

// Inicio de un coordinador o miembro: su departamento, con lo que pide
// atención, lo último y lo próximo. Si tiene varios, los distingue con un
// selector.
export function DepartmentDashboard({ departments }: { departments: VisibleDepartment[] }) {
  const { isDepartmentOnly } = useAuth()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  // Primero los que coordina.
  const mine = [...departments.filter((d) => d.my_relation === 'coordinador'), ...departments.filter((d) => d.my_relation === 'integrante')]
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reports, setReports] = useState<DepartmentReport[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [notices, setNotices] = useState<Notification[]>([])
  const [pending, setPending] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)

  // Pendientes del servidor (get_pending_items): se piden una vez y se
  // filtran por el departamento elegido.
  useEffect(() => {
    let active = true
    fetchPendingItems()
      .then((items) => active && setPending(items))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const selected = mine.find((d) => d.id === selectedId) ?? mine.find((d) => d.id === readSelected()) ?? mine[0] ?? null

  useEffect(() => {
    if (!selected) return
    let active = true
    setLoading(true)
    Promise.all([
      fetchRecentDepartmentReports(3, selected.id).catch(() => []),
      fetchUpcomingDepartmentEvents(selected.id, 3).catch(() => []),
      fetchUnreadDepartmentNotifications(selected.id, 3).catch(() => []),
    ]).then(([reportsData, eventsData, noticesData]) => {
      if (!active) return
      setReports(reportsData)
      setEvents(eventsData)
      setNotices(noticesData)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) return null

  function choose(id: string) {
    setSelectedId(id)
    saveSelected(id)
  }

  const isCoordinator = selected.my_relation === 'coordinador'
  // Pendientes de este departamento: sin actividad reciente y sus eventos de
  // los próximos días.
  const departmentPending = pending.filter(
    (item) => item.linkPath === `/departamentos/${selected.id}` || events.some((e) => item.linkPath === `/calendario/${e.id}`),
  )
  const allClear = !loading && notices.length === 0 && departmentPending.length === 0

  return (
    <section className="dept-dashboard" aria-label="Tu departamento">
      <div className="section-header">
        <h2 className="section-title">{mine.length > 1 ? 'Tus departamentos' : 'Tu departamento'}</h2>
      </div>

      {mine.length > 1 && (
        <div className="filter-bar filter-bar--scroll" role="group" aria-label="Elegir departamento">
          {mine.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={d.id === selected.id} onClick={() => choose(d.id)}>
              {d.name}
              <span className="dept-chip-relation">{d.my_relation === 'coordinador' ? 'Coordinás' : 'Miembro'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card-solid dept-dashboard-card">
        <div className="dept-dashboard-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="dept-dashboard-title">{selected.name}</h3>
            <p className="dept-dashboard-meta">
              {isCoordinator ? 'Coordinás este departamento' : 'Sos miembro de este departamento'} ·{' '}
              {selected.member_count === 1 ? '1 miembro' : `${selected.member_count} miembros`}
              {!isCoordinator && selected.coordinator_name ? ` · Coordina ${selected.coordinator_name}` : ''}
            </p>
          </div>
          <Link to={`/departamentos/${selected.id}`} className="link-muted dept-dashboard-open">
            Ver departamento →
          </Link>
        </div>

        <div className="dept-dashboard-attention" aria-live="polite">
          <h4 className="dept-dashboard-subtitle">Pendientes y avisos</h4>
          {loading ? (
            <p className="field-help">Cargando…</p>
          ) : allClear ? (
            <p className="dept-dashboard-clear">
              <Icon name="check" size={16} />
              Todo al día en {selected.name}.
            </p>
          ) : (
            <ul className="dept-dashboard-list">
              {departmentPending.map((item) => (
                <li key={item.itemKey}>
                  <Link to={item.linkPath}>
                    <span className="dept-dashboard-item-title">{item.title}</span>
                    <span className="dept-dashboard-item-meta">{item.description}</span>
                  </Link>
                </li>
              ))}
              {notices.map((n) => (
                <li key={n.id}>
                  <Link to={openableNotificationLink(n, false, isDepartmentOnly, hasAvalesAccess) ?? '/notificaciones'}>
                    <span className="dept-dashboard-item-title">{n.title}</span>
                    <span className="dept-dashboard-item-meta">Aviso sin leer</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dept-dashboard-grid">
          <div>
            <h4 className="dept-dashboard-subtitle">Últimos informes y actas</h4>
            {loading ? (
              <p className="field-help">Cargando…</p>
            ) : reports.length === 0 ? (
              <p className="field-help">Todavía no hay informes cargados.</p>
            ) : (
              <ul className="dept-dashboard-list">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/departamentos/informes/${r.id}`}>
                      <span className="dept-dashboard-item-title">{r.title}</span>
                      <span className="dept-dashboard-item-meta">
                        {DEPARTMENT_REPORT_TYPE_LABEL[r.report_type]} · {formatDay(r.created_at, false)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="dept-dashboard-subtitle">Próximos eventos</h4>
            {loading ? (
              <p className="field-help">Cargando…</p>
            ) : events.length === 0 ? (
              <p className="field-help">No hay eventos próximos.</p>
            ) : (
              <ul className="dept-dashboard-list">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link to={`/calendario/${e.id}`}>
                      <span className="dept-dashboard-item-title">{e.title}</span>
                      <span className="dept-dashboard-item-meta">{formatDay(e.starts_at, !e.all_day)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected.is_active && (
          <div className="dept-dashboard-actions">
            <Link to={`/departamentos/informes/nuevo?modo=cargar&departamento=${selected.id}`} className="btn btn-primary btn-sm">
              <Icon name="file" size={14} />
              Cargar informe
            </Link>
            <Link to={`/calendario/nuevo?departamento=${selected.id}`} className="btn btn-outlined btn-sm">
              <Icon name="calendar" size={14} />
              Nuevo evento
            </Link>
            <Link to={`/departamentos/${selected.id}#informes`} className="btn btn-ghost btn-sm">
              Ver informes
            </Link>
            <Link to={`/departamentos/${selected.id}#eventos`} className="btn btn-ghost btn-sm">
              Ver eventos
            </Link>
            <Link to={`/departamentos/${selected.id}#miembros`} className="btn btn-ghost btn-sm">
              Ver miembros
            </Link>
            {isCoordinator && (
              <Link to={`/notificaciones/nueva?departamento=${selected.id}`} className="btn btn-outlined btn-sm">
                <Icon name="bell" size={14} />
                Avisar al departamento
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
