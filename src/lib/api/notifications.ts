import { supabase } from '../supabaseClient'
import type { Notification, NotificationType } from '../../types/database'

// RLS ya restringe el resultado a lo que el perfil actual puede ver (propias,
// o masivas de su region/subsede/cuartel); no hace falta filtrar en el cliente.
export async function fetchNotificationsForProfile(_profileId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Notification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export interface NotificationInput {
  type: NotificationType
  title: string
  body?: string | null
  profile_id?: string | null
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
}

export async function createNotification(input: NotificationInput): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      profile_id: input.profile_id ?? null,
      region_id: input.region_id ?? null,
      subsede_id: input.subsede_id ?? null,
      station_id: input.station_id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Notification
}

// Notificación interna de "hay una novedad nueva" (ver AppUpdateBanner.tsx).
// Deduplicación ATÓMICA a nivel de base (idx_notifications_app_update_dedup,
// migración 0077) vía upsert + ignoreDuplicates: true, que le pide a
// PostgREST "insert ... on conflict (profile_id, app_update_id) do nothing"
// (header Prefer: resolution=ignore-duplicates). Esto es deliberadamente
// distinto de un insert simple + catch(23505): un insert que choca con la
// constraint única responde HTTP 409, visible como error en la consola del
// navegador aunque el código lo trate bien -- con ignoreDuplicates,
// PostgREST responde 201 (sin filas) cuando ya existe, así que nunca hay un
// 409 que loguear en el caso esperado de "el usuario ya tiene esta
// notificación" (que es el caso normal después de la primera vez que este
// componente se monta, dado que corre en cada cambio de sesión/perfil).
// "do nothing" también es la razón de que sea seguro: nunca pisa is_read/
// read_at de una fila existente, porque si ya existe no la toca.
export async function createAppUpdateNotification(profileId: string, appUpdateId: string, title: string): Promise<void> {
  const { error } = await supabase.from('notifications').upsert(
    {
      type: 'actualizacion_sistema',
      title,
      profile_id: profileId,
      app_update_id: appUpdateId,
    },
    { onConflict: 'profile_id,app_update_id', ignoreDuplicates: true },
  )
  if (error) throw error
}
