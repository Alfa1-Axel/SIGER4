import { supabase } from '../supabaseClient'
import type { StationHistoryCategory, StationHistoryEvent } from '../../types/database'

export async function fetchStationHistoryEvents(stationId: string): Promise<StationHistoryEvent[]> {
  const { data, error } = await supabase
    .from('station_history_events')
    .select('*')
    .eq('station_id', stationId)
    .order('event_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as StationHistoryEvent[]
}

export async function fetchStationHistoryEventById(id: string): Promise<StationHistoryEvent | null> {
  const { data, error } = await supabase.from('station_history_events').select('*').eq('id', id).single()
  if (error) return null
  return data as StationHistoryEvent
}

export interface StationHistoryEventInput {
  station_id: string
  title: string
  description?: string | null
  event_date: string
  category: StationHistoryCategory
  is_highlighted?: boolean
}

export async function createStationHistoryEvent(input: StationHistoryEventInput): Promise<StationHistoryEvent> {
  const { data, error } = await supabase.from('station_history_events').insert(input).select('*').single()
  if (error) throw error
  return data as StationHistoryEvent
}

export async function updateStationHistoryEvent(id: string, input: Partial<StationHistoryEventInput>): Promise<StationHistoryEvent> {
  const { data, error } = await supabase.from('station_history_events').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as StationHistoryEvent
}

export async function deleteStationHistoryEvent(id: string): Promise<void> {
  const { error } = await supabase.from('station_history_events').delete().eq('id', id)
  if (error) throw error
}
