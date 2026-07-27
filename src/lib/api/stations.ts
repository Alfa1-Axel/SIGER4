import { supabase } from '../supabaseClient'
import type { Profile, Station } from '../../types/database'
import type { RoleKey } from '../../types/roles'

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

const STATION_AUTHORITY_ROLES: RoleKey[] = ['presidente_cuartel', 'jefe_cuerpo_activo', 'secretario_comision']

// Perfiles del cuartel con roles de autoridad (presidente, jefe de cuerpo
// activo, secretario de comisión), para mostrar en "Autoridades y Contacto".
export async function fetchStationAuthorities(stationId: string): Promise<{ profile: Profile; role: RoleKey }[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, profiles!inner(*)')
    .in('role', STATION_AUTHORITY_ROLES)
    .eq('profiles.station_id', stationId)
  if (error) throw error

  return ((data ?? []) as unknown as { role: RoleKey; profiles: Profile }[]).map((row) => ({
    profile: row.profiles,
    role: row.role,
  }))
}
