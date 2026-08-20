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

// Payload esperado (armado por la Edge Function send-push): nunca incluye
// datos sensibles, solo lo necesario para mostrar la notificacion y navegar
// al hacer click.
interface SigerPushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: SigerPushPayload = { title: 'SIGER4' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Si el payload no es JSON valido, se muestra un titulo generico en vez
    // de romper el evento push.
  }

  const { title, body, url, tag } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body ?? '',
      // "icon" es el ícono grande de la notificación: el logo completo del
      // Dpto. Informática y Estadística R4 (mismo archivo que login/sidebar/
      // header, ver public/logos/README.md), reescalado.
      //
      // "badge" es el ícono CHICO de la barra de estado/notificación de
      // Android: el sistema operativo ignora el color y usa solo el canal
      // alfa para pintar una silueta monocroma (blanco/gris), a un tamaño
      // efectivo muy pequeño (~24px). El emblema completo tiene demasiado
      // detalle (anillo de texto, bandera, laptop chica) para sobrevivir esa
      // reducción — queda una mancha ilegible. push-badge-192.png es una
      // silueta simplificada (laptop + "píxeles" de datos, sin texto) hecha
      // a propósito para este uso, blanco sólido sobre fondo transparente.
      icon: '/icons/push-informatica-512.png',
      badge: '/icons/push-badge-192.png',
      tag: tag,
      data: { url: url ?? '/notificaciones' },
    }),
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
