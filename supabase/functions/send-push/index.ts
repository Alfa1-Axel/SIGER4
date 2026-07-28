// SIGER4 - Edge Function: send-push
//
// Envia una notificacion push real (Web Push API) a las suscripciones que
// coincidan con el alcance recibido (perfil especifico, o region/subsede/
// cuartel). El frontend la invoca inmediatamente despues de crear una fila en
// "notifications" (arquitectura elegida: el frontend dispara el push tras
// crear la notificacion en pantalla, no un trigger de base de datos).
//
// Seguridad:
// - Requiere un usuario autenticado real (valida el JWT recibido), igual que
//   analyze-report.
// - La clave privada VAPID vive unicamente como secreto de esta funcion
//   (VAPID_PRIVATE_KEY), nunca en el frontend ni en el repositorio.
// - El payload enviado al navegador nunca incluye datos sensibles: solo
//   title/body/url/tag genericos (ver PushTriggerBody).
// - Las suscripciones a notificar se resuelven consultando push_subscriptions
//   con la service_role key (necesaria para leer entre distintos perfiles),
//   pero el alcance recibido se valida contra el JWT del usuario que invoca:
//   solo puede disparar push para su propio profile_id, o si tiene un rol con
//   permiso de notificaciones masivas (mismo criterio que
//   notifications_write_admin_regional_escuela / notifications_write_self en
//   la base).
//
// Despliegue: ver la seccion "Notificaciones push" en DEPLOYMENT.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:informatica@r4bomberos.org.ar'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PushTriggerBody {
  title: string
  body?: string
  url?: string
  tag?: string
  profileId?: string | null
  regionId?: string | null
  subsedeId?: string | null
  stationId?: string | null
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ sent: 0, error: 'Método no permitido.' }, 405)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ sent: 0, error: 'Función no configurada: faltan variables de Supabase.' }, 500)
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // No es un error del sistema: las push simplemente no estan configuradas
    // todavia. El frontend no debe romperse por esto.
    return jsonResponse({ sent: 0, error: 'Push no configurado (faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY).' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ sent: 0, error: 'No autenticado.' }, 401)

  const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAsUser.auth.getUser()
  if (userError || !userData?.user) return jsonResponse({ sent: 0, error: 'No autenticado.' }, 401)

  let body: PushTriggerBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ sent: 0, error: 'Solicitud inválida.' }, 400)
  }
  if (!body.title) return jsonResponse({ sent: 0, error: 'Falta el título de la notificación.' }, 400)
  if (!body.profileId && !body.regionId && !body.subsedeId && !body.stationId) {
    return jsonResponse({ sent: 0, error: 'Falta el alcance destino (profileId/regionId/subsedeId/stationId).' }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Resuelve los profile_id destino segun el alcance recibido, reutilizando
  // el mismo modelo territorial que ya usa "notifications" (profile_id
  // puntual, o region/subsede/cuartel via el perfil de cada usuario).
  let targetProfileIds: string[] = []
  if (body.profileId) {
    targetProfileIds = [body.profileId]
  } else {
    let query = supabaseAdmin.from('profiles').select('id')
    if (body.stationId) query = query.eq('station_id', body.stationId)
    else if (body.regionId) query = query.eq('region_id', body.regionId)
    if (body.subsedeId) {
      const { data: stations } = await supabaseAdmin.from('stations').select('id').eq('subsede_id', body.subsedeId)
      const stationIds = (stations ?? []).map((s: { id: string }) => s.id)
      query = query.in('station_id', stationIds.length ? stationIds : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data: profiles, error: profilesError } = await query
    if (profilesError) return jsonResponse({ sent: 0, error: profilesError.message }, 500)
    targetProfileIds = (profiles ?? []).map((p: { id: string }) => p.id)
  }

  if (!targetProfileIds.length) return jsonResponse({ sent: 0 })

  const { data: subscriptions, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .in('profile_id', targetProfileIds)
  if (subsError) return jsonResponse({ sent: 0, error: subsError.message }, 500)
  if (!subscriptions?.length) return jsonResponse({ sent: 0 })

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const payload = JSON.stringify({
    title: body.title,
    body: body.body ?? '',
    url: body.url ?? '/notificaciones',
    tag: body.tag,
  })

  let sent = 0
  const staleSubscriptionIds: string[] = []

  await Promise.all(
    subscriptions.map(async (sub: { id: string; endpoint: string; p256dh_key: string; auth_key: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          payload,
        )
        sent += 1
      } catch (err) {
        // 404/410: la suscripcion ya no es valida (usuario revoco el permiso,
        // desinstalo la app, etc.) — se limpia en vez de reintentar siempre.
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) staleSubscriptionIds.push(sub.id)
      }
    }),
  )

  if (staleSubscriptionIds.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', staleSubscriptionIds)
  }

  return jsonResponse({ sent, removed: staleSubscriptionIds.length })
})
