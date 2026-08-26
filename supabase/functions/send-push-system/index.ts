// SIGER4 - Edge Function: send-push-system
//
// Dispatcher server-side de push real (Web Push, funciona con la PWA
// cerrada) para TODA la tabla notifications -- no solo el recordatorio
// semanal. Desde la migración 0085, un trigger AFTER INSERT ON notifications
// (dispatch_notification_push()) llama a esta función por cada notificación
// nueva del sistema, sin importar su origen (trigger de Postgres, cron, o un
// insert directo del frontend), mandando SOLO notificationId.
//
// Revisión 2026-08 (endurecido): la versión anterior leía el alcance
// (profileId/regionId/subsedeId/stationId) directo del PAYLOAD que mandaba
// el llamador -- un guard temprano rechazaba con 400 el caso "los 4 campos
// vacíos", así que el branch de resolución de destinatarios sin ningún
// filtro (heredado de send-push, migración 0025) no debería haberse
// alcanzado nunca en la práctica, pero el diseño era frágil: dependía
// enteramente de que ese guard nunca cambiara, y confiaba en lo que el
// llamador (el trigger SQL) le pasara en vez de la fila real. Bug real
// confirmado en el camino: notificaciones de calendar_events tipo
// escuela/capacitación (sin ningún alcance por diseño, ver 0087) hacían que
// esta función devolviera 400 y el push real nunca salía para ellas.
// Ahora esta función IGNORA cualquier alcance que le llegue por payload:
// lee la fila real de notifications por notificationId (con service_role,
// la única fuente de verdad) y resuelve el alcance desde ahí, con
// prioridad estricta profile_id > station_id > subsede_id > region_id
// (nunca más de un nivel a la vez, nunca "sin alcance = todos" como
// fallback) -- ver migración 0087 para el detalle completo y el
// endurecimiento del constraint de notifications.
//
// Seguridad:
// - NO acepta JWT de usuario. En su lugar exige el header
//   "x-cron-secret" con el valor del secreto CRON_SHARED_SECRET
//   (configurado como secreto de esta función, nunca en el frontend, nunca
//   en el repositorio). La comparación aplica trim() a ambos lados
//   (revisión 2026-08: un 401 recurrente resultó ser whitespace invisible
//   en uno de los dos valores, nunca un mismatch de contrato -- el header
//   y el nombre del secreto siempre fueron los mismos en SQL y acá). Sin
//   ese header, o si no coincide tras el trim(), 401 inmediato. No hace falta
//   autorización de alcance estilo can_send_push_scope() (como sí tiene
//   send-push): quien puede invocar esto ya demostró conocer el secreto
//   server-side, no es un usuario con sesión que podría intentar abusar del
//   alcance -- y de cualquier forma el alcance ya no se confía al payload.
// - Mismo mecanismo de deduplicación por notification_id que send-push
//   (índice único parcial en push_send_log), así que si pg_cron/pg_net
//   reintenta la llamada (timeout, error transitorio) nunca se manda el
//   mismo push dos veces.
// - Mismo VAPID/push_subscriptions que send-push; no duplica secretos.
//
// Despliegue: `supabase functions deploy send-push-system`.
// Requiere el secreto CRON_SHARED_SECRET (ver DEPLOYMENT.md, sección
// "Notificaciones push", para el comando exacto de `supabase secrets set`).

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
  // El unico dato que hace falta del llamador: todo lo demas (title/body/
  // alcance) se lee de la fila real de notifications, nunca del payload.
  notificationId: string
}

interface NotificationRow {
  id: string
  title: string
  body: string | null
  type: string
  profile_id: string | null
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
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

  // trim() en ambos lados de la comparacion: el valor de system_settings ya
  // se guarda con trim() (SystemSettingsSection.tsx), pero el Edge Secret
  // CRON_SHARED_SECRET se setea vía `supabase secrets set` fuera de esta
  // app -- un salto de linea o espacio pegado por error ahi (por ejemplo al
  // copiar desde un archivo .env con newline final) rompe la comparacion
  // estricta sin dejar ninguna pista visible. Mismo trim() del lado SQL
  // (dispatch_notification_push, migracion 0090) para que ninguno de los
  // dos lados pueda desincronizarse por whitespace invisible.
  const providedSecret = req.headers.get('x-cron-secret')?.trim()
  const expectedSecret = CRON_SHARED_SECRET.trim()
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ sent: 0, error: 'No autorizado.' }, 401)
  }

  let body: PushTriggerBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ sent: 0, error: 'Solicitud inválida.' }, 400)
  }
  if (!body.notificationId) return jsonResponse({ sent: 0, error: 'Falta notificationId.' }, 400)

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fuente de verdad del alcance: la fila REAL en notifications, nunca lo
  // que haya mandado el llamador -- ver comentario de cabecera (bug de
  // broadcast corregido).
  const { data: notification, error: notificationError } = await supabaseAdmin
    .from('notifications')
    .select('id, title, body, type, profile_id, region_id, subsede_id, station_id')
    .eq('id', body.notificationId)
    .maybeSingle<NotificationRow>()
  if (notificationError) return jsonResponse({ sent: 0, error: notificationError.message }, 500)
  if (!notification) return jsonResponse({ sent: 0, error: 'La notificación no existe.' }, 404)

  // Deduplicacion atomica: mismo mecanismo que send-push (indice unico
  // parcial en push_send_log sobre notification_id where status='ok').
  const { data: logRow, error: claimError } = await supabaseAdmin
    .from('push_send_log')
    .insert({
      actor_profile_id: null,
      notification_id: notification.id,
      profile_id: notification.profile_id,
      region_id: notification.region_id,
      subsede_id: notification.subsede_id,
      station_id: notification.station_id,
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

  // Resuelve destinatarios con PRIORIDAD ESTRICTA, un solo nivel a la vez,
  // nunca "sin alcance = todos": profile_id puntual gana sobre cualquier
  // territorio (aunque la fila tuviera ambos seteados a la vez -- el
  // constraint de 0032 no lo prohibía antes de esta ronda); si no hay
  // profile_id, station_id > subsede_id > region_id, del más específico al
  // menos específico; si ninguno de los cuatro está seteado, NO se envía
  // nada (una notificación "sin alcance" es una referencia general visible
  // en la campanita, pero eso nunca implica push masivo automático).
  // is_active=true en las 3 ramas territoriales: un perfil dado de baja no
  // debe seguir recibiendo push reales aunque su fila siga en profiles (el
  // camino profile_id puntual de arriba SÍ puede mandarle a un perfil
  // inactivo a propósito -- ej. un aviso final -- por eso no se filtra ahí).
  let targetProfileIds: string[] = []
  if (notification.profile_id) {
    targetProfileIds = [notification.profile_id]
  } else if (notification.station_id) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('station_id', notification.station_id)
      .eq('is_active', true)
    if (profilesError) {
      await supabaseAdmin.from('push_send_log').update({ status: 'error', error_message: profilesError.message }).eq('id', logRow.id)
      return jsonResponse({ sent: 0, error: profilesError.message }, 500)
    }
    targetProfileIds = (profiles ?? []).map((p: { id: string }) => p.id)
  } else if (notification.subsede_id) {
    const { data: stations } = await supabaseAdmin.from('stations').select('id').eq('subsede_id', notification.subsede_id)
    const stationIds = (stations ?? []).map((s: { id: string }) => s.id)
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('station_id', stationIds.length ? stationIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('is_active', true)
    if (profilesError) {
      await supabaseAdmin.from('push_send_log').update({ status: 'error', error_message: profilesError.message }).eq('id', logRow.id)
      return jsonResponse({ sent: 0, error: profilesError.message }, 500)
    }
    targetProfileIds = (profiles ?? []).map((p: { id: string }) => p.id)
  } else if (notification.region_id) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('region_id', notification.region_id)
      .eq('is_active', true)
    if (profilesError) {
      await supabaseAdmin.from('push_send_log').update({ status: 'error', error_message: profilesError.message }).eq('id', logRow.id)
      return jsonResponse({ sent: 0, error: profilesError.message }, 500)
    }
    targetProfileIds = (profiles ?? []).map((p: { id: string }) => p.id)
  } else {
    // Notificación sin ningún alcance: nunca se interpreta como broadcast.
    // Se registra con error_message explícito para que el diagnóstico de
    // Ajustes distinga esto de "no había suscripciones" (recipients_count 0
    // por falta de suscripciones) o de un error real.
    await supabaseAdmin
      .from('push_send_log')
      .update({ status: 'error', error_message: 'Notificación sin alcance push válido (sin profile_id/station_id/subsede_id/region_id) -- no se envía broadcast.', recipients_count: 0, sent_count: 0 })
      .eq('id', logRow.id)
    return jsonResponse({ sent: 0, error: 'Notificación sin alcance push válido.' })
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
    title: notification.title,
    body: notification.body ?? '',
    url: '/notificaciones',
    tag: notification.type,
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
