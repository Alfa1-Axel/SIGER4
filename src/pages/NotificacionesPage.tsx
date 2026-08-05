import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchNotificationsForProfile, markNotificationRead } from '../lib/api/notifications'
import type { Notification, NotificationType } from '../types/database'
import { useAuth } from '../hooks/useAuth'

const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  curso_nuevo: 'Curso nuevo',
  circular_nueva: 'Circular nueva',
  asistencia_pendiente: 'Asistencia pendiente',
  estadisticas_nuevas: 'Estadísticas nuevas',
  cambio_estado: 'Cambio de estado',
  actividad_proxima: 'Actividad próxima',
  documento_actualizado: 'Documento actualizado',
  reporte_generado: 'Reporte generado',
  prueba: 'Prueba',
  recordatorio_semanal: 'Recordatorio semanal',
}

export function NotificacionesPage() {
  const { profile, isAdmin, hasRole } = useAuth()
  const canCreate = isAdmin || hasRole('secretario_regional', 'director_escuela', 'instructor')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let active = true
    fetchNotificationsForProfile(profile.id)
      .then((data) => active && setNotifications(data))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar notificaciones'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [profile])

  async function handleMarkRead(id: string) {
    setError(null)
    try {
      await markNotificationRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos marcar la notificación como leída.')
    }
  }

  return (
    <AppShell title="Notificaciones">
      <h1 className="page-title">Notificaciones</h1>
      <p className="page-subtitle">Novedades y avisos para tu alcance institucional.</p>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando notificaciones…</div>}
      {!loading && notifications.length === 0 && (
        <div className="empty-state">No tenés notificaciones por el momento.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifications.map((n) => (
          <div key={n.id} className="card-solid list-item">
            {!n.is_read && <span className="list-item-dot" />}
            <div className="list-item-body">
              <h3
                className="list-item-title"
                style={{
                  fontWeight: n.is_read ? 500 : 700,
                  color: n.is_read ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                }}
              >
                {n.title}
              </h3>
              {n.body && <p className="list-item-subtitle">{n.body}</p>}
              <div className="list-item-meta">
                <span className="badge badge-info">{NOTIFICATION_TYPE_LABEL[n.type]}</span>
                <span>{new Date(n.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            </div>
            {!n.is_read && (
              <div className="list-item-actions">
                <button type="button" className="btn btn-outlined" onClick={() => handleMarkRead(n.id)}>
                  Marcar leída
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canCreate && (
        <Link
          to="/notificaciones/nueva"
          className="btn btn-primary btn-icon fab"
          aria-label="Nueva notificación"
        >
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
