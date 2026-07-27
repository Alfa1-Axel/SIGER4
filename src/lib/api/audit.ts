import { supabase } from '../supabaseClient'

export interface AuditEntryInput {
  action: string
  tableName: string
  recordId?: string | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  reason?: string | null
}

// La mayoría de los cambios se auditan automáticamente vía triggers de PostgreSQL
// (ver supabase/migrations). Este helper es para eventos que no pasan por una
// tabla con trigger propio, como login/logout o generación de reportes.
export async function recordAuditEvent(input: AuditEntryInput): Promise<void> {
  const { data: authData } = await supabase.auth.getUser()
  const authUserId = authData.user?.id
  if (!authUserId) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single()

  await supabase.from('audit_logs').insert({
    actor_profile_id: profile?.id ?? null,
    action: input.action,
    table_name: input.tableName,
    record_id: input.recordId ?? null,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
  })
}
