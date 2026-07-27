import { supabase } from '../supabaseClient'
import type { DocumentRecord, DocumentVersion } from '../../types/database'

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRecord[]
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

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
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
