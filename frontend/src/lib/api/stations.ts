import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type { Profile, Station, StationAuthorityBasic, StationBasic } from '../../types/database'
import type { RoleKey } from '../../types/roles'

export async function fetchStations(): Promise<Station[]> {
  const { data, error } = await supabase.from('stations').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Station[]
}

// Ficha institucional básica de TODOS los cuarteles, para cualquier usuario activo (0119). No es lo
// mismo que fetchStations(): esa lee la tabla y la RLS la limita al alcance de cada persona; esta
// devuelve solo columnas institucionales. Quien tiene acceso interno sigue usando fetchStations().
export async function fetchStationBasicDirectory(): Promise<StationBasic[]> {
  const { data, error } = await supabase.rpc('list_station_directory')
  if (error) throw error
  return (data ?? []) as StationBasic[]
}

// Autoridades de un cuartel (nombre y cargo), para la ficha básica.
export async function fetchStationBasicAuthorities(stationId: string): Promise<StationAuthorityBasic[]> {
  const { data, error } = await supabase.rpc('station_directory_authorities', { p_station_id: stationId })
  if (error) throw error
  return (data ?? []) as StationAuthorityBasic[]
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
  whatsapp_phone?: string | null
  email?: string | null
  social_media?: Record<string, string> | null
  description?: string | null
  status?: Station['status']
  region_id: string
  subsede_id: string
  cover_image_url?: string | null
  logo_url?: string | null
  founded_year?: number | null
  latitude?: number | null
  longitude?: number | null
  map_notes?: string | null
}

export async function createStation(input: StationInput): Promise<Station> {
  const { data, error } = await supabase.from('stations').insert(input).select('*').single()
  if (error) throw error
  return data as Station
}

export async function updateStation(id: string, input: Partial<StationInput>, expectedVersion?: number | null): Promise<Station> {
  return updateVersioned<Station>('stations', id, input, expectedVersion)
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
