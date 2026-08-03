import { supabase } from '../supabaseClient'
import type { Personnel, PersonnelStatus, PersonnelStatusHistory } from '../../types/database'

// Estados que implican que la persona deja de contar como dotacion activa
// real del cuartel; requieren motivo obligatorio via changePersonnelStatus.
export const SEPARATION_STATUSES: PersonnelStatus[] = ['renuncia', 'baja', 'pase', 'reserva']

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

// Unico camino soportado para pasar a renuncia/baja/pase/reserva: exige un
// motivo (la base tambien lo exige). Usa la RPC change_personnel_status, que
// ademas registra el historial y agrega el motivo a observations (ver
// 0040_personnel_status_history.sql).
export async function changePersonnelStatus(personnelId: string, newStatus: PersonnelStatus, reason: string): Promise<Personnel> {
  if (!reason.trim()) throw new Error('El motivo es obligatorio.')
  const { data, error } = await supabase.rpc('change_personnel_status', {
    p_personnel_id: personnelId,
    p_new_status: newStatus,
    p_reason: reason.trim(),
  })
  if (error) throw error
  return data as Personnel
}

export async function fetchPersonnelStatusHistory(personnelId: string): Promise<PersonnelStatusHistory[]> {
  const { data, error } = await supabase
    .from('personnel_status_history')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PersonnelStatusHistory[]
}
