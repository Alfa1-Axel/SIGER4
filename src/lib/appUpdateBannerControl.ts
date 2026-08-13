// Puente para reabrir el banner/modal de novedades (AppUpdateBanner.tsx,
// montado globalmente en App.tsx) desde otra pantalla — hoy usado desde
// NotificacionesPage.tsx: tocar una notificación de tipo
// 'actualizacion_sistema' debe reabrir el detalle de la novedad real, no el
// NotificationDetailModal genérico. Mismo patrón pub/sub que
// src/lib/swUpdate.ts (banner de actualización de la PWA).
type ForceShowListener = (updateId: string) => void

const listeners = new Set<ForceShowListener>()

export function forceShowAppUpdateBanner(updateId: string) {
  listeners.forEach((listener) => listener(updateId))
}

export function subscribeForceShowAppUpdateBanner(listener: ForceShowListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
