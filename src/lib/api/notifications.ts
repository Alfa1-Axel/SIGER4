import { supabase } from '../supabaseClient'
import type { Notification } from '../../types/database'

export async function fetchNotificationsForProfile(profileId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`profile_id.eq.${profileId},profile_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Notification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}
