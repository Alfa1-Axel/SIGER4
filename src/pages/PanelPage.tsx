import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { TasksSection } from '../components/TasksSection'
import { DepartmentDashboard } from '../components/DepartmentDashboard'
import { DepartmentHome } from '../components/DepartmentHome'
import { openGlobalSearch } from '../lib/searchControl'
import { fetchDashboardSummary } from '../lib/api/dashboard'
import { fetchStations } from '../lib/api/stations'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { fetchLatestUnreadNotifications, fetchUnreadNotificationCount } from '../lib/api/notifications'
import type { DashboardSummary } from '../lib/api/dashboard'
import type { Notification, Station, VisibleDepartment } from '../types/database'
import { translateAction, translateTable } from '../lib/audit/humanize'
import { formatPercent, greeting, longToday } from '../lib/format'
import { EVENT_TYPE_LABEL } from './CalendarioPage'
import { describeSupabaseError } from '../lib/api/errors'
import { useAuth } from '../hooks/useAuth'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { DEPARTMENT_ROLES, roleLabel } from '../types/roles'
import type { RoleKey } from '../types/roles'

function timeAgo(iso: string): string {
  const diffMs = Date.parse(iso) ? Date.now() - Date.parse(iso) : 0
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `Hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours}h`
  return `Hace ${Math.floor(hours / 24)}d`
}

// Roles con alcance territorial (Regional, subsede o cuartel): para ellos
// el estado de cuarteles, asistencia e intervenciones es parte del trabajo
// diario. Para Escuela o la coordinación de un departamento es ruido.
const TERRITORIAL_ROLES: RoleKey[] = [
  'secretario_regional',
  'director_escuela',
  'jefe_cuerpo_activo',
  'presidente_cuartel',
  'usuario_carga_cuartel',
  'secretario_comision',
  'invitado',
]

const DOCUMENT_UPLOAD_ROLES: RoleKey[] = ['secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo']

interface QuickAction {
  to: string
  label: string
  description: string
  icon: string
  badge?: number
}

// Inicio: lo primero que ve cada usuario al ingresar. Quien solo es
// Coordinador o Miembro de Departamento tiene un Inicio propio, con su
// departamento y nada global (DepartmentHome); el resto ve el de siempre.
export function PanelPage() {
  const { isDepartmentOnly } = useAuth()
  return isDepartmentOnly ? <DepartmentHome /> : <GeneralHome />
}

// Responde, en este orden: qué requiere atención, qué puede hacer (accesos
// según su rol), qué llegó (notificaciones sin leer), qué viene (agenda) y,
// para los roles territoriales, el estado de la Regional.
function GeneralHome() {
  const { profile, roles, isAdmin, isSuperAdmin, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const { hasAnyAccess: hasReportsAccess } = useDepartmentReportsAccess()
  // Mismo criterio que ReportsRoute.
  const canAccessReports = isAdmin || hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const canManageUsers = isAdmin || hasRole('jefe_cuerpo_activo')
  const canUploadDocuments = isAdmin || hasRole(...DOCUMENT_UPLOAD_ROLES)
  const showRegionalStatus = isAdmin || hasRole(...TERRITORIAL_ROLES)

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [unread, setUnread] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  // Departamentos que coordina o de los que es miembro, con su rol (0106).
  const [myDepartments, setMyDepartments] = useState<VisibleDepartment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([fetchDashboardSummary(), showRegionalStatus ? fetchStations() : Promise.resolve([] as Station[])])
      .then(([summaryData, stationsData]) => {
        if (!active) return
        setSummary(summaryData)
        setStations(stationsData)
      })
      .catch((err) => {
        if (!active) return
        setError(describeSupabaseError(err, 'No pudimos cargar el inicio. Reintentá en unos segundos.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    Promise.all([fetchLatestUnreadNotifications(3), fetchUnreadNotificationCount()])
      .then(([latest, count]) => {
        if (!active) return
        setUnread(latest)
        setUnreadCount(count)
      })
      .catch(() => {
        // Las notificaciones siguen disponibles en su sección.
      })
    return () => {
      active = false
    }
  }, [showRegionalStatus])

  const hasDepartments = coordinatedDepartmentIds.length > 0 || memberDepartmentIds.length > 0
  useEffect(() => {
    if (!hasDepartments) return
    let active = true
    fetchVisibleDepartments()
      .then((list) => active && setMyDepartments(list.filter((d) => d.my_relation)))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [hasDepartments, coordinatedDepartmentIds, memberDepartmentIds])
  const coordinatedNames = myDepartments.filter((d) => d.my_relation === 'coordinador').map((d) => d.name)
  const memberNames = myDepartments.filter((d) => d.my_relation === 'integrante').map((d) => d.name)

  // Accesos rápidos según el rol, en orden de uso esperado.
  const actions: QuickAction[] = []
  if (hasAvalesAccess) actions.push({ to: '/escuela/avales', label: 'Avales regionales', description: 'Ver y subir avales de Escuela', icon: 'school' })
  if (hasReportsAccess) actions.push({ to: '/departamentos/informes/nuevo?modo=cargar', label: 'Cargar informe', description: 'Acta, informe o fotos de un departamento', icon: 'file' })
  if (canUploadDocuments) actions.push({ to: '/documentos/nuevo', label: 'Subir documento', description: 'Circulares, actas y archivos', icon: 'download' })
  else actions.push({ to: '/documentos', label: 'Documentos', description: 'Circulares, actas y archivos', icon: 'file' })
  actions.push({ to: '/calendario', label: 'Calendario', description: 'Eventos y vencimientos', icon: 'calendar' })
  actions.push({ to: '/notificaciones', label: 'Notificaciones', description: unreadCount ? `${unreadCount} sin leer` : 'Al día', icon: 'bell', badge: unreadCount })
  if (canAccessReports) actions.push({ to: '/reportes', label: 'Generar reporte', description: 'PDF por cuartel, curso o departamento', icon: 'chart' })
  if (canManageUsers) actions.push({ to: '/usuarios', label: 'Usuarios', description: 'Altas, roles y accesos', icon: 'user' })
  if (showRegionalStatus) actions.push({ to: '/cuarteles', label: 'Cuarteles', description: 'Personal, unidades y estado', icon: 'building' })

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  // Los roles de departamento se muestran con su departamento ("Coordinador
  // de Fuego"), no con el nombre genérico del rol.
  const roleSummary = [
    ...roles
      .filter((r) => r !== 'administrativo' && r !== 'coordinador_departamento_escuela' && !DEPARTMENT_ROLES.includes(r))
      .map((r) => roleLabel(r)),
    ...(coordinatedNames.length ? [`Coordinador de ${coordinatedNames.join(', ')}`] : []),
    ...(memberNames.length ? [`Miembro de ${memberNames.join(', ')}`] : []),
  ]
  const today = longToday()

  return (
    <AppShell title="Inicio">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="page-subtitle">
            {today}
            {roleSummary.length > 0 && ` · ${roleSummary.slice(0, 3).join(' · ')}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      <button type="button" className="home-search" onClick={openGlobalSearch}>
        <Icon name="search" size={18} />
        <span>Buscar en SIGER4: usuarios, documentos, informes, elementos…</span>
      </button>

      <TasksSection unreadNotifications={unread} unreadTotal={unreadCount} />

      {myDepartments.length > 0 && <DepartmentDashboard departments={myDepartments} />}

      <div className="section-header">
        <h2 className="section-title">Accesos rápidos</h2>
      </div>
      <nav className="quick-actions" aria-label="Accesos rápidos">
        {actions.slice(0, 8).map((a) => (
          <Link key={a.to} to={a.to} className="quick-action">
            <span className="list-item-icon" style={{ position: 'relative' }}>
              <Icon name={a.icon} size={18} />
              {a.badge ? <span className="header-badge" style={{ top: -6, right: -6 }}>{a.badge > 9 ? '9+' : a.badge}</span> : null}
            </span>
            <span className="quick-action-text">
              <strong>{a.label}</strong>
              <span>{a.description}</span>
            </span>
          </Link>
        ))}
      </nav>

      {!loading && (summary?.todayEvents.length ?? 0) > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Hoy</h2>
          </div>
          <div className="card row-list" style={{ marginBottom: 20 }}>
            {summary?.todayEvents.map((event) => (
              <Link key={event.id} to={`/calendario/${event.id}`} className="row-item">
                <span className="row-item-title" style={{ minWidth: 0 }}>{event.title}</span>
                <span className="badge badge-warning" style={{ flexShrink: 0 }}>
                  {event.all_day ? 'Todo el día' : new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-header">
        <h2 className="section-title">Próximos eventos</h2>
        <Link to="/calendario" className="link-muted">
          Ver calendario
        </Link>
      </div>
      <div className="card row-list" style={{ marginBottom: 20 }}>
        {loading && <div className="loading-state" role="status">Cargando eventos…</div>}
        {!loading && (summary?.upcomingEvents.length ?? 0) === 0 && (
          <div className="empty-state">No hay eventos próximos en el calendario.</div>
        )}
        {summary?.upcomingEvents.map((event) => (
          <Link key={event.id} to={`/calendario/${event.id}`} className="row-item">
            <div style={{ minWidth: 0 }}>
              <div className="row-item-title">{event.title}</div>
              <div className="row-item-meta">
                {new Date(event.starts_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                {!event.all_day && ` · ${new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
            <span className="badge badge-info">{EVENT_TYPE_LABEL[event.event_type]}</span>
          </Link>
        ))}
      </div>

      {!loading && (summary?.upcomingDeadlines.length ?? 0) > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Vencimientos próximos</h2>
          </div>
          <div className="card row-list" style={{ marginBottom: 20 }}>
            {summary?.upcomingDeadlines.map((event) => (
              <Link key={event.id} to={`/calendario/${event.id}`} className="row-item">
                <span className="row-item-title" style={{ minWidth: 0 }}>{event.title}</span>
                <span className="badge badge-danger" style={{ flexShrink: 0 }}>
                  {new Date(event.starts_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {showRegionalStatus && (
        <>
          <div className="section-header">
            <h2 className="section-title">Estado de la Regional</h2>
            <Link to="/cuarteles" className="link-muted">
              Ver cuarteles
            </Link>
          </div>
          <div className="card-grid" style={{ marginBottom: 12 }}>
            <div className="kpi-card">
              <div className="kpi-label">Cuarteles</div>
              <div className="kpi-value">{loading ? <span className="skeleton" aria-hidden="true" /> : summary?.stationsCount ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Asistencia promedio</div>
              <div className="kpi-value">
                {loading || summary?.averageAttendanceRate == null ? '—' : formatPercent(summary.averageAttendanceRate)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Intervenciones (período)</div>
              <div className="kpi-value">{loading ? <span className="skeleton" aria-hidden="true" /> : summary?.interventionsThisPeriod ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cursos activos</div>
              <div className="kpi-value">{loading ? <span className="skeleton" aria-hidden="true" /> : summary?.coursesActive ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Vehículos registrados</div>
              <div className="kpi-value">{loading ? <span className="skeleton" aria-hidden="true" /> : summary?.vehiclesRegistered ?? 0}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="kpi-label" style={{ marginBottom: 10 }}>
              Carga de datos por cuartel
            </div>
            {loading && <div className="loading-state" role="status">Cargando estado de carga…</div>}
            {!loading && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>{summary?.complianceCounts.verde ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>AL DÍA</div>
                </div>
                <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)' }}>{summary?.complianceCounts.amarillo ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>PARCIAL</div>
                </div>
                <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-danger)' }}>{summary?.complianceCounts.rojo ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>DESACTUALIZADO</div>
                </div>
              </div>
            )}
          </div>

          <div className="card row-list" style={{ marginBottom: 20 }}>
            {loading && <div className="loading-state" role="status">Cargando cuarteles…</div>}
            {!loading && stations.length === 0 && <div className="empty-state">Todavía no hay cuarteles cargados.</div>}
            {stations.slice(0, 5).map((station) => (
              <Link key={station.id} to={`/cuarteles/${station.id}`} className="row-item">
                <div>
                  <div className="row-item-title">{station.name}</div>
                  <div className="row-item-meta">
                    Personal: {station.personnel_count} · Unidades: {station.vehicles_count}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}

      {/* La actividad reciente sale de la auditoría, que solo puede leer
          informatica_r4 (0097): para el resto quedaría siempre vacía. */}
      {isSuperAdmin && (
        <>
          <div className="section-header">
            <h2 className="section-title">Actividad reciente</h2>
            <Link to="/auditoria" className="link-muted">
              Ver auditoría
            </Link>
          </div>
          <div className="card row-list">
            {loading && <div className="loading-state" role="status">Cargando actividad…</div>}
            {!loading && (summary?.recentActivity.length ?? 0) === 0 && <div className="empty-state">Sin actividad registrada todavía.</div>}
            {summary?.recentActivity.map((log) => (
              <div key={log.id} className="row-item">
                <div style={{ minWidth: 0 }}>
                  <div className="row-item-title">{translateAction(log.action)}</div>
                  <div className="row-item-meta">{translateTable(log.table_name)}</div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(log.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}
