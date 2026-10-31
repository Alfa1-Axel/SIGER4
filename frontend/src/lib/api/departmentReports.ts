import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type { DepartmentReport, DepartmentReportFile, DepartmentReportType, DepartmentReportWithFiles } from '../../types/database'
import { buildDepartmentReportFilePath, removeDepartmentReportObjects, uploadDepartmentReportObject } from './storage'

// Informes documentales de Departamentos (0098). Quién ve, carga, edita o
// elimina lo decide la base (RLS + policies de Storage); acá solo se arma el
// flujo. Ver DEPLOYMENT.md sección 57.

export const DEPARTMENT_REPORT_TYPE_LABEL: Record<DepartmentReportType, string> = {
  acta_reunion: 'Acta de reunión',
  informe_operativo: 'Informe operativo',
  informe_administrativo: 'Informe administrativo',
  registro_fotografico: 'Registro fotográfico',
  documentacion: 'Documentación adjunta',
  otro: 'Otro',
}

export const DEPARTMENT_REPORT_TYPES = Object.keys(DEPARTMENT_REPORT_TYPE_LABEL) as DepartmentReportType[]

const REPORT_WITH_FILES = '*, files:department_report_files(*)'

function sortFiles(report: DepartmentReportWithFiles): DepartmentReportWithFiles {
  return { ...report, files: [...(report.files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) }
}

export async function fetchDepartmentReports(departmentId: string): Promise<DepartmentReportWithFiles[]> {
  const { data, error } = await supabase
    .from('department_reports')
    .select(REPORT_WITH_FILES)
    .eq('department_id', departmentId)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as DepartmentReportWithFiles[]).map(sortFiles)
}

// Últimos informes de todos los departamentos que el usuario puede ver (la
// RLS filtra), o de uno solo. Para la lista de Departamentos y el Inicio.
export async function fetchRecentDepartmentReports(limit = 5, departmentId?: string): Promise<DepartmentReport[]> {
  let query = supabase
    .from('department_reports')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (departmentId) query = query.eq('department_id', departmentId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DepartmentReport[]
}

export async function fetchDepartmentReport(id: string): Promise<DepartmentReportWithFiles | null> {
  const { data, error } = await supabase.from('department_reports').select(REPORT_WITH_FILES).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? sortFiles(data as DepartmentReportWithFiles) : null
}

export interface DepartmentReportInput {
  report_type: DepartmentReportType
  title: string
  body: string | null
  observations: string | null
  report_date: string
}

// id: lo elige la pantalla de antemano (borrador) para que reintentar un alta cuya
// respuesta se perdió choque con el primer intento (23505) y no lo duplique.
export async function createDepartmentReport(departmentId: string, input: DepartmentReportInput, id?: string): Promise<DepartmentReport> {
  const { data, error } = await supabase
    .from('department_reports')
    .insert({ ...(id ? { id } : {}), department_id: departmentId, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as DepartmentReport
}

// Sin permiso, PostgREST no encuentra fila para devolver (PGRST116), que
// describeSupabaseError traduce a "no tenés permisos".
export async function updateDepartmentReport(id: string, input: Partial<DepartmentReportInput>, expectedVersion?: number | null): Promise<DepartmentReport> {
  return updateVersioned<DepartmentReport>('department_reports', id, input, expectedVersion)
}

export async function setDepartmentReportArchived(id: string, archived: boolean): Promise<DepartmentReport> {
  const { data, error } = await supabase
    .from('department_reports')
    .update({ is_archived: archived })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DepartmentReport
}

// Primero los archivos, después la fila (los adjuntos se borran en cascada).
// En ese orden, si algo falla a mitad de camino se puede reintentar.
export async function deleteDepartmentReport(report: DepartmentReportWithFiles): Promise<void> {
  await removeDepartmentReportObjects(report.files.map((f) => f.storage_path))
  const { data, error } = await supabase.from('department_reports').delete().eq('id', report.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No tenés permiso para eliminar este informe.')
}

// Sube el archivo y registra el adjunto. Si el registro falla, intenta
// borrar el archivo recién subido (quien lo subió puede borrar un archivo
// propio todavía sin registrar).
export async function addDepartmentReportFile(
  report: Pick<DepartmentReport, 'id' | 'department_id'>,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<DepartmentReportFile> {
  const fileId = crypto.randomUUID()
  const path = buildDepartmentReportFilePath(report.department_id, report.id, fileId, file)
  const { contentType } = await uploadDepartmentReportObject(path, file, onProgress)

  const { data, error } = await supabase
    .from('department_report_files')
    .insert({
      id: fileId,
      report_id: report.id,
      department_id: report.department_id,
      storage_path: path,
      file_name: (file.name || 'archivo').slice(0, 255),
      mime_type: contentType,
      file_size: file.size,
      file_kind: contentType.startsWith('image/') ? 'imagen' : contentType.startsWith('video/') ? 'video' : 'documento',
    })
    .select('*')
    .single()

  if (error) {
    try {
      await removeDepartmentReportObjects([path])
    } catch (cleanupError) {
      console.warn('[SIGER4] No se pudo limpiar un adjunto no registrado:', cleanupError)
    }
    throw error
  }
  return data as DepartmentReportFile
}

export async function removeDepartmentReportFile(file: DepartmentReportFile): Promise<void> {
  await removeDepartmentReportObjects([file.storage_path])
  const { data, error } = await supabase.from('department_report_files').delete().eq('id', file.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No tenés permiso para quitar este archivo.')
}
