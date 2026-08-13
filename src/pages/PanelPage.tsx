import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { PendingItemsSection } from '../components/PendingItemsSection'
import { fetchDashboardSummary } from '../lib/api/dashboard'
import { fetchStations } from '../lib/api/stations'
import type { DashboardSummary } from '../lib/api/dashboard'
import type { Station } from '../types/database'
import { translateAction, translateTable } from '../lib/audit/humanize'
import { formatPercent } from '../lib/format'
import { EVENT_TYPE_LABEL } from './CalendarioPage'
import { describeSupabaseError } from '../lib/api/errors'
import { useAuth } from '../hooks/useAuth'

function timeAgo(iso: string): string {
  const diffMs = Date.parse(iso) ? Date.now() - Date.parse(iso) : 0
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `Hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours}h`
  return `Hace ${Math.floor(hours / 24)}d`
}

export function PanelPage() {
  const { isAdmin, hasRole } = useAuth()
  const canAccessReports = isAdmin || hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([fetchDashboardSummary(), fetchStations()])
      .then(([summaryData, stationsData]) => {
        if (!active) return
        setSummary(summaryData)
        setStations(stationsData)
      })
      .catch((err) => {
        if (!active) return
        setError(describeSupabaseError(err, 'No pudimos cargar el panel regional.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <AppShell title="Dashboard">
      <div
        className="card"
        style={{ background: 'var(--color-primary-dark)', border: 'none', color: '#fff', marginBottom: 16, padding: '16px 20px' }}
      >
        {/* --color-primary-dark es rojo solido en los dos temas (#b71c1c
            claro / #d32f2f oscuro) -- el blanco fijo sigue siendo correcto
            en ambos, a diferencia de --color-secondary/.kpi-value que sí
            dependían de un fondo que cambiaba de claro a oscuro. */}
        <span className="badge badge-danger" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
          ● Sistema en tiempo real
        </span>
        <h1 style={{ margin: '8px 0 4px', fontSize: 19 }}>Resumen Regional</h1>
        <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.9 }}>
          Gestión centralizada de recursos, personal y alertas críticas para la región.
        </p>
        {canAccessReports && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/reportes" className="btn btn-inverted">
              Nuevo Reporte
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Cuarteles</div>
          <div className="kpi-value">{loading ? '—' : summary?.stationsCount ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Asistencia promedio</div>
          <div className="kpi-value">
            {loading || summary?.averageAttendanceRate == null
              ? '—'
              : formatPercent(summary.averageAttendanceRate)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Intervenciones (período)</div>
          <div className="kpi-value">{loading ? '—' : summary?.interventionsThisPeriod ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cursos activos</div>
          <div className="kpi-value">{loading ? '—' : summary?.coursesActive ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vehículos registrados</div>
          <div className="kpi-value">{loading ? '—' : summary?.vehiclesRegistered ?? 0}</div>
        </div>
      </div>

      <PendingItemsSection />

      <div className="section-header">
        <h2 className="section-title">Estado de Carga por Cuartel</h2>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        {loading && <div className="empty-state">Cargando estado de carga…</div>}
        {!loading && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>
                {summary?.complianceCounts.verde ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>AL DÍA</div>
            </div>
            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)' }}>
                {summary?.complianceCounts.amarillo ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>PARCIAL</div>
            </div>
            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-danger)' }}>
                {summary?.complianceCounts.rojo ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>DESACTUALIZADO</div>
            </div>
          </div>
        )}
        <Link to="/cuarteles" className="link-muted" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          Ver detalle por cuartel →
        </Link>
      </div>

      <div className="section-header">
        <h2 className="section-title">Próximos Eventos</h2>
        <Link to="/calendario" className="link-muted">
          Ver calendario
        </Link>
      </div>
      <div className="card" style={{ marginBottom: 20, padding: 0 }}>
        {loading && <div className="empty-state">Cargando eventos…</div>}
        {!loading && (summary?.upcomingEvents.length ?? 0) === 0 && (
          <div className="empty-state">No hay eventos próximos cargados en el calendario.</div>
        )}
        {summary?.upcomingEvents.map((event, i) => (
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
              </div>
            </div>
            <span className="badge badge-info">{EVENT_TYPE_LABEL[event.event_type]}</span>
          </Link>
        ))}
      </div>

      {!loading && (summary?.todayEvents.length ?? 0) > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Eventos de Hoy</h2>
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {summary?.todayEvents.map((event, i) => (
              <Link
                key={event.id}
                to={`/calendario/${event.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{event.title}</span>
                <span className="badge badge-warning" style={{ flexShrink: 0 }}>
                  {event.all_day ? 'Todo el día' : new Date(event.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!loading && (summary?.upcomingDeadlines.length ?? 0) > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Vencimientos Próximos</h2>
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {summary?.upcomingDeadlines.map((event, i) => (
              <Link
                key={event.id}
                to={`/calendario/${event.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{event.title}</span>
                <span className="badge badge-danger" style={{ flexShrink: 0 }}>
                  {new Date(event.starts_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-header">
        <h2 className="section-title">Estado de Cuarteles</h2>
        <Link to="/cuarteles" className="link-muted">
          Ver todos
        </Link>
      </div>
      <div className="card" style={{ marginBottom: 20, padding: 0 }}>
        {loading && <div className="empty-state">Cargando cuarteles…</div>}
        {!loading && stations.length === 0 && (
          <div className="empty-state">Todavía no hay cuarteles cargados.</div>
        )}
        {stations.slice(0, 5).map((station, i) => (
          <Link
            key={station.id}
            to={`/cuarteles/${station.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{station.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Personal: {station.personnel_count} · Unidades: {station.vehicles_count}
              </div>
            </div>
            <Icon name="chevronRight" size={18} />
          </Link>
        ))}
      </div>

      <div className="section-header">
        <h2 className="section-title">Actividad Reciente</h2>
      </div>
      <div className="card">
        {loading && <div className="empty-state">Cargando actividad…</div>}
        {!loading && (summary?.recentActivity.length ?? 0) === 0 && (
          <div className="empty-state">Sin actividad registrada todavía.</div>
        )}
        {summary?.recentActivity.map((log, i) => (
          <div
            key={log.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: i === 0 ? '0 0 12px' : '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{translateAction(log.action)}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{translateTable(log.table_name)}</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {timeAgo(log.created_at)}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
