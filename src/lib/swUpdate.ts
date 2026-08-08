// Puente entre el registro del service worker (main.tsx, fuera del árbol de
// React) y el banner que le avisa al usuario que hay una versión nueva
// (SwUpdateBanner.tsx). Antes, vite-plugin-pwa recargaba la página solo en
// cuanto detectaba el SW nuevo activado (sin onNeedReload, la librería hace
// window.location.reload() automático) — eso es lo que perdía datos/ruta al
// volver de background si hubo un deploy mientras la app estaba en segundo
// plano. Ahora se avisa y el usuario decide cuándo recargar.
type UpdateListener = () => void

let updateAvailable = false
let applyUpdateFn: (() => void) | null = null
const listeners = new Set<UpdateListener>()

export function reportSwUpdateAvailable(applyUpdate: () => void) {
  updateAvailable = true
  applyUpdateFn = applyUpdate
  listeners.forEach((listener) => listener())
}

export function isSwUpdateAvailable(): boolean {
  return updateAvailable
}

export function applySwUpdate() {
  applyUpdateFn?.()
}

export function subscribeSwUpdate(listener: UpdateListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
