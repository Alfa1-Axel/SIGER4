import { supabase } from '../supabaseClient'
import type { AttendanceSummary } from '../../types/database'

export async function fetchAttendanceByStation(stationId: string): Promise<AttendanceSummary[]> {
  const { data, error } = await supabase
    .from('attendance_summaries')
    .select('*')
    .eq('station_id', stationId)
    .order('period_start', { ascending: false })
  if (error) throw error
  return (data ?? []) as AttendanceSummary[]
}

export async function fetchAttendanceSummaryById(id: string): Promise<AttendanceSummary | null> {
  const { data, error } = await supabase.from('attendance_summaries').select('*').eq('id', id).single()
  if (error) return null
  return data as AttendanceSummary
}

// La dotación (total_members) la completa la base con el personal activo del
// cuartel y el promedio de presentes ya no se carga (0104): la pantalla solo
// manda el período, la tasa y las observaciones.
export interface AttendanceSummaryInput {
  station_id: string
  period_start: string
  period_end: string
  attendance_rate: number
  observations: string | null
}

export async function createAttendanceSummary(input: AttendanceSummaryInput): Promise<AttendanceSummary> {
  const { data, error } = await supabase.from('attendance_summaries').insert(input).select('*').single()
  if (error) throw error
  return data as AttendanceSummary
}

export async function updateAttendanceSummary(id: string, input: Partial<AttendanceSummaryInput>): Promise<AttendanceSummary> {
  const { data, error } = await supabase.from('attendance_summaries').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as AttendanceSummary
}
