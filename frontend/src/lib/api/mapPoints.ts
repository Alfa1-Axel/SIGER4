import { supabase } from '../supabaseClient'
import { EditConflictError } from '../concurrency'
import { buildMapPointFilePath, removeMapPointObjects, uploadMapPointObject } from './storage'
import type {
  MapPointFile,
  MapPointSheet,
  MapPointSheetHistoryRow,
  MapPointSheetPayload,
  MapPointSheetPrivate,
  MapPointSheetProposal,
  MapPointVerification,
  MapReferencePoint,
  MapSupplyPointStatus,
  MapVerificationResult,
} from '../../types/database'

// Fichas y verificaciones del Mapa Regional (migraciones 0114 y 0115). Quién
// ve, propone, valida o sube lo decide la base (RLS, funciones y Storage); acá
// solo se arma el flujo. Ver DEPLOYMENT.md sección 70.

function unwrap<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

// ---------------- Ficha ----------------

export async function fetchPoint(pointId: string): Promise<MapReferencePoint | null> {
  const { data, error } = await supabase.from('map_reference_points').select('*').eq('id', pointId).maybeSingle()
  if (error) throw error
  return (data as MapReferencePoint | null) ?? null
}

export async function fetchSheet(pointId: string): Promise<MapPointSheet | null> {
  const { data, error } = await supabase.from('map_point_sheets').select('*').eq('point_id', pointId).maybeSingle()
  if (error) throw error
  return (data as MapPointSheet | null) ?? null
}

// null si no hay parte reservada o esta persona no la ve (la base devuelve cero filas).
export async function fetchSheetPrivate(pointId: string): Promise<MapPointSheetPrivate | null> {
  const { data, error } = await supabase.from('map_point_sheet_private').select('*').eq('point_id', pointId).maybeSingle()
  if (error) throw error
  return (data as MapPointSheetPrivate | null) ?? null
}

export async function fetchSheetHistory(pointId: string, limit = 30): Promise<MapPointSheetHistoryRow[]> {
  const { data, error } = await supabase
    .from('map_point_sheet_history')
    .select('*')
    .eq('point_id', pointId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MapPointSheetHistoryRow[]
}

export async function fetchProposals(pointId: string): Promise<MapPointSheetProposal[]> {
  const { data, error } = await supabase
    .from('map_point_sheet_proposals')
    .select('*')
    .eq('point_id', pointId)
    .order('proposed_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as MapPointSheetProposal[]
}

function throwIfConflict(error: { code?: string; message?: string }): never {
  if (error.code === 'P0409') throw new EditConflictError()
  throw error
}

// Guardar la ficha directo (solo quien valida). expectedVersion: la que se leyó (null si la ficha no existía).
export async function saveSheet(pointId: string, payload: MapPointSheetPayload, expectedVersion: number | null): Promise<MapPointSheet> {
  const { data, error } = await supabase.rpc('save_map_point_sheet', {
    p_point_id: pointId,
    p_payload: payload,
    p_expected_version: expectedVersion,
  })
  if (error) return throwIfConflict(error)
  const row = unwrap(data as MapPointSheet[] | MapPointSheet | null)
  if (!row) throw new Error('El servidor no confirmó el guardado de la ficha.')
  return row
}

export async function markSheetReviewed(pointId: string): Promise<MapPointSheet> {
  const { data, error } = await supabase.rpc('mark_map_point_sheet_reviewed', { p_point_id: pointId })
  if (error) throw error
  const row = unwrap(data as MapPointSheet[] | MapPointSheet | null)
  if (!row) throw new Error('El servidor no confirmó la validación.')
  return row
}

export async function savePrivate(
  pointId: string,
  payload: { personal_contacts?: string | null; sensitive_notes?: string | null },
  expectedVersion: number | null,
): Promise<MapPointSheetPrivate> {
  const { data, error } = await supabase.rpc('save_map_point_sheet_private', {
    p_point_id: pointId,
    p_payload: payload,
    p_expected_version: expectedVersion,
  })
  if (error) return throwIfConflict(error)
  const row = unwrap(data as MapPointSheetPrivate[] | MapPointSheetPrivate | null)
  if (!row) throw new Error('El servidor no confirmó el guardado de la parte reservada.')
  return row
}

// id: lo elige la pantalla de antemano para que reintentar no duplique la propuesta.
export async function proposeSheet(
  pointId: string,
  payload: MapPointSheetPayload,
  note: string | null,
  baseVersion: number | null,
  id: string,
): Promise<MapPointSheetProposal> {
  const { data, error } = await supabase.rpc('propose_map_point_sheet', {
    p_point_id: pointId,
    p_payload: payload,
    p_note: note,
    p_base_version: baseVersion,
    p_id: id,
  })
  if (error) throw error
  const row = unwrap(data as MapPointSheetProposal[] | MapPointSheetProposal | null)
  if (!row) throw new Error('El servidor no confirmó la propuesta.')
  return row
}

export async function reviewProposal(
  proposalId: string,
  accept: boolean,
  note: string | null,
  expectedSheetVersion: number | null,
): Promise<MapPointSheetProposal> {
  const { data, error } = await supabase.rpc('review_map_point_proposal', {
    p_proposal_id: proposalId,
    p_accept: accept,
    p_note: note,
    p_expected_sheet_version: expectedSheetVersion,
  })
  if (error) return throwIfConflict(error)
  const row = unwrap(data as MapPointSheetProposal[] | MapPointSheetProposal | null)
  if (!row) throw new Error('El servidor no confirmó la resolución.')
  return row
}

// ---------------- Archivos ----------------

export async function fetchPointFiles(pointId: string): Promise<MapPointFile[]> {
  const { data, error } = await supabase
    .from('map_point_files')
    .select('*')
    .eq('point_id', pointId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MapPointFile[]
}

export interface PointFileUploadInput {
  pointId: string
  file: File
  kind: MapPointFile['file_kind']
  visibility: MapPointFile['visibility']
  caption: string | null
  verificationId?: string | null
}

// Sube el archivo y lo registra. Si el registro falla, intenta borrar el
// archivo recién subido para no dejar basura en el bucket.
export async function addPointFile(input: PointFileUploadInput, onProgress?: (fraction: number) => void): Promise<MapPointFile> {
  const fileId = crypto.randomUUID()
  const path = buildMapPointFilePath(input.pointId, fileId, input.file)
  const { contentType } = await uploadMapPointObject(path, input.file, onProgress)
  const { data, error } = await supabase
    .from('map_point_files')
    .insert({
      id: fileId,
      point_id: input.pointId,
      verification_id: input.verificationId ?? null,
      storage_path: path,
      file_name: (input.file.name || 'archivo').slice(0, 255),
      mime_type: contentType,
      file_size: input.file.size,
      file_kind: input.kind,
      visibility: input.visibility,
      caption: input.caption?.trim() || null,
    })
    .select('*')
    .single()
  if (error) {
    try {
      await removeMapPointObjects([path])
    } catch (cleanupError) {
      console.warn('[SIGER4] No se pudo limpiar un archivo de ficha no registrado:', cleanupError)
    }
    throw error
  }
  return data as MapPointFile
}

export async function validatePointFile(id: string): Promise<void> {
  const { data, error } = await supabase.from('map_point_files').update({ status: 'validado' }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No tenés permiso para validar este archivo.')
}

export async function removePointFile(file: MapPointFile): Promise<void> {
  await removeMapPointObjects([file.storage_path])
  const { data, error } = await supabase.from('map_point_files').delete().eq('id', file.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No tenés permiso para quitar este archivo.')
}

// ---------------- Verificaciones de abastecimiento ----------------

export async function fetchVerifications(pointId: string): Promise<MapPointVerification[]> {
  const { data, error } = await supabase
    .from('map_point_verifications')
    .select('*')
    .eq('point_id', pointId)
    .order('verified_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as MapPointVerification[]
}

export interface VerificationInput {
  id: string
  point_id: string
  verified_on: string
  result: MapVerificationResult
  problems: string | null
  notes: string | null
  follow_up: string | null
}

export async function createVerification(input: VerificationInput): Promise<MapPointVerification> {
  const { data, error } = await supabase.from('map_point_verifications').insert(input).select('*').single()
  if (error) throw error
  return data as MapPointVerification
}

export async function resolveFollowUp(verificationId: string, resolution: string | null): Promise<MapPointVerification> {
  const { data, error } = await supabase.rpc('resolve_map_point_followup', {
    p_verification_id: verificationId,
    p_resolution: resolution,
  })
  if (error) throw error
  const row = unwrap(data as MapPointVerification[] | MapPointVerification | null)
  if (!row) throw new Error('El servidor no confirmó la resolución.')
  return row
}

// Estado derivado de los puntos de abastecimiento que esta persona ve.
export async function fetchSupplyStatuses(): Promise<MapSupplyPointStatus[]> {
  const { data, error } = await supabase.from('map_supply_point_status').select('*')
  if (error) throw error
  return (data ?? []) as MapSupplyPointStatus[]
}

export async function fetchSupplyStatus(pointId: string): Promise<MapSupplyPointStatus | null> {
  const { data, error } = await supabase.from('map_supply_point_status').select('*').eq('point_id', pointId).maybeSingle()
  if (error) throw error
  return (data as MapSupplyPointStatus | null) ?? null
}

// ---------------- Permisos (los mismos helpers que usa la base) ----------------
// Solo para elegir qué botones mostrar: la base vuelve a decidir en cada acción.

async function rpcBoolean(fn: string, pointId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, { p_point_id: pointId })
  if (error) return false
  return data === true
}

export interface PointPermissions {
  canValidate: boolean
  canPropose: boolean
  canViewPrivate: boolean
}

export async function fetchPointPermissions(pointId: string): Promise<PointPermissions> {
  const [canValidate, canPropose, canViewPrivate] = await Promise.all([
    rpcBoolean('can_validate_map_point', pointId),
    rpcBoolean('can_propose_map_point', pointId),
    rpcBoolean('can_view_private_map_point', pointId),
  ])
  return { canValidate, canPropose, canViewPrivate }
}

// ---------------- Buscar y evitar duplicados ----------------

export interface SimilarPoint {
  id: string
  name: string
  type: MapReferencePoint['type']
  subtype: string | null
  distance_m: number
  match_reason: 'mismo_nombre' | 'nombre_parecido' | 'muy_cerca'
}

export async function findSimilarPoints(name: string, latitude: number, longitude: number): Promise<SimilarPoint[]> {
  const { data, error } = await supabase.rpc('find_similar_map_points', {
    p_name: name,
    p_latitude: latitude,
    p_longitude: longitude,
  })
  if (error) throw error
  return (data ?? []) as SimilarPoint[]
}

export interface MapPointSearchResult {
  id: string
  name: string
  type: MapReferencePoint['type']
  subtype: string | null
  locality: string | null
}

export async function searchMapPoints(query: string, limit = 8): Promise<MapPointSearchResult[]> {
  const { data, error } = await supabase.rpc('search_map_points', { p_query: query, p_limit: limit })
  if (error) throw error
  return (data ?? []) as MapPointSearchResult[]
}

// ---------------- Quién hizo el cambio (solo si esta persona puede ver ese perfil) ----------------

export async function fetchProfileNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const names = new Map<string, string>()
  if (unique.length === 0) return names
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', unique)
  if (error || !data) return names
  for (const row of data as { id: string; full_name: string }[]) names.set(row.id, row.full_name)
  return names
}
