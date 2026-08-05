import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from '../supabaseClient'
import type { DocumentRecord, DocumentVersion, DocumentFolder } from '../../types/database'

// Mismo motivo que el helper equivalente en lib/api/users.ts: el cliente de
// supabase-js lanza FunctionsHttpError con un mensaje genérico para
// cualquier respuesta no-2xx, descartando el {error: "..."} real que
// purge-documents arma con cuidado.
async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (typeof body?.error === 'string' && body.error) return body.error
    } catch {
      // Body no era JSON parseable — usar el fallback.
    }
  }
  return fallback
}

// Los listados normales SIEMPRE excluyen documentos en la papelera
// (deleted_at not null) — RLS autoriza verlos (documents_select_scope no
// distingue por deleted_at), pero mostrarlos en /documentos sería confuso:
// "eliminado" tiene que desaparecer de la vista normal y solo verse en
// /documentos/papelera (ver fetchTrashedDocuments).
export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRecord[]
}

export async function fetchDocumentsByFolder(folderId: string | null): Promise<DocumentRecord[]> {
  let query = supabase.from('documents').select('*').is('deleted_at', null).order('created_at', { ascending: false })
  query = folderId ? query.eq('folder_id', folderId) : query.is('folder_id', null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DocumentRecord[]
}

export async function fetchTrashedDocuments(): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRecord[]
}

export async function fetchDocumentFolders(): Promise<DocumentFolder[]> {
  const { data, error } = await supabase.from('document_folders').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as DocumentFolder[]
}

export async function fetchDocumentFolderById(id: string): Promise<DocumentFolder | null> {
  const { data, error } = await supabase.from('document_folders').select('*').eq('id', id).single()
  if (error) return null
  return data as DocumentFolder
}

export interface DocumentFolderInput {
  name: string
  description?: string | null
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
  profile_id?: string | null
  is_active?: boolean
  created_by_profile_id?: string | null
}

export async function createDocumentFolder(input: DocumentFolderInput): Promise<DocumentFolder> {
  const { data, error } = await supabase.from('document_folders').insert(input).select('*').single()
  if (error) throw error
  return data as DocumentFolder
}

export async function updateDocumentFolder(id: string, input: Partial<DocumentFolderInput>): Promise<DocumentFolder> {
  const { data, error } = await supabase.from('document_folders').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as DocumentFolder
}

export async function deleteDocumentFolder(id: string): Promise<void> {
  const { error } = await supabase.from('document_folders').delete().eq('id', id)
  if (error) throw error
}

// Borra documentos que quedaron con storage_path='pending' (carga nunca
// completada) hace mas de 24hs. Solo informatica_r4 puede ejecutarlo (RPC
// SECURITY DEFINER, ver migración 0033_storage_hardening.sql). Devuelve
// cuántos se borraron.
export async function cleanupPendingDocuments(): Promise<number> {
  const { data, error } = await supabase.rpc('cleanup_pending_documents')
  if (error) throw error
  return (data ?? 0) as number
}

export async function fetchDocumentById(id: string): Promise<DocumentRecord | null> {
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).single()
  if (error) return null
  return data as DocumentRecord
}

export interface DocumentInput {
  title: string
  category: string
  description?: string | null
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
  profile_id?: string | null
  uploaded_by_profile_id?: string | null
  folder_id?: string | null
}

// El registro se crea con un storage_path placeholder (la columna es NOT
// NULL) porque el archivo recien se puede subir una vez que existe un
// document_id real para validar contra las policies de Storage. Llamar a
// updateDocumentStoragePath() inmediatamente despues de crear + subir.
export async function createDocument(input: DocumentInput): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents')
    .insert({ ...input, storage_path: 'pending' })
    .select('*')
    .single()
  if (error) throw error
  return data as DocumentRecord
}

export async function updateDocument(id: string, input: Partial<DocumentInput>): Promise<DocumentRecord> {
  const { data, error } = await supabase.from('documents').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as DocumentRecord
}

export async function updateDocumentStoragePath(id: string, storagePath: string): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents')
    .update({ storage_path: storagePath })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DocumentRecord
}

// Envía un documento a la papelera (soft delete): deleted_at pasa a tener
// valor, purge_after se calcula solo (trigger set_document_purge_after,
// deleted_at + 30 días — ver 0053). No borra el archivo de Storage ni la
// fila real todavía. Mismo alcance de permisos que editar el documento
// (documents_update_admin_regional_station).
export async function trashDocument(id: string, deletedByProfileId: string | null, reason?: string | null): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString(), deleted_by_profile_id: deletedByProfileId, delete_reason: reason ?? null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DocumentRecord
}

// Restaura un documento desde la papelera: deleted_at vuelve a null,
// purge_after se limpia solo (mismo trigger). Mismo alcance de permisos que
// enviarlo a la papelera.
export async function restoreDocument(id: string, restoredByProfileId: string | null): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: null, restored_at: new Date().toISOString(), restored_by_profile_id: restoredByProfileId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DocumentRecord
}

export interface PurgeDocumentsResult {
  purged: number
  failed: number
  details: { documentId: string; title: string; ok: boolean; error?: string }[]
}

// Purga definitiva vía Edge Function (borra fila + versiones + archivos
// reales de Storage) — no se puede hacer con un DELETE directo desde el
// cliente porque `delete from storage.objects` no borra el blob físico, solo
// la fila de metadata (ver purge-documents/index.ts). Solo informatica_r4/
// integrante_informatica pueden invocarla (la función revalida esto server-
// side, no confía en que la UI ya lo haya filtrado). Sin documentId, purga
// TODOS los documentos vencidos (mismo comportamiento que el cron diario).
export async function purgeDocuments(documentId?: string): Promise<PurgeDocumentsResult> {
  const { data, error } = await supabase.functions.invoke<PurgeDocumentsResult & { error?: string }>('purge-documents', {
    body: documentId ? { documentId } : {},
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'No pudimos purgar el documento. Reintentá en unos segundos.'))
  if (!data) throw new Error('No pudimos purgar el documento.')
  return data
}

export async function fetchDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentVersion[]
}

// Registra la version anterior en el historial antes de reemplazar
// documents.storage_path por la nueva. Llamar antes de
// updateDocumentStoragePath() al subir un reemplazo.
export async function addDocumentVersion(
  documentId: string,
  previousStoragePath: string,
  uploadedByProfileId: string | null,
  note?: string | null,
): Promise<DocumentVersion> {
  const { data, error } = await supabase
    .from('document_versions')
    .insert({
      document_id: documentId,
      storage_path: previousStoragePath,
      uploaded_by_profile_id: uploadedByProfileId,
      note: note ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DocumentVersion
}
