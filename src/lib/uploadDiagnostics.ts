// SIGER4 - Instrumentación TEMPORAL de diagnóstico para la carga de
// documentos en mobile/PWA.
//
// Contexto: en escritorio la carga funciona; en mobile/PWA (navegador y app
// instalada) no sube nada — ni fotos, ni video, ni PDF, ni Word — después de
// dos rondas previas de fixes basados en lectura de código (MIME/
// contentType, rediseño en 2 pasos) que no lo resolvieron. Sin acceso a un
// dispositivo real ni a los logs de consola del celular del usuario, no hay
// forma de diagnosticar la causa real sin instrumentación que el usuario
// pueda leer y reportar.
//
// Este módulo NO cambia ningún comportamiento del flujo de carga — solo
// registra en memoria (nunca en un servicio externo, nunca en Storage/DB)
// una serie de eventos con datos no sensibles (nombre/tipo/tamaño de
// archivo, id de documento, mensajes de error reales de Supabase). Se
// muestra únicamente a informatica_r4/integrante_integrante (mismo gate que
// el resto del panel de administración) en un panel colapsable dentro de
// DocumentoFormPage. Diseñado para poder borrarse por completo una vez
// diagnosticada la causa real, sin dejar rastros en el resto del código
// (un solo import en DocumentoFormPage.tsx).
//
// Nunca registra: contraseñas, tokens, JWT, claves VAPID, ni el contenido
// del archivo — solo metadata (nombre/tipo/tamaño) y errores ya pensados
// para mostrarse al usuario (mismo objeto Error que ya se muestra en
// pantalla, no algo nuevo más sensible).

export type UploadDiagnosticEvent =
  | 'onChange'
  | 'validateMetadata'
  | 'createPending'
  | 'updatePendingMetadata'
  | 'addVersion'
  | 'uploadStart'
  | 'uploadSuccess'
  | 'uploadFail'
  | 'updateStoragePath'
  | 'finalSave'
  | 'draftRecovered'
  | 'wizardStepChange'
  | 'unhandledError'
  | 'unhandledRejection'
  | 'pageshow'
  | 'visibilitychange'
  | 'pagehide'
  | 'beforeunload'

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

// Instancia simple en memoria (no singleton exportado como clase para
// mantener el import mínimo) — vive mientras dure el componente que la usa,
// se descarta al desmontar. No persiste entre sesiones a propósito: es
// diagnóstico de UNA carga concreta, no un log histórico.
export function createUploadDiagnosticsLog() {
  const entries: UploadDiagnosticEntry[] = []

  return {
    log(event: UploadDiagnosticEvent, detail?: Record<string, unknown>) {
      entries.push({ timestamp: new Date().toISOString(), event, detail })
    },
    async snapshot(): Promise<UploadDiagnosticsSnapshot> {
      return {
        environment: detectEnvironment(),
        serviceWorker: await detectServiceWorker(),
        entries: [...entries],
      }
    },
    clear() {
      entries.length = 0
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
//     la pestaña (ej. al abrir el selector nativo) — si el próximo evento
//     registrado después es un remount de React (nuevo log de "onChange"
//     nunca llega, en cambio aparece un "draftRecovered" fresco) en vez de
//     un 'visible' de vuelta, confirma que hubo recarga real en el medio.
//   - "pagehide"/"beforeunload" marcan el último instante antes de que la
//     página se descargue de verdad (a diferencia de visibilitychange, que
//     también dispara solo por cambiar de pestaña sin descargar nada).
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
