// Errores del navegador que la persona no provoca: una versión nueva del sistema que dejó sin archivo a
// una pantalla abierta, o una falla de código sin manejar. Nada se envía a ningún lado: se deja una línea
// en la consola, sin datos personales, y se ayuda a recuperarse.

const RELOAD_KEY = 'siger4:reload-for-new-version'
// Una sola recarga automática por ventana de tiempo: si el archivo sigue sin aparecer, se avisa en vez de
// recargar en bucle.
const RELOAD_WINDOW_MS = 60_000

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk [\w-]+ failed|Unable to preload CSS|ChunkLoadError/i

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

export function isChunkLoadError(error: unknown): boolean {
  return CHUNK_ERROR.test(messageOf(error))
}

// Saca lo que identifica a una persona (emails, teléfonos, DNI, ids) antes de escribir en consola.
export function scrubPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    .replace(/\d[\d\s().-]{6,}\d/g, '[número]')
    .slice(0, 300)
}

export function logClientError(scope: string, error: unknown) {
  console.error(`[SIGER4] ${scope}: ${scrubPersonalData(messageOf(error))}`)
}

// Recarga la página una vez para tomar la versión nueva. Devuelve true si la recarga se pidió; false si ya
// se hizo hace poco (en ese caso la pantalla le pide a la persona que recargue ella).
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0')
    if (last && Date.now() - last < RELOAD_WINDOW_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Sin sessionStorage no hay cómo recordar el intento: no se recarga solo, se avisa.
    return false
  }
  window.location.reload()
  return true
}

let installed = false

export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // Vite avisa con este evento cuando falla la precarga de un archivo de una pantalla.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnceForNewVersion()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnceForNewVersion()
      return
    }
    logClientError('promesa sin manejar', event.reason)
  })

  window.addEventListener('error', (event) => {
    // Los errores de carga de imágenes y archivos no traen `error`: no son de código.
    if (!event.error) return
    if (isChunkLoadError(event.error)) {
      reloadOnceForNewVersion()
      return
    }
    logClientError('error sin manejar', event.error)
  })
}
