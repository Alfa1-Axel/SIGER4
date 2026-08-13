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
// migración 0077): dos pestañas del mismo usuario detectando la misma
// novedad al mismo tiempo nunca generan dos filas — la segunda inserción
// viola el índice único (profile_id, app_update_id) y Postgres responde
// 23505, que acá se trata como éxito silencioso (la notificación YA existe,
// que es exactamente lo que se buscaba), no como un error a mostrar.
export async function createAppUpdateNotification(profileId: string, appUpdateId: string, title: string): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    type: 'actualizacion_sistema',
    title,
    profile_id: profileId,
    app_update_id: appUpdateId,
  })
  if (error && error.code !== '23505') throw error
}
