import { supabase } from '../supabaseClient'
import type { AuditLog, Profile, Region, Station, Subsede } from '../../types/database'

export interface AuditLogRow extends AuditLog {
  actor: Profile | null
  region: Region | null
  subsede: Subsede | null
  station: Station | null
}

export interface AuditLogFilters {
  dateFrom?: string | null
  dateTo?: string | null
  actorProfileId?: string | null
  action?: string | null
  tableName?: string | null
  regionId?: string | null
  subsedeId?: string | null
  stationId?: string | null
  searchText?: string | null
  // Allowlist de tablas visibles para el rol actual (ver AuditoriaPage.tsx,
  // scopedAuditTables) — no viene de un filtro elegido por el usuario, sino
  // de la vista institucional/técnica según su rol. RLS ya acota las FILAS
  // por territorio; esto acota además qué MÓDULOS puede ver, independiente
  // del alcance territorial. null/undefined = sin restricción (informática).
  allowedTableNames?: string[] | null
}

const AUDIT_LOG_SELECT = `
  *,
  actor:profiles(*),
  region:regions(*),
  subsede:subsedes(*),
  station:stations(*)
`

const PAGE_SIZE = 50

export async function fetchAuditLogs(filters: AuditLogFilters, page = 0): Promise<{ rows: AuditLogRow[]; hasMore: boolean }> {
  let query = supabase.from('audit_logs').select(AUDIT_LOG_SELECT)

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`)
  if (filters.actorProfileId) query = query.eq('actor_profile_id', filters.actorProfileId)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.tableName) query = query.eq('table_name', filters.tableName)
  if (filters.allowedTableNames) query = query.in('table_name', filters.allowedTableNames)
  if (filters.regionId) query = query.eq('region_id', filters.regionId)
  if (filters.subsedeId) query = query.eq('subsede_id', filters.subsedeId)
  if (filters.stationId) query = query.eq('station_id', filters.stationId)
  if (filters.searchText) {
    const q = filters.searchText.trim()
    if (q) query = query.or(`action.ilike.%${q}%,reason.ilike.%${q}%,table_name.ilike.%${q}%,record_id.ilike.%${q}%`)
  }

  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  const rows = (data ?? []) as unknown as AuditLogRow[]
  return { rows, hasMore: rows.length === PAGE_SIZE }
}

export async function fetchDistinctAuditActions(allowedTableNames?: string[] | null): Promise<string[]> {
  let query = supabase.from('audit_logs').select('action')
  if (allowedTableNames) query = query.in('table_name', allowedTableNames)
  const { data, error } = await query
  if (error) throw error
  return Array.from(new Set((data ?? []).map((row) => (row as { action: string }).action))).sort()
}

export async function fetchDistinctAuditTables(allowedTableNames?: string[] | null): Promise<string[]> {
  let query = supabase.from('audit_logs').select('table_name')
  if (allowedTableNames) query = query.in('table_name', allowedTableNames)
  const { data, error } = await query
  if (error) throw error
  return Array.from(new Set((data ?? []).map((row) => (row as { table_name: string }).table_name))).sort()
}
