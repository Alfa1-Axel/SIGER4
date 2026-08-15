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
//
// Historial de este helper (para no repetir los mismos dos intentos
// fallidos): primero un insert simple + catch(23505) -- el navegador loguea
// igual la petición como 409 en Network aunque el código trate el error
// bien. Después un upsert con { onConflict: 'profile_id,app_update_id',
// ignoreDuplicates: true } -- PostgREST responde 400 Bad Request, porque el
// índice de deduplicación (idx_notifications_app_update_dedup, migración
// 0077) es un índice único PARCIAL ("where app_update_id is not null"), y
// PostgREST no puede traducir on_conflict a un índice parcial (limitación
// de la capa REST, no de Postgres). Solución final: la lógica de insert +
// "on conflict ... where ... do nothing" se mueve a una RPC de Postgres
// (ensure_app_update_notification, migración 0079), que sí soporta el
// conflict target parcial porque es SQL plano ejecutado server-side, no
// algo que PostgREST tenga que inferir. profile_id se resuelve ahí adentro
// desde current_profile_id() (nunca un parámetro), así que no hace falta
// pasarlo acá.
//
// La RPC nunca pisa is_read/read_at de una notificación existente ("do
// nothing" no ejecuta ningún update), y nunca lanza excepción si el usuario
// no tiene perfil activo -- devuelve created=false sin insertar.
export async function createAppUpdateNotification(appUpdateId: string, title: string): Promise<void> {
  const { error } = await supabase.rpc('ensure_app_update_notification', {
    p_app_update_id: appUpdateId,
    p_title: title,
  })
  if (error) throw error
}
