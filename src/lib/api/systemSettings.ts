import { supabase } from '../supabaseClient'
import type { NotificationType } from '../../types/database'

// system_settings (migración 0073) reemplaza current_setting('siger4.*'),
// que dependía de un GUC de base que el SQL Editor de Supabase no puede
// configurar (permission denied: requiere superusuario). set_system_setting()
// es la única forma soportada de escribir: exige is_super_admin() (solo
// informatica_r4) del lado del servidor, usando la sesión real del usuario
// -- por eso este helper solo tiene sentido llamado desde una sesión
// autenticada de la app, nunca desde el SQL Editor (ahí auth.uid() es null).
export interface SystemSettingStatus {
  key: string
  configured: boolean
  isSecret: boolean
  // Solo presente para claves no-secretas (ej. project_url) -- nunca se pide
  // ni se devuelve el valor real de una clave con isSecret=true.
  value: string | null
  updatedAt: string | null
}

// Usa list_system_settings_status() (RPC, migración 0074) en vez de un
// select directo a system_settings: aunque RLS ya protege la tabla (solo
// is_super_admin() puede leerla), un select directo traería "value" en la
// respuesta HTTP para TODAS las columnas antes de que el cliente decida
// descartarlo -- el secreto viajaría en texto plano por la red aunque
// después no se muestre en pantalla. La RPC nunca incluye el valor real de
// una clave is_secret=true en su resultado, así que no hay nada que
// descartar del lado del cliente.
interface SystemSettingStatusRow {
  key: string
  is_secret: boolean
  configured: boolean
  value: string | null
  updated_at: string
}

export async function fetchSystemSettingsStatus(): Promise<SystemSettingStatus[]> {
  const { data, error } = await supabase.rpc('list_system_settings_status')
  if (error) throw error
  return ((data ?? []) as SystemSettingStatusRow[]).map((row) => ({
    key: row.key,
    configured: row.configured,
    isSecret: row.is_secret,
    value: row.value,
    updatedAt: row.updated_at,
  }))
}

export async function setSystemSetting(key: string, value: string, isSecret: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_system_setting', {
    p_key: key,
    p_value: value,
    p_is_secret: isSecret,
  })
  if (error) throw error
}

export interface WeeklyPushDiagnosticRow {
  notificationId: string
  profileId: string | null
  notificationCreatedAt: string
  pushAttempted: boolean
  pushStatus: string | null
  pushSentCount: number | null
  pushRecipientsCount: number | null
  pushErrorMessage: string | null
}

// Cruza notifications (¿se creó la notificación interna?) contra
// push_send_log (¿se intentó/logró el push real vía send-push-system?) --
// la única forma confiable de distinguir "solo se creó la notificación
// interna, el push nunca se disparó" (project_url/cron_shared_secret mal
// configurados, o pg_net caído) de "todo funcionó". Ver
// get_weekly_push_diagnostics() (migración 0074).
interface WeeklyPushDiagnosticApiRow {
  notification_id: string
  profile_id: string | null
  notification_created_at: string
  push_attempted: boolean
  push_status: string | null
  push_sent_count: number | null
  push_recipients_count: number | null
  push_error_message: string | null
}

export async function fetchWeeklyPushDiagnostics(
  notificationType: NotificationType,
  sinceIso?: string,
): Promise<WeeklyPushDiagnosticRow[]> {
  const { data, error } = await supabase.rpc('get_weekly_push_diagnostics', {
    p_notification_type: notificationType,
    ...(sinceIso ? { p_since: sinceIso } : {}),
  })
  if (error) throw error
  return ((data ?? []) as WeeklyPushDiagnosticApiRow[]).map((row) => ({
    notificationId: row.notification_id,
    profileId: row.profile_id,
    notificationCreatedAt: row.notification_created_at,
    pushAttempted: row.push_attempted,
    pushStatus: row.push_status,
    pushSentCount: row.push_sent_count,
    pushRecipientsCount: row.push_recipients_count,
    pushErrorMessage: row.push_error_message,
  }))
}

export interface CronJobDiagnosticRow {
  jobExists: boolean
  schedule: string | null
  active: boolean | null
  runStart: string | null
  runEnd: string | null
  runStatus: string | null
  runMessage: string | null
}

interface CronJobDiagnosticApiRow {
  job_exists: boolean
  schedule: string | null
  active: boolean | null
  run_start: string | null
  run_end: string | null
  run_status: string | null
  run_message: string | null
}

// Complementa a fetchWeeklyPushDiagnostics(): esa función solo puede
// responder sobre lo que ya quedó en notifications/push_send_log -- si el
// job de pg_cron nunca corrió (no está programado, o corrió pero
// send_weekly_reminder() lanzó una excepción antes de insertar nada),
// fetchWeeklyPushDiagnostics() devuelve 0 filas, indistinguible de "no había
// nada que notificar esa semana". Esta consulta cron.job/cron.job_run_details
// directamente (ver get_cron_job_diagnostics(), migración 0080) para
// responder sin ambigüedad si el job existe, está activo, y cuándo/cómo
// corrieron sus últimas ejecuciones reales.
export async function fetchCronJobDiagnostics(jobName: string): Promise<CronJobDiagnosticRow[]> {
  const { data, error } = await supabase.rpc('get_cron_job_diagnostics', { p_job_name: jobName })
  if (error) throw error
  return ((data ?? []) as CronJobDiagnosticApiRow[]).map((row) => ({
    jobExists: row.job_exists,
    schedule: row.schedule,
    active: row.active,
    runStart: row.run_start,
    runEnd: row.run_end,
    runStatus: row.run_status,
    runMessage: row.run_message,
  }))
}
