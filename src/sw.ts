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

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

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

// Imagenes que no vienen de Supabase (assets propios de /public, ej. logos
// estaticos) siguen cacheables sin restriccion.
registerRoute(
  ({ request, url }) => request.destination === 'image' && !url.hostname.endsWith('supabase.co'),
  new CacheFirst({
    cacheName: 'siger4-image-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

self.addEventListener('install', () => {
  self.skipWaiting()
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
      // Logo real del Dpto. Informática y Estadística R4 (no el ícono
      // genérico de la PWA) — ver public/logos/README.md, mismo archivo
      // fuente que login/sidebar/header, reescalado a los tamaños que pide
      // la Notifications API. "icon" es el ícono grande de la notificación;
      // "badge" es el ícono chico monocromo de la barra de estado en
      // Android (Chrome lo enmascara automáticamente a blanco/alpha).
      icon: '/icons/push-informatica-512.png',
      badge: '/icons/push-informatica-192.png',
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
