import { supabase } from '../supabaseClient'
import type { Department, SchoolAvalDocument, SchoolDepartmentMember } from '../../types/database'
import type { RoleKey } from '../../types/roles'
import { removeSchoolAvalFile, uploadSchoolAvalFile } from './storage'

// Avales regionales de la Escuela (ver 0095_school_avales_module.sql y
// 0096_avales_use_system_departments.sql). Todas estas consultas pasan por
// RLS: cada rol recibe solo lo que puede ver (un coordinador de
// departamento, solo su departamento; un usuario común, nada). La UI no
// filtra permisos por su cuenta, solo refleja lo que la base devuelve.
//
// Los departamentos son los de la tabla única departments (sección
// Departamentos). Crearlos, renombrarlos o desactivarlos se hace solo ahí
// (lib/api/departments.ts); Escuela no tiene una lista propia.

// ---------------- Departamentos visibles en Avales ----------------

// Departamentos que el usuario actual ve dentro de Avales: todos para
// Informática y Coordinador/Secretario de Escuela, solo los propios para un
// coordinador de departamento, ninguno para el resto
// (list_school_avales_departments(), 0096).
export async function fetchAvalesDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.rpc('list_school_avales_departments')
  if (error) throw error
  return (data ?? []) as Department[]
}

// ---------------- Coordinadores de departamento ----------------

export async function fetchSchoolDepartmentMembers(): Promise<SchoolDepartmentMember[]> {
  const { data, error } = await supabase
    .from('school_department_members')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SchoolDepartmentMember[]
}

// Asigna como coordinador de Avales de un departamento (tabla departments):
// membresía Y rol coordinador_departamento_escuela en un solo paso
// server-side. Solo informatica_r4 (la RPC lo valida).
export async function assignSchoolDepartmentCoordinator(departmentId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_school_department_coordinator', {
    p_department_id: departmentId,
    p_profile_id: profileId,
  })
  if (error) throw error
}

// Desactiva la membresía; si el usuario ya no coordina ningún departamento,
// la RPC también le quita el rol.
export async function removeSchoolDepartmentCoordinator(departmentId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_school_department_coordinator', {
    p_department_id: departmentId,
    p_profile_id: profileId,
  })
  if (error) throw error
}

// Para avisar en la administración de departamentos si a un coordinador
// asignado le quitaron el rol a mano (sin rol, la membresía no da acceso).
export async function fetchProfileIdsWithRole(role: RoleKey): Promise<string[]> {
  const { data, error } = await supabase.from('user_roles').select('profile_id').eq('role', role)
  if (error) throw error
  return (data ?? []).map((row) => (row as { profile_id: string }).profile_id)
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
export async function updateSchoolAvalDocument(id: string, input: SchoolAvalMetadataInput): Promise<SchoolAvalDocument> {
  const { data, error } = await supabase.from('school_avales_documents').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as SchoolAvalDocument
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
  if (!data || data.length === 0) throw new Error('No tenés permisos para eliminar este documento.')
}
