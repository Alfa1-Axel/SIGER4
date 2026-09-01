// Lectura del diagnóstico local que el service worker (src/sw.ts) deja en
// IndexedDB en cada evento 'push' que procesa. Es el único modo de saber,
// desde la app, si un push que el backend marcó como "sent" efectivamente
// llegó al dispositivo — el backend nunca se entera si showNotification()
// falló o si el evento 'push' ni siquiera disparó (Chrome/Android lo
// descartó, el SW no estaba activo, etc.).
//
// Mismo nombre/versión/store que src/sw.ts (PUSH_DIAGNOSTIC_DB_NAME/
// PUSH_DIAGNOSTIC_DB_VERSION/PUSH_DIAGNOSTIC_STORE) — duplicado a propósito:
// el SW y el bundle de la app se compilan por separado (injectManifest), así
// que no comparten módulos entre sí; si cambia el nombre en uno hay que
// cambiarlo en el otro.
const PUSH_DIAGNOSTIC_DB_NAME = 'siger4-push-diagnostics'
const PUSH_DIAGNOSTIC_DB_VERSION = 1
const PUSH_DIAGNOSTIC_STORE = 'events'
const PUSH_DIAGNOSTIC_KEY = 'last'

export interface PushDiagnosticRecord {
  push_event_received_at: string
  payload_raw: string | null
  payload_valid_json: boolean
  notification_title: string | null
  notification_body: string | null
  notification_type: string | null
  notification_id: string | null
  show_notification_called: boolean
  show_notification_succeeded: boolean
  show_notification_error: string | null
}

// Devuelve null tanto si nunca hubo un push procesado por este SW en este
// dispositivo como si IndexedDB no está disponible (contexto privado
// restrictivo, navegador viejo) — en ambos casos no hay nada que mostrar,
// nunca se rompe la carga del panel de Ajustes por esto.
export async function readLastPushDiagnostic(): Promise<PushDiagnosticRecord | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(PUSH_DIAGNOSTIC_DB_NAME, PUSH_DIAGNOSTIC_DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PUSH_DIAGNOSTIC_STORE)) {
          request.result.createObjectStore(PUSH_DIAGNOSTIC_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record = await new Promise<PushDiagnosticRecord | null>((resolve, reject) => {
      const tx = db.transaction(PUSH_DIAGNOSTIC_STORE, 'readonly')
      const getRequest = tx.objectStore(PUSH_DIAGNOSTIC_STORE).get(PUSH_DIAGNOSTIC_KEY)
      getRequest.onsuccess = () => resolve((getRequest.result as PushDiagnosticRecord | undefined) ?? null)
      getRequest.onerror = () => reject(getRequest.error)
    })
    db.close()
    return record
  } catch {
    return null
  }
}
