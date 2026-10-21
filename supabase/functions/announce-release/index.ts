// SIGER4 - Edge Function: announce-release
//
// Anuncia a las personas usuarias que hay una versión nueva en producción: una sola notificación interna breve por perfil
// activo ("Hay una nueva actualización en Documentos."). La creación de los avisos la hace la función SQL announce_release()
// (migración 0122), que registra la versión (única) y crea una notificación personal por cada perfil activo con cuenta. Esta
// función solo decide SI se puede anunciar; el push sale del trigger de siempre (0085), no de acá.
//
// Quién la llama: el comando `npm run release:announce` (scripts/announce-release.mjs), a mano, DESPUÉS de que la versión
// quedó publicada en producción. No la llama la aplicación, ni el navegador, ni ninguna persona usuaria.
//
// Seguridad (en este orden, y cualquier falla corta sin crear nada):
//   1. Método POST y secreto propio: header "x-release-token" contra RELEASE_ANNOUNCE_TOKEN (comparación en tiempo
//      constante). Es un secreto DISTINTO del de las tareas programadas y de las claves de Supabase: solo permite anunciar
//      versiones, y la función igual exige el paso 3.
//   2. El pedido se valida contra un esquema cerrado: versión 1.18.0, entre 1 y 6 módulos de una lista permitida, commit
//      opcional. Nada de texto libre.
//   3. Producción tiene que estar sirviendo ESA versión: la función le pide /version.json al sitio publicado
//      (SIGER4_PUBLIC_URL) y compara. Así un secreto filtrado no alcanza para anunciar una versión que no existe o que todavía
//      no llegó a producción.
//   4. Recién ahí llama a announce_release() con la clave de servicio (que vive solo en el entorno de la función). La función
//      SQL repite sus propias comprobaciones y es idempotente: la misma versión dos veces no genera nada.
//
// No guarda ni registra el secreto, la clave de servicio ni el contenido de ninguna notificación. Los logs llevan solo la
// versión, la cantidad de destinatarios y errores técnicos sin datos personales.
//
// Configuración (Supabase → Edge Functions → Secrets, o `supabase secrets set`):
//   RELEASE_ANNOUNCE_TOKEN   secreto largo y aleatorio (32 caracteres o más). Nunca en el repositorio.
//   SIGER4_PUBLIC_URL        dirección pública de producción, sin barra final (ej. https://siger4.ejemplo.com.ar).
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY: los inyecta Supabase.
// Despliegue: `supabase functions deploy announce-release --no-verify-jwt` (la autenticación es el secreto propio, no un JWT).
// Para apagarla: `supabase secrets unset RELEASE_ANNOUNCE_TOKEN` (queda respondiendo "no configurada") o borrar la función.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { constantTimeEqual, normalizePublicUrl, parseReleaseRequest, parseServedBuild, type ServedBuild } from '../_shared/releaseAnnouncement.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RELEASE_ANNOUNCE_TOKEN = Deno.env.get('RELEASE_ANNOUNCE_TOKEN')
const SIGER4_PUBLIC_URL = normalizePublicUrl(Deno.env.get('SIGER4_PUBLIC_URL'))

const MAX_BODY_BYTES = 4096
const VERSION_CHECK_TIMEOUT_MS = 8000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-release-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

// Lo que dice producción en /version.json (el build lo publica en cada despliegue). build null: no se pudo saber.
async function fetchServedBuild(baseUrl: string): Promise<{ build: ServedBuild | null; reachable: boolean }> {
  try {
    const response = await fetch(`${baseUrl}/version.json?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { build: null, reachable: true }
    return { build: parseServedBuild(await response.json()), reachable: true }
  } catch {
    return { build: null, reachable: false }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RELEASE_ANNOUNCE_TOKEN || RELEASE_ANNOUNCE_TOKEN.length < 32 || !SIGER4_PUBLIC_URL) {
    console.error('[announce-release] Función sin configurar: falta algún secreto o la dirección pública.')
    return jsonResponse({ error: 'La función no está configurada.' }, 503)
  }

  // 1. Secreto propio.
  const presented = req.headers.get('x-release-token') ?? ''
  if (!constantTimeEqual(presented, RELEASE_ANNOUNCE_TOKEN)) {
    console.warn('[announce-release] Intento sin el secreto correcto.')
    return jsonResponse({ error: 'No autorizado.' }, 401)
  }

  // 2. Pedido válido.
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return jsonResponse({ error: 'No se pudo leer el pedido.' }, 400)
  }
  if (raw.length > MAX_BODY_BYTES) return jsonResponse({ error: 'El pedido es demasiado grande.' }, 413)
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(raw)
  } catch {
    return jsonResponse({ error: 'El pedido no es JSON válido.' }, 400)
  }
  const parsed = parseReleaseRequest(parsedBody)
  if (!parsed.ok) return jsonResponse({ error: parsed.message }, 400)
  const { version, modules, commit } = parsed.value

  // 3. Producción tiene que estar sirviendo esa versión.
  const served = await fetchServedBuild(SIGER4_PUBLIC_URL)
  if (!served.reachable) return jsonResponse({ error: 'No se pudo consultar producción. Reintentá en unos minutos.' }, 503)
  if (served.build?.version !== version) {
    return jsonResponse({ error: 'Producción todavía no sirve esa versión. Esperá a que termine el despliegue.', served: served.build?.version ?? null }, 409)
  }
  // Y tiene que estar armada contra ESTE proyecto de Supabase: nunca se anuncia en un proyecto con el despliegue de otro.
  if (served.build.supabaseHost && served.build.supabaseHost !== new URL(SUPABASE_URL).host.toLowerCase()) {
    return jsonResponse({ error: 'Producción usa otro proyecto de Supabase que el de esta función.' }, 409)
  }

  // 4. Anunciar (idempotente por versión).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.rpc('announce_release', { p_version: version, p_modules: modules, p_commit: commit })
  if (error) {
    console.error(`[announce-release] announce_release falló (${error.code ?? 'sin código'}).`)
    return jsonResponse({ error: 'No se pudo registrar el anuncio.' }, 500)
  }

  const result = (data ?? {}) as { already_announced?: boolean; recipients?: number }
  console.log(`[announce-release] versión ${version}: ${result.already_announced ? 'ya estaba anunciada' : `anunciada a ${result.recipients ?? 0} personas`}.`)
  return jsonResponse({
    ok: true,
    version,
    modules,
    already_announced: Boolean(result.already_announced),
    recipients: Number(result.recipients ?? 0),
  })
})
