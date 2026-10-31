import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type { AvalesDepartment, SchoolAvalDocument, SchoolAvalMovement } from '../../types/database'
import { removeSchoolAvalFile, uploadSchoolAvalFile } from './storage'

// Avales regionales (migraciones 0095, 0096, 0097 y 0117). Todas estas consultas pasan
// por RLS: cada persona recibe solo lo que puede ver (la autoridad de un área, los avales
// de su área; cualquier otra persona, únicamente el suyo). La UI no filtra permisos por
// su cuenta, solo refleja lo que la base devuelve.
//
// Modelo (0117):
//   - Cada aval es de una persona dentro de un departamento y hay UNO solo vigente por
//     (persona, departamento). Se mantiene hasta que una autoridad lo archive o elimine,
//     o hasta que se renueve: renovar reemplaza el archivo del mismo aval.
//   - Archivar y eliminar piden un motivo (3 a 500 caracteres) y van por funciones de la
//     base (archive_school_aval, delete_school_aval): no hay borrado ni archivado por la
//     API directa. El motivo queda en la auditoría.
//
// Departamentos y coordinadores tienen una sola fuente: la sección Departamentos (tabla
// departments, campo coordinator_profile_id). Escuela no tiene una lista ni una
// asignación propia (lib/api/departments.ts).

// Largo del motivo que piden archivar y eliminar (archive_school_aval y delete_school_aval).
export const AVAL_REASON_MIN = 3
export const AVAL_REASON_MAX = 500

// Las funciones de la base avisan de lo que el usuario puede corregir con mensajes ya
// escritos en español. Se dejan pasar tal cual; los errores técnicos (violaciones de
// restricciones con nombres de tabla) siguen yendo por describeSupabaseError.
function avalError(error: { code?: string; message: string }): unknown {
  if (/violates|constraint|duplicate key/i.test(error.message)) return error
  if (['22023', '23514', '23505'].includes(error.code ?? '')) return new Error(error.message)
  return error
}

// ---------------- Departamentos visibles en Avales ----------------

// Departamentos que el usuario actual ve dentro de Avales (list_school_avales_departments(),
// 0117): todos para Informática y el Coordinador de Escuela, el propio para el coordinador de
// un departamento, y los activos (solo nombre) para quien carga su aval. can_manage dice si
// es autoridad de ese departamento.
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

// ¿Ya hay un aval vigente de esa persona en el departamento? Sin nombre, busca el propio. Solo
// encuentra lo que quien consulta puede ver (el suyo, o cualquiera si es autoridad del área).
export async function findSchoolAvalToRenew(departmentId: string, personName?: string | null): Promise<SchoolAvalDocument | null> {
  const { data, error } = await supabase.rpc('find_school_aval_to_renew', {
    p_department_id: departmentId,
    p_person_name: personName?.trim() || null,
  })
  if (error) throw error
  const rows = (data ?? []) as SchoolAvalDocument[]
  return rows[0] ?? null
}

export interface SchoolAvalUploadInput {
  departmentId: string
  title: string
  description: string | null
  observations: string | null
  referenceYear: number
  // Solo la autoridad del departamento puede cargar el aval de otra persona (escribiendo su
  // nombre). Sin nombre, el aval es de quien lo carga.
  personName?: string | null
  file: File
}

// Flujo de carga: 1) el id del aval se genera acá, 2) se sube el archivo a
// "<departamento>/<id>/<archivo>", 3) se registra la fila. Si el registro falla, se intenta borrar
// el archivo recién subido (la policy de Storage le permite a quien lo subió borrar un archivo
// propio sin aval). Quién cargó, de quién es el aval, el tamaño real y el MIME real los fija la
// base.
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
      reference_year: input.referenceYear,
      person_name: input.personName?.trim() || null,
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
    throw avalError(error)
  }
  return data as SchoolAvalDocument
}

export interface SchoolAvalMetadataInput {
  title: string
  description: string | null
  observations: string | null
  department_id: string
  reference_year: number
  // Solo cambia en los avales cargados a nombre de otra persona (sin usuario asociado).
  person_name?: string | null
}

// Solo la autoridad del departamento (RLS). Si otra persona lo intenta, PostgREST no encuentra fila
// para devolver (PGRST116), que describeSupabaseError traduce a "no tenés permisos".
export async function updateSchoolAvalDocument(id: string, input: SchoolAvalMetadataInput, expectedVersion?: number | null): Promise<SchoolAvalDocument> {
  try {
    return await updateVersioned<SchoolAvalDocument>('school_avales_documents', id, input, expectedVersion)
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'message' in err && 'code' in err) throw avalError(err as { code?: string; message: string })
    throw err
  }
}

// ---------------- Archivar, volver a activar, eliminar (con motivo) ----------------

export async function archiveSchoolAval(id: string, reason: string, expectedVersion?: number | null): Promise<SchoolAvalDocument> {
  const { data, error } = await supabase.rpc('archive_school_aval', {
    p_id: id,
    p_reason: reason,
    p_expected_version: expectedVersion ?? null,
  })
  if (error) throw avalError(error)
  return data as SchoolAvalDocument
}

export async function restoreSchoolAval(id: string, reason?: string | null, expectedVersion?: number | null): Promise<SchoolAvalDocument> {
  const { data, error } = await supabase.rpc('restore_school_aval', {
    p_id: id,
    p_reason: reason?.trim() || null,
    p_expected_version: expectedVersion ?? null,
  })
  if (error) throw avalError(error)
  return data as SchoolAvalDocument
}

// Eliminación definitiva con motivo: primero la fila (la función de la base valida el permiso, exige
// el motivo y deja la auditoría) y después el archivo. Si el archivo no se pudo quitar, el aval ya
// no existe y el archivo queda sin registrar: nadie lo ve, y la autoridad del área puede
// borrarlo más tarde. fileRemoved avisa si hace falta insistir.
export async function deleteSchoolAvalDocument(doc: SchoolAvalDocument, reason: string): Promise<{ fileRemoved: boolean }> {
  const { data, error } = await supabase.rpc('delete_school_aval', { p_id: doc.id, p_reason: reason })
  if (error) throw avalError(error)
  const path = typeof data === 'string' && data ? data : doc.storage_path
  try {
    return { fileRemoved: await removeSchoolAvalFile(path) }
  } catch (cleanupError) {
    console.warn('[SIGER4] El aval se eliminó pero no se pudo quitar su archivo:', cleanupError)
    return { fileRemoved: false }
  }
}

// ---------------- Renovar ----------------

export interface SchoolAvalRenewInput {
  file: File
  referenceYear: number
  // Si vienen, reemplazan los datos del aval; si no, se conservan.
  title?: string | null
  description?: string | null
  observations?: string | null
}

// Renovar reemplaza el archivo del MISMO aval (no se acumulan archivos ni avales): 1) se sube el
// archivo nuevo a una carpeta nueva del departamento, 2) la función de la base valida el permiso, la
// versión y el archivo, y actualiza el aval (quién renovó, cuándo, cuántas veces), 3) se quita el
// archivo anterior, que ya no está registrado. Si el paso 2 falla, se quita el archivo recién
// subido. oldFileRemoved avisa si el anterior quedó sin quitar (no se ve; no hay que hacer nada
// urgente).
export async function renewSchoolAvalDocument(
  doc: SchoolAvalDocument,
  input: SchoolAvalRenewInput,
): Promise<{ doc: SchoolAvalDocument; oldFileRemoved: boolean }> {
  const { path } = await uploadSchoolAvalFile(doc.department_id, crypto.randomUUID(), input.file)

  const { data, error } = await supabase.rpc('renew_school_aval', {
    p_id: doc.id,
    p_new_path: path,
    p_file_name: (input.file.name || 'archivo').slice(0, 255),
    p_reference_year: input.referenceYear,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_observations: input.observations ?? null,
    p_expected_version: doc.row_version ?? null,
  })
  if (error) {
    try {
      await removeSchoolAvalFile(path)
    } catch (cleanupError) {
      console.warn('[SIGER4] No se pudo limpiar el archivo de una renovación fallida:', cleanupError)
    }
    throw avalError(error)
  }

  const result = data as { old_storage_path: string; row: SchoolAvalDocument }
  let oldFileRemoved = false
  try {
    oldFileRemoved = await removeSchoolAvalFile(result.old_storage_path)
  } catch (cleanupError) {
    console.warn('[SIGER4] El aval se renovó pero no se pudo quitar el archivo anterior:', cleanupError)
  }
  return { doc: result.row, oldFileRemoved }
}

// ---------------- Movimientos (auditoría del área) ----------------

// Cargas, renovaciones, ediciones, archivados, reactivaciones y eliminaciones, con su motivo, de las
// áreas que la persona audita (list_school_aval_movements(), 0117).
export async function fetchSchoolAvalMovements(departmentId?: string | null, limit = 200): Promise<SchoolAvalMovement[]> {
  const { data, error } = await supabase.rpc('list_school_aval_movements', {
    p_department_id: departmentId ?? null,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as SchoolAvalMovement[]
}
