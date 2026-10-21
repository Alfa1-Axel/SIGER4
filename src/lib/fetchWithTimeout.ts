// Tiempo máximo de espera para los pedidos a la base y a la autenticación. Sin límite, una conexión que se
// cuelga (típico del celular entre antenas) deja la pantalla cargando para siempre; con límite, la pantalla
// puede mostrar el error y ofrecer reintentar. 30 s es muy por encima de lo que tarda una consulta normal (la base
// corta las suyas mucho antes), así que solo actúa cuando algo realmente no responde.
export const API_TIMEOUT_MS = 30_000

// Solo REST y Auth: las subidas y bajadas de archivos (Storage) pueden tardar con razón, y Realtime y las funciones
// tienen su propio ciclo.
const GUARDED = /\/(rest|auth)\/v1\//

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!GUARDED.test(urlOf(input))) return fetch(input, init)

  const controller = new AbortController()
  const outer = init?.signal
  const onOuterAbort = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, API_TIMEOUT_MS)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (timedOut && !outer?.aborted) {
      // Se llama AbortError para que el cliente no lo reintente solo, y el texto se reconoce como falla de
      // conexión ("No hay conexión con el servidor…").
      const timeout = new Error('Failed to fetch: se agotó el tiempo de espera')
      timeout.name = 'AbortError'
      throw timeout
    }
    throw err
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}
