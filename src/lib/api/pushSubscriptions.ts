import { supabase } from '../supabaseClient'

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

export interface OwnPushDiagnosticRow {
  notification_id: string
  notification_title: string
  notification_created_at: string
  push_attempted: boolean
  push_status: string | null
  push_sent_count: number | null
  push_recipients_count: number | null
  push_error_message: string | null
}

// Diagnostico de push del perfil actual (migracion 0086) -- las ultimas
// notificaciones propias cruzadas contra push_send_log, para saber si el
// trigger server-side (dispatch_notification_push, 0085) efectivamente
// disparo/logro el push real de cada una.
export async function fetchOwnPushDiagnostics(limit = 10): Promise<OwnPushDiagnosticRow[]> {
  const { data, error } = await supabase.rpc('get_own_push_diagnostics', { p_limit: limit })
  if (error) throw error
  return (data ?? []) as OwnPushDiagnosticRow[]
}

// Cantidad de dispositivos/navegadores con suscripcion push activa del
// perfil actual (migracion 0086).
export async function fetchOwnPushSubscriptionCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_own_push_subscription_count')
  if (error) throw error
  return (data as number) ?? 0
}
