import { useEffect, useState } from 'react'
import { applySwUpdate, isSwUpdateAvailable, subscribeSwUpdate } from '../lib/swUpdate'
import { Icon } from './ui/Icon'

// Reemplaza el auto-reload silencioso de vite-plugin-pwa (ver main.tsx):
// cuando hay una versión nueva del service worker esperando, se avisa acá en
// vez de recargar la página sola. "Actualizar ahora" aplica el SW nuevo
// (dispara un reload real, pero recién ahí, con el usuario al tanto). Mismo
// patrón de montaje que AppUpdateBanner/NotificationPushBridge: una sola vez
// dentro de App, no depende de en qué pantalla esté el usuario.
export function SwUpdateBanner() {
  const [visible, setVisible] = useState(isSwUpdateAvailable())

  useEffect(() => {
    return subscribeSwUpdate(() => setVisible(true))
  }, [])

  if (!visible) return null

  return (
    <div className="sw-update-banner" role="status">
      <Icon name="magic" size={16} />
      <span className="sw-update-banner-text">Hay una actualización de SIGER4 disponible.</span>
      <button type="button" className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => applySwUpdate()}>
        Actualizar ahora
      </button>
      <button type="button" className="sw-update-banner-dismiss" aria-label="Cerrar" onClick={() => setVisible(false)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
