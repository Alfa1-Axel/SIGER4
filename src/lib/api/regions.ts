import { supabase } from '../supabaseClient'
import type { Region } from '../../types/database'

export async function fetchRegions(): Promise<Region[]> {
  const { data, error } = await supabase.from('regions').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Region[]
}
