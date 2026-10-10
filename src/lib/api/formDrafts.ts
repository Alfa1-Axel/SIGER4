import { supabase } from '../supabaseClient'

// Borradores de formularios guardados en el servidor (migración 0113). Cada
// persona ve solo los suyos (RLS). Un borrador no es un registro: no genera
// avisos ni aparece en listados, estadísticas o búsquedas.

export interface FormDraftRow {
  id: string
  form_key: string
  context_key: string
  record_id: string | null
  base_version: number | null
  client_record_id: string | null
  payload: Record<string, unknown>
  revision: number
  created_at: string
  updated_at: string
  expires_at: string
}

// Formularios que admiten borrador. La lista definitiva la fija la base
// (form_drafts_before_write); esto solo evita escribir claves sueltas.
export type DraftFormKey =
  | 'informe-departamento'
  | 'actividad-departamento'
  | 'documento'
  | 'aval-escuela'
  | 'ficha-punto'
  | 'verificacion-punto'

// El borrador vigente de esta persona para ese formulario y esa carga (los
// vencidos siguen en la tabla hasta que el job los purga, pero no se ofrecen).
export async function fetchFormDraft(formKey: DraftFormKey, contextKey: string): Promise<FormDraftRow | null> {
  const { data, error } = await supabase
    .from('form_drafts')
    .select('*')
    .eq('form_key', formKey)
    .eq('context_key', contextKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return (data as FormDraftRow | null) ?? null
}

export interface SaveFormDraftInput {
  formKey: DraftFormKey
  contextKey: string
  recordId: string | null
  clientRecordId: string | null
  baseVersion: number | null
  payload: Record<string, unknown>
  // Revisión que esta pantalla cree que tiene el borrador (0 = no hay ninguno).
  expectedRevision: number
}

export interface SavedFormDraft {
  revision: number
  updated_at: string
}

// Crea o actualiza el borrador. Si otra pestaña o dispositivo guardó antes (o
// el borrador ya se publicó), la base responde P0409 y no pisa nada.
export async function saveFormDraft(input: SaveFormDraftInput): Promise<SavedFormDraft> {
  const { data, error } = await supabase.rpc('save_form_draft', {
    p_form_key: input.formKey,
    p_context_key: input.contextKey,
    p_record_id: input.recordId,
    p_client_record_id: input.clientRecordId,
    p_base_version: input.baseVersion,
    p_payload: input.payload,
    p_expected_revision: input.expectedRevision,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as SavedFormDraft | undefined
  if (!row) throw new Error('El servidor no confirmó el guardado del borrador.')
  return row
}

export async function deleteFormDraft(formKey: DraftFormKey, contextKey: string): Promise<void> {
  const { error } = await supabase.from('form_drafts').delete().eq('form_key', formKey).eq('context_key', contextKey)
  if (error) throw error
}
