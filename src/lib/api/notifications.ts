import { supabase } from '../supabaseClient'
import type { Notification, NotificationType } from '../../types/database'

// RLS ya restringe el resultado a lo que el perfil actual puede ver (propias,
// o masivas de su region/subsede/cuartel); no hace falta filtrar en el cliente.
//
// limit sube de 20 (valor original, pensado solo para el dropdown de la
// campanita) a 100 por defecto: /notificaciones (NotificacionesPage) usa
// esta misma función para el LISTADO COMPLETO, y con 20 una notificación
// propia reciente podía quedar fuera de la ventana visible si el sistema
// generó 20+ notificaciones automáticas más nuevas en el medio (cursos,
// documentos, cambios de estado, recordatorios) -- bug real reportado:
// "algunas notificaciones ni siquiera aparecen en la app". El contador de
// no leídas del header YA NO usa esta función (ver fetchUnreadNotificationCount
// más abajo) -- antes también estaba limitado a las mismas 20 filas, así
// que subestimaba el conteo real si había más de 20 sin leer.
// Desde 0102 la bandeja se lee de la vista my_notifications: solo lo dirigido
// a quien mira (personales suyas y masivas de su alcance), con is_read
// resuelto para esa persona. Antes, una notificación masiva tenía un solo
// is_read compartido, y Informática veía también las personales de todos.
export const NOTIFICATIONS_CHANGED_EVENT = 'siger4:notifications-changed'

function emitNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}

export async function fetchNotificationsForProfile(_profileId: string, limit = 100): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('my_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Notification[]
}

// Conteo real de notificaciones no leídas (usa count exacto de Postgres, no
// trae filas) -- reemplaza el filter(!is_read).length sobre una página
// limitada que usaba el header antes, que subestimaba el conteo si había
// más no leídas que el límite de esa página.
export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('my_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

// Últimas no leídas, para el Inicio.
export async function fetchLatestUnreadNotifications(limit = 3): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('my_notifications')
    .select('*')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Notification[]
}

// Marca como leídas para quien llama (personales y masivas). Sin ids, todas.
export async function markNotificationsRead(ids: string[] | null): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids })
  if (error) throw error
  emitNotificationsChanged()
  return (data as number | null) ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  await markNotificationsRead([id])
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
