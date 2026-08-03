import { supabase } from '../supabaseClient'
import type { Vehicle, VehicleStatus, VehicleStatusHistory } from '../../types/database'

// Estados que sacan al vehiculo de la flota activa del cuartel (no cuentan
// en vehicles_count, requieren motivo obligatorio via changeVehicleStatus).
export const DECOMMISSION_STATUSES: VehicleStatus[] = ['vendido', 'transferido', 'baja']

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

// Unico camino soportado para pasar un vehiculo a vendido/transferido/baja:
// exige un motivo (la base tambien lo exige — esto es solo para dar el error
// antes de llamar). Usa la RPC change_vehicle_status, que ademas registra el
// historial y agrega el motivo a observations (ver 0038_vehicle_lifecycle_history.sql).
export async function changeVehicleStatus(vehicleId: string, newStatus: VehicleStatus, reason: string): Promise<Vehicle> {
  if (!reason.trim()) throw new Error('El motivo es obligatorio.')
  const { data, error } = await supabase.rpc('change_vehicle_status', {
    p_vehicle_id: vehicleId,
    p_new_status: newStatus,
    p_reason: reason.trim(),
  })
  if (error) throw error
  return data as Vehicle
}

export async function fetchVehicleStatusHistory(vehicleId: string): Promise<VehicleStatusHistory[]> {
  const { data, error } = await supabase
    .from('vehicle_status_history')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as VehicleStatusHistory[]
}
