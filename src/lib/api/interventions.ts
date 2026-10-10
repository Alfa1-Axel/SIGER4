import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type { InterventionSummary, InterventionTimeOfDay } from '../../types/database'

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
  time_of_day?: InterventionTimeOfDay | null
  observations?: string | null
  personnel_count?: number
  vehicles_count?: number
  work_hours?: number
}

export async function createInterventionSummary(input: InterventionSummaryInput): Promise<InterventionSummary> {
  const { data, error } = await supabase.from('intervention_summaries').insert(input).select('*').single()
  if (error) throw error
  return data as InterventionSummary
}

export async function updateInterventionSummary(id: string, input: Partial<InterventionSummaryInput>, expectedVersion?: number | null): Promise<InterventionSummary> {
  return updateVersioned<InterventionSummary>('intervention_summaries', id, input, expectedVersion)
}
