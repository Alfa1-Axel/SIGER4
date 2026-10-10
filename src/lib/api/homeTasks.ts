import { supabase } from '../supabaseClient'
import type { InventoryItem, InventoryLoanRequest } from '../../types/database'

// Consultas livianas para "Tareas y pendientes" del Inicio (complementan a
// get_pending_items, 0075). Todas pasan por la RLS de cada tabla: si el
// usuario no puede ver algo, no cuenta.

export interface OpenLoan extends InventoryLoanRequest {
  item: Pick<InventoryItem, 'id' | 'name' | 'responsible_profile_id'> | null
}

// Solicitudes pendientes o aprobadas (sin retirar), con el nombre del
// elemento.
export async function fetchOpenLoanRequests(): Promise<OpenLoan[]> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .select('*')
    .in('status', ['pendiente', 'aprobada'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  const loans = (data ?? []) as InventoryLoanRequest[]
  const itemIds = [...new Set(loans.map((l) => l.inventory_item_id))]
  if (itemIds.length === 0) return []
  const { data: items, error: itemsError } = await supabase
    .from('inventory_items')
    .select('id, name, responsible_profile_id')
    .in('id', itemIds)
  if (itemsError) throw itemsError
  const byId = new Map((items ?? []).map((i) => [(i as { id: string }).id, i as OpenLoan['item']]))
  return loans.map((l) => ({ ...l, item: byId.get(l.inventory_item_id) ?? null }))
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// Avales nuevos o renovados en los últimos días, entre los que la persona puede ver. Solo se muestra
// a la autoridad de un área (para quien carga su aval la RLS devuelve únicamente el suyo).
export async function countRecentAvales(days = 7): Promise<number> {
  const since = daysAgoIso(days)
  const { count, error } = await supabase
    .from('school_avales_documents')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
    .or(`created_at.gte.${since},renewed_at.gte.${since}`)
  if (error) throw error
  return count ?? 0
}

// Informes nuevos en los departamentos que el usuario puede ver, cargados
// por otras personas.
export async function countRecentDepartmentReports(excludeProfileId: string | null, days = 7): Promise<number> {
  let query = supabase
    .from('department_reports')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
    .gte('created_at', daysAgoIso(days))
  if (excludeProfileId) query = query.neq('created_by_profile_id', excludeProfileId)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}
