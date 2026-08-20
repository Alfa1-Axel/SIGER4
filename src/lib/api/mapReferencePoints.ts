import { supabase } from '../supabaseClient'
import type { MapReferencePoint, MapReferencePointType } from '../../types/database'

// RLS (map_reference_points_select_scope, migración 0084) ya filtra a lo que
// el usuario puede ver -- informatica_r4 todo, puntos sin alcance definido
// visibles para cualquiera, puntos con alcance solo para quien coincide. No
// hace falta filtrar de nuevo acá.
export async function fetchMapReferencePoints(): Promise<MapReferencePoint[]> {
  const { data, error } = await supabase.from('map_reference_points').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as MapReferencePoint[]
}

export async function fetchMapReferencePointById(id: string): Promise<MapReferencePoint | null> {
  const { data, error } = await supabase.from('map_reference_points').select('*').eq('id', id).single()
  if (error) return null
  return data as MapReferencePoint
}

export interface MapReferencePointInput {
  name: string
  type: MapReferencePointType
  description?: string | null
  latitude: number
  longitude: number
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
  is_active?: boolean
}

export async function createMapReferencePoint(input: MapReferencePointInput): Promise<MapReferencePoint> {
  const { data, error } = await supabase.from('map_reference_points').insert(input).select('*').single()
  if (error) throw error
  return data as MapReferencePoint
}

export async function updateMapReferencePoint(id: string, input: Partial<MapReferencePointInput>): Promise<MapReferencePoint> {
  const { data, error } = await supabase.from('map_reference_points').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as MapReferencePoint
}

// Borrado físico: la RLS (map_reference_points_delete_admin) ya lo
// restringe a informatica_r4 -- si otro rol lo intenta, Postgres rechaza el
// delete y esto lanza. El resto de los roles con permiso de escritura usa
// updateMapReferencePoint(id, { is_active: false }) para "sacar de
// circulación" un punto sin perder el historial.
export async function deleteMapReferencePoint(id: string): Promise<void> {
  const { error } = await supabase.from('map_reference_points').delete().eq('id', id)
  if (error) throw error
}
