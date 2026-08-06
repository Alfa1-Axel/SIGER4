import { useEffect, useState } from 'react'
import { APP_UPDATES } from '../config/appUpdates'
import type { AppUpdate, AppUpdateSeverity } from '../config/appUpdates'
import { hasSeenAppUpdate, markAppUpdateSeen } from '../lib/appUpdateSeen'
import { useAuth } from '../hooks/useAuth'
import { Icon } from './ui/Icon'

// Solo el primer elemento de APP_UPDATES es "la novedad actual" — ver el
// comentario en ese archivo sobre por qué el resto queda como historial en
// el código en vez de descartarse.
function getLatestAppUpdate(): AppUpdate | null {
  return APP_UPDATES[0] ?? null
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

  useEffect(() => {
    if (!session || !profile) return
    const latest = getLatestAppUpdate()
    if (!latest) return
    if (hasSeenAppUpdate(latest.id)) return
    setUpdate(latest)
    setVisible(true)
  }, [session, profile])

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
