import { supabase } from '../supabaseClient'
import type { Station } from '../../types/database'

export async function fetchStations(): Promise<Station[]> {
  const { data, error } = await supabase.from('stations').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Station[]
}

export async function fetchStationById(id: string): Promise<Station | null> {
  const { data, error } = await supabase.from('stations').select('*').eq('id', id).single()
  if (error) return null
  return data as Station
}

export interface StationInput {
  name: string
  code: string
  address?: string | null
  zone?: string | null
  phone?: string | null
  email?: string | null
  social_media?: Record<string, string> | null
  description?: string | null
  status?: Station['status']
  region_id: string
  subsede_id: string
  cover_image_url?: string | null
  logo_url?: string | null
}

export async function createStation(input: StationInput): Promise<Station> {
  const { data, error } = await supabase.from('stations').insert(input).select('*').single()
  if (error) throw error
  return data as Station
}

export async function updateStation(id: string, input: Partial<StationInput>): Promise<Station> {
  const { data, error } = await supabase.from('stations').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Station
}
