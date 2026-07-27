import { supabase } from '../supabaseClient'
import type { Personnel, PersonnelStatus } from '../../types/database'

export async function fetchPersonnelByStation(stationId: string): Promise<Personnel[]> {
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('station_id', stationId)
    .order('last_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Personnel[]
}

export async function fetchPersonnelById(id: string): Promise<Personnel | null> {
  const { data, error } = await supabase.from('personnel').select('*').eq('id', id).single()
  if (error) return null
  return data as Personnel
}

export interface PersonnelInput {
  station_id: string
  first_name: string
  last_name: string
  national_id?: string | null
  rank?: string | null
  role_function?: string | null
  status?: PersonnelStatus
  department?: string | null
  join_date?: string | null
  phone?: string | null
  email?: string | null
  observations?: string | null
}

export async function createPersonnel(input: PersonnelInput): Promise<Personnel> {
  const { data, error } = await supabase.from('personnel').insert(input).select('*').single()
  if (error) throw error
  return data as Personnel
}

export async function updatePersonnel(id: string, input: Partial<PersonnelInput>): Promise<Personnel> {
  const { data, error } = await supabase.from('personnel').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Personnel
}

export async function deletePersonnel(id: string): Promise<void> {
  const { error } = await supabase.from('personnel').delete().eq('id', id)
  if (error) throw error
}
