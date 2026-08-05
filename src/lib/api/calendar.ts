import { supabase } from '../supabaseClient'
import type { CalendarEvent, CalendarEventStatus, CalendarEventType } from '../../types/database'

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.from('calendar_events').select('*').order('starts_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

export async function fetchCalendarEventById(id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase.from('calendar_events').select('*').eq('id', id).single()
  if (error) return null
  return data as CalendarEvent
}

// Próximos eventos visibles para el usuario (RLS ya filtra), sin contar
// cancelados — pensado para el dashboard ("próximos 5 eventos").
export async function fetchUpcomingCalendarEvents(limit = 5): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .neq('status', 'cancelado')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

export interface CalendarEventInput {
  title: string
  description?: string | null
  event_type: CalendarEventType
  starts_at: string
  ends_at?: string | null
  all_day?: boolean
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
  status?: CalendarEventStatus
  notify_on_create?: boolean
  notify_before_minutes?: number | null
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase.from('calendar_events').insert(input).select('*').single()
  if (error) throw error
  return data as CalendarEvent
}

export async function updateCalendarEvent(id: string, input: Partial<CalendarEventInput>): Promise<CalendarEvent> {
  const { data, error } = await supabase.from('calendar_events').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as CalendarEvent
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}
