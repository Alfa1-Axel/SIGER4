import { supabase } from '../supabaseClient'

// register_my_push_subscription()/unregister_my_push_subscription()
// (migración 0088) reemplazan el upsert/delete directo desde el cliente:
// el navegador reutiliza el MISMO endpoint entre sesiones de distintos
// usuarios en el mismo dispositivo (comportamiento normal del PushManager,
// no algo que la app controle) -- un upsert/delete directo quedaba
// bloqueado en silencio por RLS (push_subscriptions_update_own/delete_own,
// que solo autorizan filas ya propias) cuando el endpoint pertenecía a
// OTRO perfil, dejándolo huérfano indefinidamente. Estas RPC resuelven el
// perfil desde current_profile_id() server-side (nunca un parámetro) y
// reasignan el endpoint sin pasar por esa restricción de RLS.
export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('La suscripción push del navegador no tiene los datos esperados.')
  }

  const { error } = await supabase.rpc('register_my_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh_key: json.keys.p256dh,
    p_auth_key: json.keys.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.rpc('unregister_my_push_subscription', { p_endpoint: endpoint })
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
//
// Devuelve tanto si existe la fila como a qué perfil pertenece hoy (no solo
// un booleano): distingue "activo para mi perfil" de "activo pero atado a
// otro perfil" (dispositivo compartido/sesión anterior, ver 0088) -- el
// segundo caso antes se mostraba como "Activo" sin serlo realmente.
export async function getPushSubscriptionOwner(endpoint: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_push_subscription_owner', { p_endpoint: endpoint })
  if (error) return null
  return (data as string | null) ?? null
}

export interface OwnPushDiagnosticRow {
  notification_id: string
  notification_title: string
  notification_created_at: string
  notification_scope: 'personal' | 'cuartel' | 'subsede' | 'region' | 'sin_alcance'
  push_attempted: boolean
  push_status: string | null
  push_sent_count: number | null
  push_recipients_count: number | null
  push_error_message: string | null
}

// Diagnostico de push del perfil actual (migracion 0086, ampliado en 0093)
// -- las ultimas notificaciones VISIBLES para el usuario (propias con
// profile_id puntual, o de scope territorial que puede ver -- antes solo
// mostraba las de profile_id puntual, lo que dejaba ciego el diagnostico
// para casi todas las notificaciones reales de modulos, que usan scope
// territorial) cruzadas contra push_send_log, para saber si el trigger
// server-side (dispatch_notification_push, 0085) efectivamente disparo/
// logro el push real de cada una. notification_scope indica de donde viene
// el alcance de cada fila.
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

export interface PushSubscriptionAdminDiagnosticRow {
  subscription_id: string
  profile_id: string
  profile_full_name: string
  endpoint_short: string
  user_agent: string | null
  updated_at: string
  created_at: string
}

// Diagnostico completo de push_subscriptions (migracion 0088) -- SOLO
// informatica_r4/integrante_informatica, la RPC ya lo exige server-side
// (where is_informatica_r4() or has_role('integrante_informatica')).
export async function fetchPushSubscriptionsAdminDiagnostics(): Promise<PushSubscriptionAdminDiagnosticRow[]> {
  const { data, error } = await supabase.rpc('get_push_subscriptions_admin_diagnostics')
  if (error) throw error
  return (data ?? []) as PushSubscriptionAdminDiagnosticRow[]
}

export interface PushSubscriptionCountByProfileRow {
  profile_id: string
  profile_full_name: string
  subscription_count: number
}

export async function fetchPushSubscriptionCountsByProfile(): Promise<PushSubscriptionCountByProfileRow[]> {
  const { data, error } = await supabase.rpc('get_push_subscription_counts_by_profile')
  if (error) throw error
  return (data ?? []) as PushSubscriptionCountByProfileRow[]
}

export interface PushInfraDiagnostics {
  project_url_configured: boolean
  cron_shared_secret_configured: boolean
  pg_net_installed: boolean
  recent_requests_count: number
  recent_responses_count: number | null
  recent_error_count: number | null
  last_response_status_code: number | null
  last_response_error: string | null
  last_response_body: string | null
  last_response_at: string | null
  last_response_is_historical: boolean | null
}

// Diagnostico consolidado de infraestructura de push (migracion 0089) --
// SOLO informatica_r4 (is_super_admin(), la RPC ya lo exige server-side).
// Distingue "falta config" de "pg_net no instalado" de "se llamó pero el
// servidor respondió con error" -- las tres causas de "push no intentado"
// que antes eran indistinguibles desde el diagnóstico por-notificación.
export async function fetchPushInfraDiagnostics(): Promise<PushInfraDiagnostics> {
  const { data, error } = await supabase.rpc('get_push_infra_diagnostics').single()
  if (error) throw error
  return data as PushInfraDiagnostics
}

export interface PushDispatcherAuthTestResult {
  project_url_configured: boolean
  cron_shared_secret_configured: boolean
  pg_net_installed: boolean
  request_sent: boolean
  http_status_code: number | null
  response_body: string | null
  diagnosis: string
}

// Prueba directa de autorización del dispatcher (migración 0090) -- llama a
// send-push-system con un notificationId inexistente (nunca manda un push
// real) para confirmar EN EL MOMENTO si system_settings.cron_shared_secret
// y el Edge Secret CRON_SHARED_SECRET están sincronizados, sin esperar al
// próximo insert en notifications. SOLO informatica_r4 (la RPC ya lo exige
// server-side).
export async function testPushDispatcherAuth(): Promise<PushDispatcherAuthTestResult> {
  const { data, error } = await supabase.rpc('test_push_dispatcher_auth').single()
  if (error) throw error
  return data as PushDispatcherAuthTestResult
}
