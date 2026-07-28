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

export interface PushTriggerInput {
  title: string
  body?: string
  url?: string
  tag?: string
  profileId?: string | null
  regionId?: string | null
  subsedeId?: string | null
  stationId?: string | null
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
