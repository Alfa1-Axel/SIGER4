import { supabase } from '../supabaseClient'
import type { Vehicle, VehicleStatus } from '../../types/database'

export async function fetchVehiclesByStation(stationId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('station_id', stationId)
    .order('internal_code', { ascending: true })
  if (error) throw error
  return (data ?? []) as Vehicle[]
}

export async function fetchVehicleById(id: string): Promise<Vehicle | null> {
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single()
  if (error) return null
  return data as Vehicle
}

export interface VehicleInput {
  station_id: string
  internal_code: string
  vehicle_type: string
  status?: VehicleStatus
  plate?: string | null
  water_capacity_liters?: number | null
  crew_capacity?: number | null
  observations?: string | null
  last_service_at?: string | null
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase.from('vehicles').insert(input).select('*').single()
  if (error) throw error
  return data as Vehicle
}

export async function updateVehicle(id: string, input: Partial<VehicleInput>): Promise<Vehicle> {
  const { data, error } = await supabase.from('vehicles').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Vehicle
}
