// SIGER4 - Edge Function: send-push
//
// Envia una notificacion push real (Web Push API) a las suscripciones que
// coincidan con el alcance recibido (perfil especifico, o region/subsede/
// cuartel). El frontend la invoca inmediatamente despues de crear una fila en
// "notifications" (arquitectura elegida: el frontend dispara el push tras
// crear la notificacion en pantalla, no un trigger de base de datos) o desde
// NotificationPushBridge al recibir un insert por Realtime.
//
// Seguridad (revision 2026-07):
// - Requiere un usuario autenticado real (valida el JWT recibido).
// - VALIDA SERVER-SIDE que el usuario autenticado tiene permiso real sobre el
//   alcance pedido (profileId/regionId/subsedeId/stationId), llamando a
//   can_send_push_scope() con la clave anon + el JWT del usuario (no con
//   service_role) para que corra bajo su identidad real. Nunca confia en que
//   el frontend haya mostrado o no la UI de "enviar masivo".
// - Deduplica por notification_id: NotificationPushBridge se conecta desde
//   CADA navegador con una sesion abierta y dispara triggerPush() al ver el
//   mismo insert de Realtime, asi que la misma notificacion puede pedir el
//   mismo push muchas veces en paralelo. La deduplicacion es atomica (indice
//   unico parcial en push_send_log sobre notification_id where status='ok'):
//   el primer pedido que logra insertar su fila 'ok' es el que efectivamente
//   envia; el resto recibe "duplicate" y no reenvia nada.
// - Rate limit basico por actor: push_send_rate_check() (RPC bajo el JWT del
//   usuario) limita a 10 envios "ok" exitosos por minuto por actor, para
//   evitar abuso aunque el actor tenga permiso de alcance masivo.
// - La clave privada VAPID vive unicamente como secreto de esta funcion
//   (VAPID_PRIVATE_KEY), nunca en el frontend ni en el repositorio.
// - El payload enviado al navegador nunca incluye datos sensibles: solo
//   title/body/url/tag genericos (ver PushTriggerBody).
// - Las suscripciones a notificar se resuelven consultando push_subscriptions
//   con la service_role key (necesaria para leer entre distintos perfiles),
//   pero SOLO despues de que el alcance ya fue autorizado bajo la identidad
//   real del usuario.
// - Cada intento de envio (autorizado, rechazado, duplicado, rate-limited o
//   con error) queda registrado en push_send_log con service_role.
//
// Despliegue: ver la seccion "Notificaciones push" en DEPLOYMENT.md.
// Redeploy tras editar este archivo: `supabase functions deploy send-push`.

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
  notificationId?: string | null
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

  // Cliente "como el usuario": todas las llamadas hechas con este cliente
  // (incluidas las RPC de autorizacion/rate-limit y la lectura de profiles
  // mas abajo) corren bajo RLS con la identidad real del JWT recibido. Es
  // deliberado no usar service_role para esta parte.
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
  if (!body.notificationId) {
    return jsonResponse({ sent: 0, error: 'Falta notificationId (obligatorio para deduplicar el envío).' }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1) Autorizacion server-side del alcance pedido, bajo la identidad real
  //    del usuario (no confía en la UI que lo invocó).
  const { data: authorized, error: authzError } = await supabaseAsUser.rpc('can_send_push_scope', {
    p_profile_id: body.profileId ?? null,
    p_region_id: body.regionId ?? null,
    p_subsede_id: body.subsedeId ?? null,
    p_station_id: body.stationId ?? null,
  })
  if (authzError) return jsonResponse({ sent: 0, error: authzError.message }, 500)
  if (!authorized) {
    await supabaseAdmin.from('push_send_log').insert({
      notification_id: body.notificationId,
      profile_id: body.profileId ?? null,
      region_id: body.regionId ?? null,
      subsede_id: body.subsedeId ?? null,
      station_id: body.stationId ?? null,
      status: 'error',
      error_message: 'No autorizado para ese alcance.',
    })
    return jsonResponse({ sent: 0, error: 'No tenés permiso para enviar push a ese alcance.' }, 403)
  }

  // 2) Rate limit basico: maximo 10 envios exitosos por minuto por actor.
  const { data: withinLimit, error: rateError } = await supabaseAsUser.rpc('push_send_rate_check', {
    p_window_seconds: 60,
    p_max_sends: 10,
  })
  if (rateError) return jsonResponse({ sent: 0, error: rateError.message }, 500)
  if (!withinLimit) {
    await supabaseAdmin.from('push_send_log').insert({
      notification_id: body.notificationId,
      profile_id: body.profileId ?? null,
      region_id: body.regionId ?? null,
      subsede_id: body.subsedeId ?? null,
      station_id: body.stationId ?? null,
      status: 'rate_limited',
    })
    return jsonResponse({ sent: 0, error: 'Límite de envíos push alcanzado. Esperá un momento.' }, 429)
  }

  // Resuelve el profile_id del actor (para registrar quien pidio el envio).
  const { data: actorProfile } = await supabaseAsUser
    .from('profiles')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  // 3) Deduplicacion atomica: intenta reclamar esta notificacion insertando
  //    la fila 'ok' primero. Si otro pedido concurrente ya la reclamo, el
  //    indice unico parcial rechaza el insert (23505) y no se reenvia nada.
  const { data: logRow, error: claimError } = await supabaseAdmin
    .from('push_send_log')
    .insert({
      actor_profile_id: actorProfile?.id ?? null,
      notification_id: body.notificationId,
      profile_id: body.profileId ?? null,
      region_id: body.regionId ?? null,
      subsede_id: body.subsedeId ?? null,
      station_id: body.stationId ?? null,
      status: 'ok',
    })
    .select('id')
    .single()

  if (claimError) {
    if (claimError.code === '23505') {
      return jsonResponse({ sent: 0, duplicate: true })
    }
    return jsonResponse({ sent: 0, error: claimError.message }, 500)
  }

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
    if (profilesError) {
      await supabaseAdmin.from('push_send_log').update({ status: 'error', error_message: profilesError.message }).eq('id', logRow.id)
      return jsonResponse({ sent: 0, error: profilesError.message }, 500)
    }
    targetProfileIds = (profiles ?? []).map((p: { id: string }) => p.id)
  }

  if (!targetProfileIds.length) {
    await supabaseAdmin.from('push_send_log').update({ recipients_count: 0, sent_count: 0 }).eq('id', logRow.id)
    return jsonResponse({ sent: 0 })
  }

  const { data: subscriptions, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .in('profile_id', targetProfileIds)
  if (subsError) {
    await supabaseAdmin.from('push_send_log').update({ status: 'error', error_message: subsError.message }).eq('id', logRow.id)
    return jsonResponse({ sent: 0, error: subsError.message }, 500)
  }
  if (!subscriptions?.length) {
    await supabaseAdmin.from('push_send_log').update({ recipients_count: 0, sent_count: 0 }).eq('id', logRow.id)
    return jsonResponse({ sent: 0 })
  }

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

  await supabaseAdmin
    .from('push_send_log')
    .update({ recipients_count: subscriptions.length, sent_count: sent })
    .eq('id', logRow.id)

  return jsonResponse({ sent, removed: staleSubscriptionIds.length })
})
