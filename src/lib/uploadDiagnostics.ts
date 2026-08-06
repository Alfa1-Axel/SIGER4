// SIGER4 - Instrumentación TEMPORAL de diagnóstico para la carga de
// documentos en mobile/PWA.
//
// Contexto: en escritorio la carga funciona; en mobile/PWA no. Ronda 3 de
// diagnóstico: el panel anterior guardaba los eventos SOLO en memoria
// (un array de JS), lo que lo hacía inútil para este bug específico — la
// causa confirmada es que Android/iOS recargan la página completa al abrir
// el selector de archivos/cámara, y una recarga real destruye cualquier
// estado en memoria. El resultado observado (solo aparecían
// "draftRecovered"/"wizardStepChange", nunca "onChange"/"uploadStart"/
// "uploadFail") es exactamente lo esperado de un log en memoria: esos
// eventos SÍ se registraban, pero en la instancia de la página que la
// recarga destruyó antes de que nadie llegara a abrir el panel a verlos.
//
// Ahora cada log() persiste inmediatamente a sessionStorage (no se acumula
// en memoria y se vuelca al final) — así el snapshot sobrevive la recarga
// real y el panel, al remontarse en la página nueva, puede seguir mostrando
// TODO lo que pasó en el intento anterior, no solo lo que pasó después de
// la recarga.
//
// Este módulo NO cambia ningún comportamiento del flujo de carga real — solo
// registra eventos con datos no sensibles (nombre/tipo/tamaño de archivo, id
// de documento, errores ya pensados para mostrarse al usuario). Se muestra
// únicamente a informatica_r4/integrante_informatica en un panel colapsable
// dentro de DocumentoFormPage. Diseñado para poder borrarse por completo una
// vez diagnosticada la causa real (dos archivos + unos pocos puntos de
// integración en DocumentoFormPage.tsx).
//
// Nunca registra: contraseñas, tokens, JWT, claves VAPID, ni el contenido
// del archivo — solo metadata (nombre/tipo/tamaño) y errores ya pensados
// para mostrarse al usuario (mismo objeto Error que ya se muestra en
// pantalla, no algo nuevo más sensible).

export type UploadDiagnosticEvent =
  // Cadena completa del input real, en el orden en que deberían aparecer:
  // label visible tocado -> click nativo del <input> real, disparado por la
  // asociación htmlFor/id del label (abre el picker/cámara del SO) ->
  // onChange nativo (el navegador devolvió algo). Si aparece
  // fileInputLabelClick pero nunca nativeFileInputClick, el click del label
  // no llegó a propagarse al input real (no debería pasar con htmlFor/id
  // correctos, pero queda instrumentado por las dudas). Si aparece
  // nativeFileInputClick pero nunca nativeFileInputChange, el usuario
  // canceló el picker O el navegador nunca disparó el evento — la recarga
  // real que mata la página mientras el picker está abierto puede producir
  // exactamente este patrón.
  | 'fileInputLabelClick'
  | 'nativeFileInputClick'
  | 'nativeFileInputChange'
  // Se registra por separado de nativeFileInputChange (nunca con el mismo
  // nombre) a propósito: es un evento SINTÉTICO que este código dispara
  // cuando pasó el margen de espera sin que el navegador devolviera nada —
  // mezclarlo con nativeFileInputChange real rompería cualquier detección
  // tipo "¿hubo un change real después de este click?" (ver
  // UploadDiagnosticsPanel.tsx), que necesita distinguir "no pasó nada" de
  // "sí pasó algo".
  | 'nativeFileInputChangeTimeout'
  | 'fileDetected'
  | 'fileRejectedClient'
  | 'validateMetadata'
  | 'uploadButtonClicked'
  | 'pendingCreateStart'
  | 'pendingCreateSuccess'
  | 'pendingCreateFail'
  | 'updatePendingMetadata'
  | 'addVersion'
  | 'uploadStart'
  | 'uploadSuccess'
  | 'uploadFail'
  | 'confirmDocumentStart'
  | 'confirmDocumentSuccess'
  | 'confirmDocumentFail'
  | 'notificationCreated'
  | 'finalSave'
  | 'draftRecovered'
  | 'wizardStepChange'
  | 'unhandledError'
  | 'unhandledRejection'
  | 'pageshow'
  | 'visibilitychange'
  | 'pagehide'
  | 'beforeunload'
  // Marca explícita de "se abrió el panel y se vio este snapshot" — ayuda a
  // distinguir, mirando los timestamps, si el usuario alcanzó a ver el
  // resultado de un intento antes de que otra recarga lo tapara.
  | 'panelViewed'

export interface UploadDiagnosticEntry {
  timestamp: string
  event: UploadDiagnosticEvent
  detail?: Record<string, unknown>
}

// Serializa un error de la forma más completa posible sin asumir su tipo
// exacto: los errores de Supabase (PostgrestError, StorageApiError) traen
// code/details/hint/status además de message, que Error.prototype no expone
// por default — hay que leerlos explícitamente o se pierden.
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const extra = err as Error & { code?: string; details?: string; hint?: string; status?: number; statusCode?: string }
    return {
      message: extra.message,
      name: extra.name,
      code: extra.code,
      details: extra.details,
      hint: extra.hint,
      status: extra.status,
      statusCode: extra.statusCode,
    }
  }
  return { raw: String(err) }
}

function detectEnvironment(): {
  isMobileUA: boolean
  isStandalonePWA: boolean
  userAgent: string
  platform: string
  online: boolean
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'n/d'
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  // display-mode: standalone es el indicador estándar de "PWA instalada"
  // (Android/Chrome y iOS/Safari lo soportan); navigator.standalone es el
  // equivalente legado de iOS Safari para versiones que no exponen matchMedia
  // con ese media feature.
  const isStandalonePWA =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    false
  return {
    isMobileUA,
    isStandalonePWA,
    userAgent: ua,
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'n/d',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  }
}

async function detectServiceWorker(): Promise<{ supported: boolean; active: boolean; scriptURL?: string }> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { supported: false, active: false }
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      supported: true,
      active: Boolean(registration?.active),
      scriptURL: registration?.active?.scriptURL,
    }
  } catch {
    return { supported: true, active: false }
  }
}

export interface UploadDiagnosticsSnapshot {
  environment: ReturnType<typeof detectEnvironment>
  serviceWorker: { supported: boolean; active: boolean; scriptURL?: string }
  entries: UploadDiagnosticEntry[]
}

const STORAGE_KEY = 'siger4:upload-diagnostics-log'
const MAX_ENTRIES = 200

function readEntries(): UploadDiagnosticEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEntries(entries: UploadDiagnosticEntry[]): void {
  try {
    // Recorta a las últimas MAX_ENTRIES para no crecer sin límite dentro de
    // una misma pestaña/sesión larga (varios intentos, varias recargas) —
    // sessionStorage tiene cuota, y lo que importa para diagnosticar es el
    // historial reciente, no absolutamente todo desde que se abrió la app.
    const trimmed = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // sessionStorage puede fallar (modo privado, cuota agotada) — el
    // diagnóstico es una ayuda para depurar, no un requisito para cargar.
  }
}

// Log persistente: cada log() se guarda de inmediato en sessionStorage, no
// solo en memoria — es la diferencia real respecto a la versión anterior,
// que perdía todo lo registrado apenas Android/iOS recargaban la página a
// mitad del flujo. No es un singleton per-key (todas las instancias en la
// misma pestaña comparten la misma clave de sessionStorage) a propósito:
// el objetivo es reconstruir la secuencia completa de UN intento de carga,
// incluso si atraviesa varias recargas/remounts de React.
export function createUploadDiagnosticsLog() {
  return {
    log(event: UploadDiagnosticEvent, detail?: Record<string, unknown>) {
      const entries = readEntries()
      entries.push({ timestamp: new Date().toISOString(), event, detail })
      writeEntries(entries)
    },
    async snapshot(): Promise<UploadDiagnosticsSnapshot> {
      return {
        environment: detectEnvironment(),
        serviceWorker: await detectServiceWorker(),
        entries: readEntries(),
      }
    },
    // Borra el historial completo — para usar deliberadamente (ej. botón
    // "Limpiar log" en el panel) al empezar a diagnosticar un caso nuevo,
    // nunca automático: perder el historial de un intento fallido sin que
    // alguien lo haya visto sería el mismo problema que esto vino a arreglar.
    clear() {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // Idem writeEntries.
      }
    },
  }
}

export type UploadDiagnosticsLog = ReturnType<typeof createUploadDiagnosticsLog>

// Captura cualquier excepción/rechazo no manejado mientras el formulario de
// documentos está montado, fuera de los try/catch ya instrumentados a mano
// (ver DocumentoFormPage.tsx) — red de seguridad para el caso de que el
// fallo real esté en un lugar no anticipado (ej. un throw síncrono antes de
// entrar al try, o un error de render). Devuelve una función de limpieza
// para sacar los listeners al desmontar.
export function attachGlobalErrorCapture(log: UploadDiagnosticsLog): () => void {
  const onError = (event: ErrorEvent) => {
    log.log('unhandledError', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    log.log('unhandledRejection', serializeError(event.reason))
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

// Captura el ciclo de vida real de la página mientras el formulario está
// montado — pensado específicamente para confirmar (no solo suponer) que
// Android/iOS recargan la página al abrir el selector de archivos/cámara,
// en vez de solo backgroundear la pestaña:
//   - "pageshow" con persisted=true significa que la página se restauró
//     desde bfcache (back-forward cache) — el JS en memoria sigue vivo, NO
//     hubo recarga real. persisted=false en un pageshow posterior al
//     primero sí sugiere una recarga real.
//   - "visibilitychange" a 'hidden' marca el momento en que el usuario deja
//     la pestaña (ej. al abrir el selector nativo).
//   - "pagehide"/"beforeunload" marcan el último instante antes de que la
//     página se descargue de verdad (a diferencia de visibilitychange, que
//     también dispara solo por cambiar de pestaña sin descargar nada). Como
//     el log ahora persiste a sessionStorage en cada evento (no al final),
//     estos SÍ quedan guardados aunque la página se descargue justo después.
export function attachPageLifecycleCapture(log: UploadDiagnosticsLog): () => void {
  const onPageShow = (event: PageTransitionEvent) => {
    log.log('pageshow', { persisted: event.persisted })
  }
  const onVisibilityChange = () => {
    log.log('visibilitychange', { visibilityState: document.visibilityState })
  }
  const onPageHide = (event: PageTransitionEvent) => {
    log.log('pagehide', { persisted: event.persisted })
  }
  const onBeforeUnload = () => {
    log.log('beforeunload', {})
  }
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}
