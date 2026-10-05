import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { NotificationDetailModal } from '../components/ui/NotificationDetailModal'
import { forceShowAppUpdateBanner } from '../lib/appUpdateBannerControl'
import { fetchNotificationsForProfile, markNotificationsRead } from '../lib/api/notifications'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_CATEGORY_ICON,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_TYPE_LABEL,
  isImportantNotification,
  notificationLink,
  timeAgo,
} from '../lib/notificationMeta'
import type { NotificationCategory } from '../lib/notificationMeta'
import type { Notification, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

type StatusFilter = 'todas' | 'no_leidas' | 'importantes'
const CATEGORY_ORDER: NotificationCategory[] = ['sistema', 'escuela', 'inventario', 'documentos', 'calendario', 'departamentos', 'cuarteles']

// Bandeja de notificaciones (vista my_notifications, 0102): solo lo dirigido a
// quien mira, con su propio estado de leído también en las masivas.
export function NotificacionesPage() {
  const { profile, isAdmin, hasRole } = useAuth()
  const navigate = useNavigate()
  const canCreate = isAdmin || hasRole('secretario_regional', 'director_escuela', 'instructor')
  const canManageUsers = isAdmin || hasRole('jefe_cuerpo_activo')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openNotification, setOpenNotification] = useState<Notification | null>(null)
  const [status, setStatus] = useState<StatusFilter>('todas')
  const [category, setCategory] = useState<NotificationCategory | ''>('')
  const [markingAll, setMarkingAll] = useState(false)

  // Solo para mostrar el origen ("Cuartel Villa del Rosario", "Regional 4").
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])

  useEffect(() => {
    if (!profile) return
    let active = true
    fetchNotificationsForProfile(profile.id)
      .then((data) => active && setNotifications(data))
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar tus notificaciones. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [profile])

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()])
      .then(([regionsData, subsedesData, stationsData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const categoriesPresent = useMemo(
    () => CATEGORY_ORDER.filter((c) => notifications.some((n) => NOTIFICATION_CATEGORY[n.type] === c)),
    [notifications],
  )
  const visible = useMemo(
    () =>
      notifications.filter(
        (n) =>
          (status === 'todas' || (status === 'no_leidas' && !n.is_read) || (status === 'importantes' && isImportantNotification(n))) &&
          (!category || NOTIFICATION_CATEGORY[n.type] === category),
      ),
    [notifications, status, category],
  )

  async function markRead(ids: string[]) {
    setError(null)
    try {
      await markNotificationsRead(ids)
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)))
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos marcar la notificación como leída.'))
    }
  }

  async function handleMarkAll() {
    setError(null)
    setMarkingAll(true)
    try {
      await markNotificationsRead(null)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos marcar las notificaciones como leídas.'))
    } finally {
      setMarkingAll(false)
    }
  }

  async function handleOpen(n: Notification) {
    if (!n.is_read) await markRead([n.id])
    // Las novedades del sistema abren el aviso real de esa versión.
    if (n.type === 'actualizacion_sistema' && n.app_update_id) {
      forceShowAppUpdateBanner(n.app_update_id)
      return
    }
    setOpenNotification({ ...n, is_read: true })
  }

  async function handleGo(n: Notification, to: string) {
    if (!n.is_read) await markRead([n.id])
    navigate(to)
  }

  function originLabel(n: Notification): string {
    if (n.profile_id) return 'Para vos'
    if (n.station_id) return `Cuartel ${stations.find((s) => s.id === n.station_id)?.name ?? ''}`.trim()
    if (n.subsede_id) return `Subsede ${subsedes.find((s) => s.id === n.subsede_id)?.name ?? ''}`.trim()
    if (n.region_id) return regions.find((r) => r.id === n.region_id)?.name ?? 'Toda la Regional'
    return 'Sistema'
  }

  function emptyMessage(): string {
    if (notifications.length === 0) return 'No tenés notificaciones. Cuando haya novedades para vos o tu cuartel, aparecen acá.'
    if (status === 'no_leidas' && !category) return 'Estás al día: no tenés notificaciones sin leer.'
    if (status === 'importantes' && !category) return 'No hay avisos importantes pendientes.'
    return 'No hay notificaciones con este filtro.'
  }

  return (
    <AppShell title="Notificaciones">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notificaciones</h1>
          <p className="page-subtitle">Avisos para vos, tu cuartel, tu Regional o la Escuela. Tocá uno para verlo completo.</p>
        </div>
        {unreadCount > 0 && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-outlined" onClick={handleMarkAll} disabled={markingAll}>
              <Icon name="check" size={16} />
              {markingAll ? 'Marcando…' : 'Marcar todas como leídas'}
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar" role="group" aria-label="Filtrar notificaciones">
        <button type="button" className="chip" aria-pressed={status === 'todas'} onClick={() => setStatus('todas')}>
          Todas
        </button>
        <button type="button" className="chip" aria-pressed={status === 'no_leidas'} onClick={() => setStatus('no_leidas')}>
          No leídas{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
        <button type="button" className="chip" aria-pressed={status === 'importantes'} onClick={() => setStatus('importantes')}>
          Importantes
        </button>
      </div>
      {categoriesPresent.length > 1 && (
        <div className="filter-bar filter-bar--scroll" role="group" aria-label="Filtrar por módulo">
          <button type="button" className="chip" aria-pressed={category === ''} onClick={() => setCategory('')}>
            Todos los módulos
          </button>
          {categoriesPresent.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>
              {NOTIFICATION_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando notificaciones…</div>}
      {!loading && visible.length === 0 && (
        <div className="empty-state empty-state-action">
          <Icon name="bell" size={22} />
          <span>{emptyMessage()}</span>
          {(status !== 'todas' || category) && notifications.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStatus('todas')
                setCategory('')
              }}
            >
              Ver todas
            </button>
          )}
        </div>
      )}

      <ul className="notification-list">
        {visible.map((n) => {
          const cat = NOTIFICATION_CATEGORY[n.type]
          const link = notificationLink(n, canManageUsers)
          const important = isImportantNotification(n)
          return (
            <li key={n.id} className={`notification-item${n.is_read ? '' : ' notification-item--unread'}`}>
              <button type="button" className="notification-main" onClick={() => handleOpen(n)}>
                <span className="list-item-icon" aria-hidden="true">
                  <Icon name={NOTIFICATION_CATEGORY_ICON[cat]} size={18} />
                </span>
                <span className="notification-text">
                  <span className="notification-title">
                    {!n.is_read && <span className="sr-only">Sin leer: </span>}
                    {n.title}
                  </span>
                  {n.body && <span className="notification-body">{n.body}</span>}
                  <span className="notification-meta">
                    {important && <span className="badge badge-warning">Importante</span>}
                    <span className="badge badge-neutral">{NOTIFICATION_TYPE_LABEL[n.type]}</span>
                    <span>{originLabel(n)}</span>
                    <span>· {timeAgo(n.created_at)}</span>
                  </span>
                </span>
              </button>
              <div className="notification-actions">
                {link && (
                  <button type="button" className="btn btn-outlined btn-sm" onClick={() => handleGo(n, link)}>
                    Abrir
                  </button>
                )}
                {!n.is_read && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => markRead([n.id])} aria-label={`Marcar como leída: ${n.title}`}>
                    <Icon name="check" size={14} />
                    Leída
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {canCreate && (
        <Link to="/notificaciones/nueva" className="btn btn-primary btn-icon fab" aria-label="Nueva notificación">
          <Icon name="plus" size={20} />
          <span className="fab-label">Nueva notificación</span>
        </Link>
      )}

      {openNotification && (
        <NotificationDetailModal
          notification={openNotification}
          typeLabel={NOTIFICATION_TYPE_LABEL[openNotification.type]}
          scopeLabel={originLabel(openNotification)}
          onClose={() => setOpenNotification(null)}
          onOpenRelated={(() => {
            const to = notificationLink(openNotification, canManageUsers)
            return to ? () => navigate(to) : undefined
          })()}
        />
      )}
    </AppShell>
  )
}
