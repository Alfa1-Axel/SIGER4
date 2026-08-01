import { supabase } from '../supabaseClient'

export interface AuditEntryInput {
  action: string
  tableName: string
  recordId?: string | null
  newValue?: Record<string, unknown> | null
  reason?: string | null
}

// La mayoría de los cambios se auditan automáticamente vía triggers de PostgreSQL
// (ver supabase/migrations). Este helper es para eventos que no pasan por una
// tabla con trigger propio (hoy: "reporte generado"). Usa la RPC
// record_manual_audit_event en vez de insertar directo en audit_logs: esa RPC
// fuerza el actor real (current_profile_id(), no lo que mande el cliente) y
// restringe table_name/action a un allowlist fijo, para que nadie pueda
// falsificar bitácora de otras tablas o de otro usuario (ver migración
// 0030_audit_logs_controlled_insert.sql).
export async function recordAuditEvent(input: AuditEntryInput): Promise<void> {
  const { error } = await supabase.rpc('record_manual_audit_event', {
    p_action: input.action,
    p_table_name: input.tableName,
    p_record_id: input.recordId ?? null,
    p_new_value: input.newValue ?? null,
    p_reason: input.reason ?? null,
  })
  if (error) throw error
}
