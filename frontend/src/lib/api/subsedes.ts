import { supabase } from '../supabaseClient'
import type { Subsede } from '../../types/database'

export async function fetchSubsedes(): Promise<Subsede[]> {
  const { data, error } = await supabase.from('subsedes').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Subsede[]
}
