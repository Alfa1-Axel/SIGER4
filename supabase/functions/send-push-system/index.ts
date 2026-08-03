// SIGER4 - Edge Function: send-push-system
//
// Variante de send-push para eventos generados por el propio sistema (hoy:
// el recordatorio institucional semanal via pg_cron, ver
// 0036_weekly_reminder_cron.sql), donde no existe un usuario real con sesión
// que pueda autorizar el pedido con can_send_push_scope().
//
// Seguridad:
// - NO acepta JWT de usuario. En su lugar exige el header
//   "x-cron-secret" con el valor exacto del secreto CRON_SHARED_SECRET
//   (configurado como secreto de esta función, nunca en el frontend, nunca
//   en el repositorio). Sin ese header exacto, 401 inmediato.
// - Solo acepta profileId puntual (nunca alcance masivo region/subsede/
//   station): el recordatorio semanal siempre es 1 push por perfil que ya
//   tiene su propia fila en notifications (self-scope). Si en el futuro hace
//   falta alcance masivo desde el sistema, hay que sumar autorización
//   explícita para ese caso, no relajar esta función.
// - Mismo mecanismo de deduplicación por notification_id que send-push
//   (índice único parcial en push_send_log), así que si pg_cron reintenta la
//   llamada (timeout, error transitorio) nunca se manda el mismo push dos
//   veces.
// - Mismo VAPID/push_subscriptions que send-push; no duplica secretos.
//
// Despliegue: `supabase functions deploy send-push-system`.
// Requiere el secreto CRON_SHARED_SECRET (ver DEPLOYMENT.md, sección del
// recordatorio semanal, para el comando exacto de `supabase secrets set`).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:informatica@r4bomberos.org.ar'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-cron-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PushTriggerBody {
  title: string
  body?: string
  url?: string
  tag?: string
  profileId: string
  notificationId: string
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SHARED_SECRET) {
    return jsonResponse({ sent: 0, error: 'Función no configurada: falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/CRON_SHARED_SECRET.' }, 500)
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ sent: 0, error: 'Push no configurado (faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY).' })
  }

  const providedSecret = req.headers.get('x-cron-secret')
  if (!providedSecret || providedSecret !== CRON_SHARED_SECRET) {
    return jsonResponse({ sent: 0, error: 'No autorizado.' }, 401)
  }

  let body: PushTriggerBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ sent: 0, error: 'Solicitud inválida.' }, 400)
  }
  if (!body.title) return jsonResponse({ sent: 0, error: 'Falta el título de la notificación.' }, 400)
  if (!body.profileId) return jsonResponse({ sent: 0, error: 'Falta profileId.' }, 400)
  if (!body.notificationId) return jsonResponse({ sent: 0, error: 'Falta notificationId.' }, 400)

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Deduplicacion atomica: mismo mecanismo que send-push (indice unico
  // parcial en push_send_log sobre notification_id where status='ok').
  const { data: logRow, error: claimError } = await supabaseAdmin
    .from('push_send_log')
    .insert({
      actor_profile_id: null,
      notification_id: body.notificationId,
      profile_id: body.profileId,
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

  const { data: subscriptions, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('profile_id', body.profileId)
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
