import { supabase } from '../supabaseClient'
import { describeSupabaseError } from './errors'

export async function savePushSubscription(
  profileId: string,
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('La suscripción push del navegador no tiene los datos esperados.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: json.endpoint,
      p256dh_key: json.keys.p256dh,
      auth_key: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// El navegador puede seguir devolviendo una PushSubscription local (via
// getSubscription()) aunque la fila correspondiente en push_subscriptions ya
// no exista — por ejemplo, si send-push la borró porque el endpoint quedó
// invalido (404/410, ver supabase/functions/send-push/index.ts), o si el
// usuario reinstaló la PWA en otro momento y la fila vieja de un endpoint
// distinto quedó huérfana. En ese caso "activar push" en la UI mostraría
// como suscripto un dispositivo que en realidad no va a recibir nada. Se usa
// para diagnóstico real en Ajustes, no solo el estado local del navegador.
export async function hasActiveSubscriptionRow(endpoint: string): Promise<boolean> {
  const { data, error } = await supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
  if (error) return false
  return Boolean(data)
}

export interface PushTriggerInput {
  title: string
  body?: string
  url?: string
  tag?: string
  profileId?: string | null
  regionId?: string | null
  subsedeId?: string | null
  stationId?: string | null
  // Id de la fila en "notifications" que origina este push. Obligatorio en la
  // practica: send-push lo usa para deduplicar server-side (si varias
  // pestañas/navegadores disparan el mismo push por la misma notificacion,
  // solo el primer pedido efectivamente envia).
  notificationId: string
}

// Dispara el envío del push real via la Edge Function send-push. Se llama
// siempre inmediatamente después de crear la notificación interna
// correspondiente (arquitectura elegida: frontend-driven, no trigger de DB).
// Nunca debe romper el flujo que la llama si el push falla o no está
// configurado — las notificaciones internas ya quedaron guardadas antes.
export async function triggerPush(input: PushTriggerInput): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: input })
  } catch {
    // Silencioso a propósito: el push es una mejora sobre las notificaciones
    // internas, no un requisito para que estas funcionen.
  }
}

export interface PushTriggerDiagnosticResult {
  ok: boolean
  sent: number
  duplicate: boolean
  error?: string
}

// Variante de triggerPush que SI devuelve el resultado real, en vez de
// tragarse cualquier error — usada únicamente por el botón "Probar
// notificación" de Ajustes, donde el usuario necesita saber explícitamente
// si el push se intentó enviar y cuántos dispositivos lo recibieron, para
// distinguir "la notificación interna funciona pero el push real no se está
// enviando/llegando" del caso en que todo funciona. "duplicate: true" pasa
// cuando NotificationPushBridge (que escucha el mismo insert por Realtime)
// ya reclamó el envío primero — no es un fallo, send-push dedupea a
// propósito (ver push_send_log, índice único parcial por notification_id).
export async function triggerPushDiagnostic(input: PushTriggerInput): Promise<PushTriggerDiagnosticResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{ sent?: number; error?: string; duplicate?: boolean }>('send-push', {
      body: input,
    })
    if (error) return { ok: false, sent: 0, duplicate: false, error: error.message }
    if (data?.error) return { ok: false, sent: 0, duplicate: false, error: data.error }
    if (data?.duplicate) return { ok: true, sent: 0, duplicate: true }
    return { ok: true, sent: data?.sent ?? 0, duplicate: false }
  } catch (err) {
    return { ok: false, sent: 0, duplicate: false, error: describeSupabaseError(err, 'Error desconocido al invocar send-push.') }
  }
}
