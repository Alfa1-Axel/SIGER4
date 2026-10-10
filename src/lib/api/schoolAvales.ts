import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type { AvalesDepartment, SchoolAvalDocument } from '../../types/database'
import { removeSchoolAvalFile, uploadSchoolAvalFile } from './storage'

// Avales regionales de la Escuela (migraciones 0095, 0096 y 0097). Todas
// estas consultas pasan por RLS: cada rol recibe solo lo que puede ver (un
// coordinador de departamento, solo su departamento; un usuario común,
// nada). La UI no filtra permisos por su cuenta, solo refleja lo que la base
// devuelve.
//
// Departamentos y coordinadores tienen una sola fuente: la sección
// Departamentos (tabla departments, campo coordinator_profile_id). Escuela no
// tiene una lista ni una asignación propia; se administran solo ahí
// (lib/api/departments.ts).

// ---------------- Departamentos visibles en Avales ----------------

// Departamentos que el usuario actual ve dentro de Avales, con su
// coordinador: todos para Informática y Coordinador/Secretario de Escuela,
// solo el propio para el coordinador de un departamento, ninguno para el
// resto (list_school_avales_departments(), 0097).
export async function fetchAvalesDepartments(): Promise<AvalesDepartment[]> {
  const { data, error } = await supabase.rpc('list_school_avales_departments')
  if (error) throw error
  return (data ?? []) as AvalesDepartment[]
}

// ---------------- Documentos ----------------

export async function fetchSchoolAvalDocuments(): Promise<SchoolAvalDocument[]> {
  const { data, error } = await supabase
    .from('school_avales_documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SchoolAvalDocument[]
}

export async function fetchSchoolAvalDocumentById(id: string): Promise<SchoolAvalDocument | null> {
  const { data, error } = await supabase.from('school_avales_documents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as SchoolAvalDocument | null) ?? null
}

export interface SchoolAvalUploadInput {
  departmentId: string
  title: string
  description: string | null
  observations: string | null
  file: File
}

// Flujo de carga: 1) el id del documento se genera acá, 2) se sube el
// archivo a "<departamento>/<id>/<archivo>", 3) se registra la fila. Si el
// registro falla, se intenta borrar el archivo recién subido (la policy de
// Storage le permite a quien lo subió borrar un archivo propio sin
// documento). Quién cargó, el tamaño real y el MIME real los fija la base.
export async function uploadSchoolAvalDocument(input: SchoolAvalUploadInput): Promise<SchoolAvalDocument> {
  const documentId = crypto.randomUUID()
  const { path, contentType } = await uploadSchoolAvalFile(input.departmentId, documentId, input.file)

  const { data, error } = await supabase
    .from('school_avales_documents')
    .insert({
      id: documentId,
      department_id: input.departmentId,
      title: input.title,
      description: input.description,
      observations: input.observations,
      storage_path: path,
      file_name: (input.file.name || 'archivo').slice(0, 255),
      mime_type: contentType,
      file_size: input.file.size,
    })
    .select('*')
    .single()

  if (error) {
    try {
      await removeSchoolAvalFile(path)
    } catch (cleanupError) {
      console.warn('[SIGER4] No se pudo limpiar el archivo de un aval no registrado:', cleanupError)
    }
    throw error
  }
  return data as SchoolAvalDocument
}

export interface SchoolAvalMetadataInput {
  title: string
  description: string | null
  observations: string | null
  department_id: string
}

// Solo informatica_r4 (RLS). Si otro rol lo intenta, PostgREST no encuentra
// fila para devolver (PGRST116), que describeSupabaseError traduce a "no
// tenés permisos".
export async function updateSchoolAvalDocument(id: string, input: SchoolAvalMetadataInput, expectedVersion?: number | null): Promise<SchoolAvalDocument> {
  return updateVersioned<SchoolAvalDocument>('school_avales_documents', id, input, expectedVersion)
}

export async function setSchoolAvalArchived(id: string, archived: boolean): Promise<SchoolAvalDocument> {
  const { data, error } = await supabase
    .from('school_avales_documents')
    .update({ is_archived: archived })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as SchoolAvalDocument
}

// Eliminación definitiva (solo informatica_r4): primero el archivo, después
// la fila. En ese orden, si algo falla a mitad de camino se puede reintentar
// sin dejar un archivo huérfano (borrar un archivo que ya no existe no es
// error).
export async function deleteSchoolAvalDocument(doc: SchoolAvalDocument): Promise<void> {
  await removeSchoolAvalFile(doc.storage_path)
  const { data, error } = await supabase.from('school_avales_documents').delete().eq('id', doc.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No tenés permiso para eliminar este documento con tu rol actual.')
}
