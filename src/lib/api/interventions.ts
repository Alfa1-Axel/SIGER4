import { supabase } from '../supabaseClient'
import type { InterventionSummary } from '../../types/database'

export async function fetchInterventionsByStation(stationId: string): Promise<InterventionSummary[]> {
  const { data, error } = await supabase
    .from('intervention_summaries')
    .select('*')
    .eq('station_id', stationId)
    .order('period_start', { ascending: false })
  if (error) throw error
  return (data ?? []) as InterventionSummary[]
}

export async function fetchInterventionSummaryById(id: string): Promise<InterventionSummary | null> {
  const { data, error } = await supabase.from('intervention_summaries').select('*').eq('id', id).single()
  if (error) return null
  return data as InterventionSummary
}

export interface InterventionSummaryInput {
  station_id: string
  period_start: string
  period_end: string
  category: string
  total_count: number
}

export async function createInterventionSummary(input: InterventionSummaryInput): Promise<InterventionSummary> {
  const { data, error } = await supabase.from('intervention_summaries').insert(input).select('*').single()
  if (error) throw error
  return data as InterventionSummary
}

export async function updateInterventionSummary(id: string, input: Partial<InterventionSummaryInput>): Promise<InterventionSummary> {
  const { data, error } = await supabase.from('intervention_summaries').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as InterventionSummary
}
