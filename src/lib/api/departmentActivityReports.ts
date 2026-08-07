import { supabase } from '../supabaseClient'
import type { DepartmentActivityReport, DepartmentActivityType } from '../../types/database'

export async function fetchDepartmentActivityReports(departmentId: string): Promise<DepartmentActivityReport[]> {
  const { data, error } = await supabase
    .from('department_activity_reports')
    .select('*')
    .eq('department_id', departmentId)
    .order('activity_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as DepartmentActivityReport[]
}

// A diferencia de fetchDepartmentById (que devuelve null ante CUALQUIER
// error, incluida una falla real de RLS/red), esta distingue "no existe"
// (PGRST116, 0 filas) de un error real que hay que mostrarle al usuario.
export async function fetchDepartmentActivityReportById(id: string): Promise<DepartmentActivityReport | null> {
  const { data, error } = await supabase.from('department_activity_reports').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as DepartmentActivityReport
}

export interface DepartmentActivityReportInput {
  department_id: string
  title: string
  description?: string | null
  activity_date: string
  activity_type: DepartmentActivityType
  station_id?: string | null
  subsede_id?: string | null
  attendees_count?: number
  hours_worked?: number
  created_by_profile_id?: string | null
}

export async function createDepartmentActivityReport(input: DepartmentActivityReportInput): Promise<DepartmentActivityReport> {
  const { data, error } = await supabase.from('department_activity_reports').insert(input).select('*').single()
  if (error) throw error
  return data as DepartmentActivityReport
}

export async function updateDepartmentActivityReport(
  id: string,
  input: Partial<DepartmentActivityReportInput>,
): Promise<DepartmentActivityReport> {
  const { data, error } = await supabase.from('department_activity_reports').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as DepartmentActivityReport
}

export async function deleteDepartmentActivityReport(id: string): Promise<void> {
  const { error } = await supabase.from('department_activity_reports').delete().eq('id', id)
  if (error) throw error
}
