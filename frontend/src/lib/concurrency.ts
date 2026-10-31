import { supabase } from './supabaseClient'
import type { Versioned } from '../types/database'

// Una fila tal como la leyó un formulario: columnas sueltas más su versión.
export type RowSnapshot = Record<string, unknown> & Versioned

// Edición sin pisarse (migración 0112). Cada registro compartido tiene una
// row_version que sube sola cuando cambia su contenido. Al abrir un
// formulario la pantalla recuerda la versión que leyó y la manda junto con los
// cambios; la base compara dentro de la misma sentencia y, si ya no es la
// vigente, rechaza con el código P0409 sin escribir nada.

export const EDIT_CONFLICT_CODE = 'P0409'

// Error propio para los flujos que no pasan por Postgrest (por ejemplo las
// RPC de las fichas, que devuelven el conflicto con otra forma).
export class EditConflictError extends Error {
  readonly isEditConflict = true
  constructor(message = 'Este registro fue actualizado mientras lo editabas.') {
    super(message)
    this.name = 'EditConflictError'
  }
}

export function isEditConflict(err: unknown): boolean {
  if (err instanceof EditConflictError) return true
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === EDIT_CONFLICT_CODE
}

// Agrega la versión esperada a los cambios. Sin versión (registro cargado
// antes de correr la migración, o pantalla que no la conoce) se guarda como
// siempre: la base no tiene con qué comparar.
export function withExpectedVersion<T extends object>(patch: T, expectedVersion: number | null | undefined): T & { row_version?: number } {
  if (expectedVersion === null || expectedVersion === undefined) return patch
  return { ...patch, row_version: expectedVersion }
}

// UPDATE de una fila por id, con la comprobación de versión. Devuelve la fila
// ya guardada (con su versión nueva). Si la persona no tiene permiso o el
// registro ya no existe, PostgREST no encuentra fila para devolver (PGRST116),
// igual que antes; describeSupabaseError lo traduce.
export async function updateVersioned<T>(
  table: string,
  id: string,
  patch: object,
  expectedVersion: number | null | undefined,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .update(withExpectedVersion(patch, expectedVersion))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as T
}

// La fila vigente tal como la ve esta persona (la RLS decide), o null si ya
// no existe o dejó de verla.
export async function fetchCurrentRow(table: string, id: string, keyColumn = 'id'): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from(table).select('*').eq(keyColumn, id).maybeSingle()
  if (error) throw error
  return (data as Record<string, unknown> | null) ?? null
}

// Nombre de quien hizo el último cambio, solo si esta persona puede ver ese
// perfil (la RLS de profiles decide; si no puede, devuelve null y la pantalla
// dice "otra persona").
export async function fetchUpdaterName(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null
  const { data, error } = await supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle()
  if (error || !data) return null
  return (data as { full_name: string }).full_name
}

// ----- Comparación de tres vías (base · lo mío · lo vigente) -----

function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

export function sameValue(a: unknown, b: unknown): boolean {
  return normalize(a) === normalize(b)
}

export interface ConflictField {
  field: string
  base: unknown
  mine: unknown
  current: unknown
  // Solo lo cambié yo: se puede aplicar sin pisar a nadie.
  kind: 'mine-only' | 'conflict'
}

export interface ConflictAnalysis {
  fields: ConflictField[]
  // Campos que cambió la otra persona y yo no toqué: se conservan como están.
  keptFromOthers: string[]
}

const NEVER_COMPARE = new Set(['row_version', 'updated_by_profile_id', 'updated_at', 'created_at', 'id'])

// Qué cambié yo respecto de lo que abrí (base), qué cambió la otra persona
// respecto de esa misma base (current) y en qué campos chocamos.
export function analyzeConflict(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  current: Record<string, unknown>,
): ConflictAnalysis {
  const fields: ConflictField[] = []
  const keptFromOthers: string[] = []
  for (const field of Object.keys(mine)) {
    if (NEVER_COMPARE.has(field)) continue
    const changedByMe = !sameValue(base[field], mine[field])
    const changedByThem = !sameValue(base[field], current[field])
    if (changedByMe && changedByThem && !sameValue(mine[field], current[field])) {
      fields.push({ field, base: base[field], mine: mine[field], current: current[field], kind: 'conflict' })
    } else if (changedByMe && !changedByThem) {
      fields.push({ field, base: base[field], mine: mine[field], current: current[field], kind: 'mine-only' })
    } else if (!changedByMe && changedByThem) {
      keptFromOthers.push(field)
    }
  }
  return { fields, keptFromOthers }
}

// Texto para copiar/pegar con lo que la persona quería guardar.
export function describeChangesAsText(
  mine: Record<string, unknown>,
  base: Record<string, unknown>,
  label: (field: string) => string,
  format: (field: string, value: unknown) => string,
): string {
  const lines: string[] = []
  for (const field of Object.keys(mine)) {
    if (NEVER_COMPARE.has(field)) continue
    if (sameValue(base[field], mine[field])) continue
    lines.push(`${label(field)}: ${format(field, mine[field])}`)
  }
  return lines.join('\n')
}
