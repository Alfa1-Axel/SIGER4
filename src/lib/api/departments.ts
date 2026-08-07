import { supabase } from '../supabaseClient'
import type { Department, DepartmentManualMember, DepartmentMember, Profile } from '../../types/database'

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function fetchDepartmentById(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).single()
  if (error) return null
  return data as Department
}

export interface DepartmentInput {
  name: string
  description?: string | null
  coordinator_profile_id?: string | null
  contact_info?: string | null
  is_active?: boolean
  created_by_profile_id?: string | null
}

export async function createDepartment(input: DepartmentInput): Promise<Department> {
  const { data, error } = await supabase.from('departments').insert(input).select('*').single()
  if (error) throw error
  return data as Department
}

export async function updateDepartment(id: string, input: Partial<DepartmentInput>): Promise<Department> {
  const { data, error } = await supabase.from('departments').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Department
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}

export interface DepartmentMemberWithProfile extends DepartmentMember {
  profile: Profile
}

export async function fetchDepartmentMembers(departmentId: string): Promise<DepartmentMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profile:profiles(*)')
    .eq('department_id', departmentId)
  if (error) throw error
  return (data ?? []) as unknown as DepartmentMemberWithProfile[]
}

export async function addDepartmentMember(departmentId: string, profileId: string): Promise<DepartmentMember> {
  const { data, error } = await supabase
    .from('department_members')
    .insert({ department_id: departmentId, profile_id: profileId })
    .select('*')
    .single()
  if (error) throw error
  return data as DepartmentMember
}

export async function removeDepartmentMember(memberRowId: string): Promise<void> {
  const { error } = await supabase.from('department_members').delete().eq('id', memberRowId)
  if (error) throw error
}

export interface DepartmentManualMemberInput {
  department_id: string
  first_name: string
  last_name: string
  station_id?: string | null
  role_function?: string | null
  contact_info?: string | null
  is_active?: boolean
  observations?: string | null
  linked_profile_id?: string | null
  created_by_profile_id?: string | null
}

export async function fetchDepartmentManualMembers(departmentId: string): Promise<DepartmentManualMember[]> {
  const { data, error } = await supabase
    .from('department_manual_members')
    .select('*')
    .eq('department_id', departmentId)
    .order('last_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as DepartmentManualMember[]
}

export async function createDepartmentManualMember(input: DepartmentManualMemberInput): Promise<DepartmentManualMember> {
  const { data, error } = await supabase.from('department_manual_members').insert(input).select('*').single()
  if (error) throw error
  return data as DepartmentManualMember
}

export async function updateDepartmentManualMember(
  id: string,
  input: Partial<DepartmentManualMemberInput>,
): Promise<DepartmentManualMember> {
  const { data, error } = await supabase.from('department_manual_members').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as DepartmentManualMember
}
