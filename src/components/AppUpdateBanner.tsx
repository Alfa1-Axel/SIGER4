import { useEffect, useRef, useState } from 'react'
import { APP_UPDATES } from '../config/appUpdates'
import type { AppUpdate, AppUpdateSeverity } from '../config/appUpdates'
import { hasSeenAppUpdate, markAppUpdateSeen } from '../lib/appUpdateSeen'
import { subscribeForceShowAppUpdateBanner } from '../lib/appUpdateBannerControl'
import { createAppUpdateNotification } from '../lib/api/notifications'
import { useAuth } from '../hooks/useAuth'
import { Icon } from './ui/Icon'

// Solo el primer elemento de APP_UPDATES es "la novedad actual" — ver el
// comentario en ese archivo sobre por qué el resto queda como historial en
// el código en vez de descartarse.
function getLatestAppUpdate(): AppUpdate | null {
  return APP_UPDATES[0] ?? null
}

function findAppUpdateById(id: string): AppUpdate | null {
  return APP_UPDATES.find((u) => u.id === id) ?? null
}

const SEVERITY_LABEL: Record<AppUpdateSeverity, string> = {
  info: 'Información',
  improvement: 'Mejora',
  important: 'Importante',
}

// Se monta una sola vez dentro de AuthProvider (ver App.tsx), mismo patrón
// que NotificationPushBridge — así el banner se evalúa una vez por sesión
// real, sin importar en qué pantalla esté el usuario ni cuántas veces se
// remonte una página en particular. Gateado por sesión real (no solo
// "loading terminó") para que nunca aparezca en /login ni antes de terminar
// de autenticar.
export function AppUpdateBanner() {
  const { session, profile } = useAuth()
  const [visible, setVisible] = useState(false)
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  // Evita reintentar la RPC (y reabrir el banner recién cerrado) en cada
  // evento de onAuthStateChange (TOKEN_REFRESHED, reconexión, cambio de
  // pestaña) — esos eventos generan un objeto `session` nuevo por
  // referencia aunque sea la misma sesión, así que un useEffect con
  // `session`/`profile` completos en las deps volvería a correr en cada
  // uno. Acá dependemos solo de valores primitivos estables (session != null,
  // profile.id) y de una ref para no repetir la petición de red una vez que
  // ya se intentó en este montaje -- ensure_app_update_notification (ver
  // notifications.ts) ya es seguro para reintentos igual, esto es además
  // para no generar tráfico de red de sobra en cada refresh silencioso.
  const attemptedForProfileId = useRef<string | null>(null)
  const hasSession = session != null
  const profileId = profile?.id ?? null

  useEffect(() => {
    if (!hasSession || !profileId) return
    const latest = getLatestAppUpdate()
    if (!latest) return
    if (attemptedForProfileId.current === profileId) return
    attemptedForProfileId.current = profileId

    // La notificación interna (persistente en /notificaciones, "una vez por
    // usuario" vía el índice único de la migración 0077, aplicado por la RPC
    // ensure_app_update_notification de la migración 0079) es independiente
    // de "ya visto en este navegador" (localStorage, hasSeenAppUpdate) — se
    // crea siempre que exista la novedad, aunque el banner ya no se muestre
    // más en este dispositivo puntual, para que quede un rastro accesible
    // desde cualquier sesión.
    void createAppUpdateNotification(
      latest.id,
      'Nueva actualización disponible. Ingresá para conocer las novedades.',
    ).catch(() => undefined)

    if (hasSeenAppUpdate(latest.id)) return
    setUpdate(latest)
    setVisible(true)
  }, [hasSession, profileId])

  // Reabrir el modal de una novedad puntual desde /notificaciones (tocar una
  // notificación de tipo actualizacion_sistema) — no depende de si el
  // usuario ya la "vio" en este navegador, es una apertura explícita.
  useEffect(() => {
    return subscribeForceShowAppUpdateBanner((updateId) => {
      const target = findAppUpdateById(updateId)
      if (!target) return
      setUpdate(target)
      setVisible(true)
    })
  }, [])

  function handleDismiss() {
    if (update) markAppUpdateSeen(update.id)
    setVisible(false)
  }

  if (!visible || !update) return null

  return (
    <div className="app-update-overlay" role="presentation">
      <div className="app-update-card card-solid" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="app-update-header">
          <span className={`badge badge-${update.severity === 'important' ? 'danger' : update.severity === 'improvement' ? 'success' : 'info'}`}>
            {SEVERITY_LABEL[update.severity]}
          </span>
          <button type="button" className="app-update-close" aria-label="Cerrar" onClick={handleDismiss}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <h2 id="app-update-title" className="app-update-title">
          {update.title}
        </h2>
        <p className="app-update-date">{new Date(update.date + 'T00:00:00').toLocaleDateString('es-AR', { dateStyle: 'long' })}</p>
        <p className="app-update-description">{update.description}</p>

        {update.changes.length > 0 && (
          <ul className="app-update-changes">
            {update.changes.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
        )}

        <div className="app-update-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={handleDismiss}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
