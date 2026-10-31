import { supabase } from '../supabaseClient'
import type { StationCompliance } from '../../types/database'

export async function fetchStationCompliance(): Promise<StationCompliance[]> {
  const { data, error } = await supabase.from('station_compliance').select('*').order('station_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as StationCompliance[]
}

export async function fetchStationComplianceById(stationId: string): Promise<StationCompliance | null> {
  const { data, error } = await supabase.from('station_compliance').select('*').eq('station_id', stationId).single()
  if (error) return null
  return data as StationCompliance
}

// Motivos legibles del estado del semáforo, en el mismo orden en que la
// vista los evalúa (críticos primero). "Datos actualizados" cuando no falta
// nada — nunca se devuelve una lista vacía sin explicación.
export function complianceReasons(c: StationCompliance): string[] {
  const reasons: string[] = []
  if (!c.has_contact_info) reasons.push('Falta el contacto institucional')
  if (!c.has_personnel) reasons.push('Faltan cargar los efectivos')
  if (!c.has_vehicles) reasons.push('Faltan cargar los móviles')
  if (!c.attendance_recent) reasons.push('Sin resumen de asistencia reciente')
  if (!c.interventions_recent) reasons.push('Sin resumen de intervenciones reciente')
  if (!c.has_documents) reasons.push('Sin documentos institucionales')
  if (reasons.length === 0) reasons.push('Datos actualizados')
  return reasons
}

export const COMPLIANCE_STATUS_LABEL: Record<StationCompliance['compliance_status'], string> = {
  verde: 'Al día',
  amarillo: 'Parcial',
  rojo: 'Desactualizado',
}

export const COMPLIANCE_STATUS_BADGE: Record<StationCompliance['compliance_status'], string> = {
  verde: 'badge-success',
  amarillo: 'badge-warning',
  rojo: 'badge-danger',
}
