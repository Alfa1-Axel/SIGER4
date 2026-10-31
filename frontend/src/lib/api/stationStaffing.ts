import { supabase } from '../supabaseClient'
import type { StationStaffing, StationStaffingHistory } from '../../types/database'
import type { StaffingCounts } from '../staffing'

// Efectivos del cuartel por categorías (0108, año y historial en 0109). Todas
// estas consultas pasan por la RLS: cada rol recibe solo lo que puede ver, y
// solo puede guardar quien también carga el personal del cuartel (Informática,
// el Secretario Regional en su Regional, y Presidente, Jefe de Cuerpo Activo y
// usuario de carga en su cuartel). Quién y cuándo lo completa la base, y el
// total lo calcula la base: no se envían. El historial lo escribe solo la
// base, cada vez que cambian las cantidades o el año.

export async function fetchStationStaffing(stationId: string): Promise<StationStaffing | null> {
  const { data, error } = await supabase.from('station_staffing').select('*').eq('station_id', stationId).maybeSingle()
  if (error) throw error
  return (data as StationStaffing | null) ?? null
}

// Alta o actualización: una sola fila por cuartel.
export async function saveStationStaffing(stationId: string, counts: StaffingCounts, referenceYear: number): Promise<StationStaffing> {
  const { data, error } = await supabase
    .from('station_staffing')
    .upsert({ station_id: stationId, ...counts, reference_year: referenceYear }, { onConflict: 'station_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as StationStaffing
}

// Efectivos de varios cuarteles a la vez, para los reportes. Los cuarteles
// sin efectivos cargados simplemente no tienen fila.
export async function fetchStaffingForStations(stationIds: string[]): Promise<StationStaffing[]> {
  if (stationIds.length === 0) return []
  const { data, error } = await supabase.from('station_staffing').select('*').in('station_id', stationIds)
  if (error) throw error
  return (data ?? []) as StationStaffing[]
}

// Últimas actualizaciones de los efectivos de un cuartel, de la más reciente
// a la más antigua.
export async function fetchStationStaffingHistory(stationId: string, limit = 6): Promise<StationStaffingHistory[]> {
  const { data, error } = await supabase
    .from('station_staffing_history')
    .select('*')
    .eq('station_id', stationId)
    .order('recorded_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StationStaffingHistory[]
}

// Los efectivos de un cuartel en un momento dado: los actuales o los que
// valían a una fecha (la última foto del historial hasta el fin de ese día).
export interface StaffingSnapshot extends StaffingCounts {
  total: number
  reference_year: number
  // Cuándo se cargaron esas cantidades.
  recorded_at: string
  recorded_by_name: string | null
}

function endOfDayIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString()
}

// Con asOf (AAAA-MM-DD) devuelve la foto vigente a esa fecha; sin asOf, la
// actual. Un cuartel sin efectivos cargados a esa fecha no aparece en el
// resultado: el reporte dice "sin efectivos cargados" en vez de mostrar los de
// hoy como si fueran de entonces.
export async function fetchStaffingAsOf(stationIds: string[], asOf: string | null): Promise<Map<string, StaffingSnapshot>> {
  const result = new Map<string, StaffingSnapshot>()
  if (stationIds.length === 0) return result

  if (!asOf) {
    const rows = await fetchStaffingForStations(stationIds)
    for (const row of rows) {
      result.set(row.station_id, { ...row, recorded_at: row.updated_at, recorded_by_name: row.updated_by_name })
    }
    return result
  }

  const { data, error } = await supabase
    .from('station_staffing_history')
    .select('*')
    .in('station_id', stationIds)
    .lte('recorded_at', endOfDayIso(asOf))
    .order('recorded_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  for (const row of (data ?? []) as StationStaffingHistory[]) {
    if (!result.has(row.station_id)) result.set(row.station_id, row)
  }
  return result
}
