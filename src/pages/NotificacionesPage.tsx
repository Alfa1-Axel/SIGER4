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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notifications.map((n) => (
          <div key={n.id} className="card-solid" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {!n.is_read && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="badge badge-info">{NOTIFICATION_TYPE_LABEL[n.type]}</span>
              <h3
                style={{
                  margin: '8px 0 4px',
                  fontSize: 15,
                  fontWeight: n.is_read ? 500 : 700,
                  color: n.is_read ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                }}
              >
                {n.title}
              </h3>
              {n.body && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{n.body}</p>
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {new Date(n.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            {!n.is_read && (
              <button
                type="button"
                className="btn btn-outlined"
                style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={() => handleMarkRead(n.id)}
              >
                Marcar como leída
              </button>
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
