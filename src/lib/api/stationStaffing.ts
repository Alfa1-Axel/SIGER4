import { supabase } from '../supabaseClient'
import type { StationStaffing } from '../../types/database'
import type { StaffingCounts } from '../staffing'

// Dotación actual del cuartel por categorías (0108). Todas estas consultas
// pasan por la RLS: cada rol recibe solo lo que puede ver, y solo puede
// guardar quien también carga el personal del cuartel (Informática, el
// Secretario Regional en su Regional, y Presidente, Jefe de Cuerpo Activo y
// usuario de carga en su cuartel). Quién y cuándo lo completa la base, y el
// total lo calcula la base: no se envían.

export async function fetchStationStaffing(stationId: string): Promise<StationStaffing | null> {
  const { data, error } = await supabase.from('station_staffing').select('*').eq('station_id', stationId).maybeSingle()
  if (error) throw error
  return (data as StationStaffing | null) ?? null
}

// Alta o actualización: una sola fila por cuartel.
export async function saveStationStaffing(stationId: string, counts: StaffingCounts): Promise<StationStaffing> {
  const { data, error } = await supabase
    .from('station_staffing')
    .upsert({ station_id: stationId, ...counts }, { onConflict: 'station_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as StationStaffing
}

// Dotación de varios cuarteles a la vez, para los reportes. Los cuarteles
// sin dotación cargada simplemente no tienen fila.
export async function fetchStaffingForStations(stationIds: string[]): Promise<StationStaffing[]> {
  if (stationIds.length === 0) return []
  const { data, error } = await supabase.from('station_staffing').select('*').in('station_id', stationIds)
  if (error) throw error
  return (data ?? []) as StationStaffing[]
}
