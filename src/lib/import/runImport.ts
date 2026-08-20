import { supabase } from '../supabaseClient'
import { describeSupabaseError } from '../api/errors'
import { validateMappedRow } from './validateRow'
import type { ImportModule } from '../../types/database'
import type { ParsedSheet } from './parseFile'

const TABLE_BY_MODULE: Record<ImportModule, string> = {
  personal: 'personnel',
  vehiculos: 'vehicles',
  asistencias: 'attendance_summaries',
  inventario: 'inventory_items',
}

export interface PreviewRow {
  rowNumber: number
  raw: Record<string, string>
  mapped: Record<string, unknown>
  valid: boolean
  errors: string[]
}

export interface ImportPreview {
  rows: PreviewRow[]
  validCount: number
  invalidCount: number
}

interface StationRef {
  id: string
  name: string
  code: string
  region_id: string
}

// Construye la vista previa completa: mapea + valida cada fila, sin
// insertar nada todavía. Es lo único que corre entre "elegir archivo" y
// "confirmar importación" -- el usuario siempre ve esto antes de que se
// toque la base.
export function buildImportPreview(
  moduleKey: ImportModule,
  sheet: ParsedSheet,
  mapping: Record<string, string>,
  stations: StationRef[],
): ImportPreview {
  const stationsByName = new Map(stations.map((s) => [s.name.trim().toLowerCase(), s.id]))
  const stationsByCode = new Map(stations.map((s) => [s.code.trim().toLowerCase(), s.id]))
  const ctx = { stationsByName, stationsByCode }

  const rows: PreviewRow[] = sheet.rows.map((raw, index) => {
    const result = validateMappedRow(moduleKey, raw, mapping, ctx)
    return { rowNumber: index + 2, raw, mapped: result.mapped, valid: result.valid, errors: result.errors } // +2: fila 1 es encabezado
  })

  return {
    rows,
    validCount: rows.filter((r) => r.valid).length,
    invalidCount: rows.filter((r) => !r.valid).length,
  }
}

export interface ImportRunResult {
  batchId: string
  createdCount: number
  skippedCount: number
  errorCount: number
}

// Inserta fila por fila usando el cliente autenticado normal -- la RLS de
// la tabla destino (ya existente, sin cambios) decide sola si el usuario
// puede insertar cada fila según su alcance real (informática todo,
// secretario regional su región, jefe/usuario carga solo su cuartel). Si
// RLS rechaza una fila, queda registrada como error de esa fila puntual, sin
// abortar el resto del lote -- ni sin haber ni intentado "saltarse" el
// control de permisos de ninguna forma (nunca se usa service_role acá).
export async function runImport(
  moduleKey: ImportModule,
  fileName: string,
  preview: ImportPreview,
  mapping: Record<string, string>,
  createdByProfileId: string,
  fallbackRegionId: string | null,
): Promise<ImportRunResult> {
  const tableName = TABLE_BY_MODULE[moduleKey]
  const validRows = preview.rows.filter((r) => r.valid)

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      module: moduleKey,
      status: 'confirmado',
      file_name: fileName,
      total_rows: preview.rows.length,
      column_mapping: mapping,
      created_by_profile_id: createdByProfileId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (batchError) throw batchError
  const batchId = batch.id as string

  let createdCount = 0
  let skippedCount = 0
  let errorCount = 0

  // Filas inválidas de la vista previa quedan registradas como 'omitido' en
  // el historial del lote, sin intentar insertarlas -- el motivo exacto (de
  // la validación) queda guardado igual, para no perder la trazabilidad de
  // "por qué no se importó esta fila".
  const invalidRows = preview.rows.filter((r) => !r.valid)
  if (invalidRows.length > 0) {
    await supabase.from('import_batch_rows').insert(
      invalidRows.map((row) => ({
        batch_id: batchId,
        row_number: row.rowNumber,
        status: 'omitido' as const,
        raw_data: row.raw,
        error_message: row.errors.join(' '),
      })),
    )
    skippedCount = invalidRows.length
  }

  for (const row of validRows) {
    const payload: Record<string, unknown> = { ...row.mapped }
    if (moduleKey === 'inventario' && !payload.region_id) {
      payload.region_id = fallbackRegionId
    }

    const { data, error } = await supabase.from(tableName).insert(payload).select('id').single()

    if (error) {
      errorCount += 1
      await supabase.from('import_batch_rows').insert({
        batch_id: batchId,
        row_number: row.rowNumber,
        status: 'error',
        raw_data: row.raw,
        error_message: describeSupabaseError(error, 'No se pudo insertar esta fila.'),
      })
    } else {
      createdCount += 1
      await supabase.from('import_batch_rows').insert({
        batch_id: batchId,
        row_number: row.rowNumber,
        status: 'creado',
        raw_data: row.raw,
        target_record_id: (data as { id: string }).id,
      })
    }
  }

  await supabase
    .from('import_batches')
    .update({
      status: 'completado',
      created_count: createdCount,
      skipped_count: skippedCount,
      error_count: errorCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)

  return { batchId, createdCount, skippedCount, errorCount }
}
