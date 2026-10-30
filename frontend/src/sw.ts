/// <reference lib="webworker" />

// SIGER4 - Service worker custom (injectManifest)
//
// Se usa injectManifest en vez de generateSW porque generateSW no permite
// agregar listeners propios de eventos push/notificationclick — solo genera
// el precache/runtime caching. self.__WB_MANIFEST es reemplazado por
// vite-plugin-pwa con la lista real de assets a precachear en el build.

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// El NavigationRoute de abajo intercepta CUALQUIER navegación (escribir una
// URL, un bookmark, abrir un link — cualquier request con mode:'navigate')
// y sirve el shell de React (index.html) en su lugar, sin importar a qué
// ruta se navegó. Eso es lo que hace andar el ruteo client-side de la SPA
// para rutas reales de la app — pero con el allowlist default de Workbox
// (todo) también capturaba cualquier archivo .html estático suelto servido
// desde la raíz (ej. public/*.html): navegar directo a esa URL devolvía el
// shell de React en vez del archivo real. El denylist excluye
// explícitamente archivos .html sueltos (nunca son rutas de la SPA, que no
// usa extensión en sus URLs) del fallback al shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/\/[^/]+\.html$/],
  }),
)

// Estrategia de cache (revision 2026-07, ver auditoria de seguridad). Workbox
// evalua las rutas registradas EN ORDEN y usa la primera que matchea, por eso
// el orden de estos dos registerRoute() importa:
//
// 1) Imagenes de los buckets PUBLICOS de Storage (station-media/avatars, sin
//    JWT, pensados para mostrarse sin autenticacion) SI pueden cachearse: no
//    dependen de sesion ni contienen datos privados, y cachearlas es lo que
//    permite ver logos/fotos institucionales sin conexion.
// 2) CUALQUIER OTRA respuesta de *.supabase.co (REST /rest/v1, /auth/v1,
//    /storage/v1/object/sign de "documents" -privado-, /functions/v1,
//    Realtime) nunca se cachea: puede contener datos privados o dependientes
//    de la sesion/rol actual. NetworkOnly dejaria que el navegador cachee por
//    default si no se declarara explicito, asi que se declara a proposito
//    para dejar constancia de la decision. Si el usuario esta offline, esas
//    llamadas simplemente fallan (la app ya maneja error de red en cada
//    pantalla) en vez de servir datos viejos o de otro perfil/sesion.

registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    url.hostname.endsWith('supabase.co') &&
    (url.pathname.includes('/storage/v1/object/public/station-media/') ||
      url.pathname.includes('/storage/v1/object/public/avatars/')),
  new CacheFirst({
    cacheName: 'siger4-image-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

registerRoute(
  ({ url }) => url.hostname.endsWith('supabase.co'),
  new NetworkOnly(),
)

// Teselas del Mapa Regional (OpenStreetMap, Leaflet) -- ruta propia, ANTES
// de la regla genérica de "imagen no-Supabase" de abajo (Workbox usa la
// primera ruta que matchea, así que el orden importa). Sin esto caían en
// esa regla genérica igual (mismo CacheFirst), pero: 1) su
// maxEntries:60/30 días está pensado para un puñado de logos propios, no
// para el volumen de tiles que se piden al navegar/hacer zoom un mapa real
// -- acá se sube el límite y se acorta el vencimiento para no ensuciar el
// cache indefinidamente; 2) tenerla separada documenta explícitamente que
// este dominio cross-origin (tile.openstreetmap.org) está permitido a
// propósito, en vez de colar silenciosamente por "cualquier imagen
// externa". El bloqueo real que causaba "no-response" era el CSP
// (connect-src, ver vercel.json) -- un fetch() de Workbox corre en el
// contexto del Service Worker y se chequea contra connect-src, no img-src
// (que solo aplica a un <img> cargado directo por el navegador). Sin
// connect-src permitiendo este dominio, CacheFirst nunca llegaba a
// cachear nada: el fetch fallaba antes.
registerRoute(
  ({ url }) => url.hostname.endsWith('.tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'siger4-osm-tile-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true })],
  }),
)

// Imagenes que no vienen de Supabase ni de OpenStreetMap (assets propios de
// /public, ej. logos estaticos) siguen cacheables sin restriccion.
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' && !url.hostname.endsWith('supabase.co') && !url.hostname.endsWith('.tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'siger4-image-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

// Antes, install llamaba a self.skipWaiting() incondicionalmente: un SW
// nuevo se activaba de inmediato (junto con clients.claim() en activate,
// tomaba control de las pestañas ya abiertas al instante), y como
// main.tsx no pasaba onNeedReload a registerSW, vite-plugin-pwa reaccionaba
// a esa activación recargando la página sola y sin aviso — causa real de
// recargas/pérdida de datos al volver de background si hubo un deploy
// mientras la app estaba en segundo plano (ver DEPLOYMENT.md). Ahora el SW
// nuevo se queda "esperando" (waiting) hasta que el cliente confirme
// explícitamente vía postMessage — SwUpdateBanner.tsx es quien dispara ese
// mensaje, solo cuando el usuario lo decide.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Payload esperado (armado por las Edge Functions send-push/send-push-system):
// nunca incluye datos sensibles, solo lo necesario para mostrar la
// notificacion y navegar al hacer click. notification_id/type son opcionales
// (compatibilidad con paylods viejos ya en vuelo si hubiera un push
// encolado del lado del navegador al momento del deploy) pero el backend
// actual siempre los manda — ver seccion 3 del pedido de diagnostico.
interface SigerPushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
  notification_id?: string
  type?: string
}

// Diagnostico local del service worker (IndexedDB) -- pedido explicito:
// el problema reportado es "el backend dice sent pero el dispositivo nunca
// muestra la notificacion", y eso es indistinguible desde el backend solo:
// hace falta que el SW deje un rastro de lo que efectivamente le llego y
// pudo (o no) mostrar, sin depender de que la app este abierta en ese
// momento -- se lee recien despues, cuando el usuario abre Ajustes. No usa
// window, cliente de Supabase, React ni localStorage (no existen en este
// contexto); IndexedDB es el unico storage persistente disponible dentro de
// un Service Worker.
const PUSH_DIAGNOSTIC_DB_NAME = 'siger4-push-diagnostics'
const PUSH_DIAGNOSTIC_DB_VERSION = 1
const PUSH_DIAGNOSTIC_STORE = 'events'
const PUSH_DIAGNOSTIC_KEY = 'last'

interface PushDiagnosticRecord {
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

function openPushDiagnosticDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_DIAGNOSTIC_DB_NAME, PUSH_DIAGNOSTIC_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_DIAGNOSTIC_STORE)) {
        request.result.createObjectStore(PUSH_DIAGNOSTIC_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Nunca debe poder romper el manejo del evento push real -- si IndexedDB
// falla (cuota, contexto privado que la restringe, etc.) el error se traga
// acá adentro; el diagnostico es best-effort, mostrar la notificacion no lo
// es.
async function recordPushDiagnostic(record: PushDiagnosticRecord): Promise<void> {
  try {
    const db = await openPushDiagnosticDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUSH_DIAGNOSTIC_STORE, 'readwrite')
      tx.objectStore(PUSH_DIAGNOSTIC_STORE).put(record, PUSH_DIAGNOSTIC_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // best-effort, ver comentario de arriba.
  }
}

self.addEventListener('push', (event) => {
  const receivedAt = new Date().toISOString()
  let rawText: string | null = null
  let payload: SigerPushPayload = { title: 'SIGER4' }
  let validJson = false

  try {
    if (event.data) {
      rawText = event.data.text()
      payload = { ...payload, ...event.data.json() }
      validJson = true
    }
  } catch {
    // Si el payload no es JSON valido, se muestra un titulo generico en vez
    // de romper el evento push -- ver fallback de "title"/"body" mas abajo.
  }

  // Fallback seguro: si el payload no trae title/body (JSON invalido, o
  // JSON valido pero sin esos campos, o con esos campos en un tipo
  // inesperado -- event.data.json() devuelve "any", SigerPushPayload es
  // solo un tipo de compilacion, no una garantia en runtime), nunca se
  // llama a showNotification() con un titulo vacio -- Chrome/Android puede
  // directamente no mostrar una notificacion sin titulo, lo que en el
  // dispositivo se ve identico a "no llego nada". String(...) antes de
  // trim() evita que un payload valido pero con title/body no-string (ej.
  // {"title":123}) rompa el listener entero con un TypeError no capturado.
  const rawTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const rawBody = typeof payload.body === 'string' ? payload.body.trim() : ''
  const title = rawTitle || 'SIGER4'
  const body = rawBody || 'Tenés una notificación nueva.'
  const { url, tag, notification_id: notificationId, type } = payload

  event.waitUntil(
    (async () => {
      let showSucceeded = false
      let showError: string | null = null
      try {
        await self.registration.showNotification(title, {
          body,
          // "icon" es el ícono grande de la notificación: el logo completo
          // del Dpto. Informática y Estadística R4 (mismo archivo que
          // login/sidebar/header, ver public/logos/README.md), reescalado.
          //
          // "badge" es el ícono CHICO de la barra de estado/notificación de
          // Android: el sistema operativo ignora el color y usa solo el
          // canal alfa para pintar una silueta monocroma (blanco/gris), a un
          // tamaño efectivo muy pequeño (~24px). El emblema completo tiene
          // demasiado detalle (anillo de texto, bandera, laptop chica) para
          // sobrevivir esa reducción — queda una mancha ilegible.
          // push-badge-192.png es una silueta simplificada (laptop +
          // "píxeles" de datos, sin texto) hecha a propósito para este uso,
          // blanco sólido sobre fondo transparente.
          icon: '/icons/push-informatica-512.png',
          badge: '/icons/push-badge-192.png',
          tag: tag,
          data: { url: url ?? '/notificaciones' },
        })
        showSucceeded = true
      } catch (err) {
        showError = err instanceof Error ? err.message : String(err)
      }

      await recordPushDiagnostic({
        push_event_received_at: receivedAt,
        payload_raw: rawText,
        payload_valid_json: validJson,
        notification_title: title,
        notification_body: body,
        notification_type: type ?? tag ?? null,
        notification_id: notificationId ?? null,
        show_notification_called: true,
        show_notification_succeeded: showSucceeded,
        show_notification_error: showError,
      })

      // Re-lanza el error DESPUES de haber registrado el diagnostico local:
      // el diagnostico nunca debe perderse por esto (por eso va antes), pero
      // tampoco hay que ocultarle al navegador que showNotification() falló
      // -- un event.waitUntil que siempre resuelve en éxito le saca al
      // browser/push service la señal estándar de "este evento push falló"
      // (visible en chrome://serviceworker-internals, y parte de la
      // heurística que usan algunos navegadores para decidir si mantener la
      // suscripción activa).
      if (!showSucceeded) throw new Error(showError ?? 'showNotification falló')
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/notificaciones'

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientsList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await (client as WindowClient).navigate(targetUrl)
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
