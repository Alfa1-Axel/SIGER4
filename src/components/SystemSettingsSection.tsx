import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  fetchSystemSettingsStatus,
  setSystemSetting,
  fetchWeeklyPushDiagnostics,
  fetchCronJobDiagnostics,
  type SystemSettingStatus,
  type WeeklyPushDiagnosticRow,
  type CronJobDiagnosticRow,
} from '../lib/api/systemSettings'
import { describeSupabaseError } from '../lib/api/errors'

const WEEKLY_JOB_NAME = 'siger4-weekly-reminder'

// Solo informatica_r4 (no integrante_informatica) -- coincide exactamente
// con is_super_admin() del lado del servidor (set_system_setting() lo exige
// server-side de todos modos; este gate del lado de la UI es solo para no
// mostrar un formulario que el backend va a rechazar).
//
// Por qué esta sección existe: system_settings (migración 0073) reemplaza
// current_setting('siger4.*'), que dependía de un GUC de base
// (`alter database postgres set siger4.project_url = ...`) que el SQL
// Editor de Supabase no puede configurar (permission denied: requiere
// superusuario). set_system_setting() tampoco se puede invocar desde el SQL
// Editor por el mismo motivo del otro lado: ahí auth.uid() es null (sin JWT
// de sesión real), así que is_super_admin() nunca resuelve aunque el usuario
// real de la app sea informatica_r4. Esta UI llama a la misma RPC pero bajo
// la sesión real del usuario logueado en el navegador -- auth.uid() sí
// resuelve acá, así que es el único lugar donde esto funciona.
export function SystemSettingsSection() {
  const [settings, setSettings] = useState<SystemSettingStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [projectUrl, setProjectUrl] = useState('')
  const [savingProjectUrl, setSavingProjectUrl] = useState(false)
  const [projectUrlError, setProjectUrlError] = useState<string | null>(null)
  const [projectUrlSaved, setProjectUrlSaved] = useState(false)

  const [cronSecretInput, setCronSecretInput] = useState('')
  const [savingCronSecret, setSavingCronSecret] = useState(false)
  const [cronSecretError, setCronSecretError] = useState<string | null>(null)
  const [cronSecretSaved, setCronSecretSaved] = useState(false)

  const [checkingDiagnostics, setCheckingDiagnostics] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [reminderDiagnostics, setReminderDiagnostics] = useState<WeeklyPushDiagnosticRow[] | null>(null)
  const [adminSummaryDiagnostics, setAdminSummaryDiagnostics] = useState<WeeklyPushDiagnosticRow[] | null>(null)
  const [cronDiagnostics, setCronDiagnostics] = useState<CronJobDiagnosticRow[] | null>(null)

  async function reload() {
    setLoadError(null)
    try {
      const data = await fetchSystemSettingsStatus()
      setSettings(data)
      const projectUrlRow = data.find((s) => s.key === 'project_url')
      if (projectUrlRow?.value) setProjectUrl((prev) => prev || projectUrlRow.value!)
    } catch (err) {
      setLoadError(describeSupabaseError(err, 'No pudimos cargar la configuración del sistema.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const cronSecretRow = settings.find((s) => s.key === 'cron_shared_secret')

  async function handleSaveProjectUrl(event: FormEvent) {
    event.preventDefault()
    if (!projectUrl.trim()) return
    setSavingProjectUrl(true)
    setProjectUrlError(null)
    setProjectUrlSaved(false)
    try {
      await setSystemSetting('project_url', projectUrl.trim(), false)
      setProjectUrlSaved(true)
      await reload()
    } catch (err) {
      setProjectUrlError(describeSupabaseError(err, 'No pudimos guardar project_url.'))
    } finally {
      setSavingProjectUrl(false)
    }
  }

  async function handleSaveCronSecret(event: FormEvent) {
    event.preventDefault()
    if (!cronSecretInput.trim()) return
    setSavingCronSecret(true)
    setCronSecretError(null)
    setCronSecretSaved(false)
    try {
      await setSystemSetting('cron_shared_secret', cronSecretInput.trim(), true)
      setCronSecretSaved(true)
      setCronSecretInput('')
      await reload()
    } catch (err) {
      setCronSecretError(describeSupabaseError(err, 'No pudimos guardar cron_shared_secret.'))
    } finally {
      setSavingCronSecret(false)
    }
  }

  async function handleCheckDiagnostics() {
    setCheckingDiagnostics(true)
    setDiagnosticsError(null)
    try {
      const [reminder, adminSummary, cronJob] = await Promise.all([
        fetchWeeklyPushDiagnostics('recordatorio_semanal'),
        fetchWeeklyPushDiagnostics('alerta_admin'),
        fetchCronJobDiagnostics(WEEKLY_JOB_NAME),
      ])
      setReminderDiagnostics(reminder)
      setAdminSummaryDiagnostics(adminSummary)
      setCronDiagnostics(cronJob)
    } catch (err) {
      setDiagnosticsError(describeSupabaseError(err, 'No pudimos consultar el diagnóstico de push.'))
    } finally {
      setCheckingDiagnostics(false)
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function summarize(rows: WeeklyPushDiagnosticRow[] | null): string {
    if (rows === null) return ''
    if (rows.length === 0) return 'Sin notificaciones en los últimos 7 días.'
    const attempted = rows.filter((r) => r.pushAttempted).length
    const sent = rows.filter((r) => (r.pushSentCount ?? 0) > 0).length
    return `${rows.length} notificación${rows.length === 1 ? '' : 'es'} interna${rows.length === 1 ? '' : 's'} · ${attempted} con push intentado · ${sent} con push realmente enviado a algún dispositivo.`
  }

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">Configuración del sistema (informática)</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Datos que necesitan las tareas automáticas (recordatorio semanal, resumen administrativo,
          purga de documentos) para poder disparar el push real. No se pueden configurar desde el SQL
          Editor de Supabase (no tiene tu sesión real) — se guardan acá, bajo tu usuario.
        </p>

        {loading && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Cargando…</p>}
        {loadError && <p className="field-error">{loadError}</p>}

        {!loading && !loadError && (
          <>
            <form onSubmit={handleSaveProjectUrl} className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="projectUrl">URL del proyecto (project_url)</label>
              <input
                id="projectUrl"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://tu-proyecto.supabase.co"
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 8px' }}>
                No es un dato secreto (viaja igual en cada request). Estado actual:{' '}
                {settings.find((s) => s.key === 'project_url')?.configured ? 'configurado' : 'sin configurar'}.
              </p>
              <button type="submit" className="btn btn-outlined" disabled={savingProjectUrl || !projectUrl.trim()}>
                {savingProjectUrl ? 'Guardando…' : 'Guardar project_url'}
              </button>
              {projectUrlError && <p className="field-error" style={{ marginTop: 8 }}>{projectUrlError}</p>}
              {projectUrlSaved && (
                <p style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 8 }}>Guardado correctamente.</p>
              )}
            </form>

            <form onSubmit={handleSaveCronSecret} className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="cronSecret">Secreto compartido de cron (cron_shared_secret)</label>
              <div
                className={`badge ${cronSecretRow?.configured ? 'badge-success' : 'badge-warning'}`}
                style={{ marginBottom: 8, display: 'inline-flex' }}
              >
                {cronSecretRow?.configured ? 'Configurado' : 'Sin configurar'}
              </div>
              <input
                id="cronSecret"
                type="password"
                value={cronSecretInput}
                onChange={(e) => setCronSecretInput(e.target.value)}
                placeholder={cronSecretRow?.configured ? 'Dejar en blanco para no cambiarlo — escribí uno nuevo para reemplazarlo' : 'Pegá acá el mismo valor que configuraste como CRON_SHARED_SECRET'}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 8px' }}>
                Nunca se muestra el valor guardado, ni siquiera acá — solo si está configurado o no.
                Tiene que ser exactamente el mismo string que el secreto <code>CRON_SHARED_SECRET</code>{' '}
                de la Edge Function <code>send-push-system</code> (<code>npx supabase secrets set
                CRON_SHARED_SECRET="..."</code>).
              </p>
              <button type="submit" className="btn btn-outlined" disabled={savingCronSecret || !cronSecretInput.trim()}>
                {savingCronSecret ? 'Guardando…' : 'Guardar secreto'}
              </button>
              {cronSecretError && <p className="field-error" style={{ marginTop: 8 }}>{cronSecretError}</p>}
              {cronSecretSaved && (
                <p style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 8 }}>Guardado correctamente.</p>
              )}
            </form>
          </>
        )}
      </div>

      <div className="section-header">
        <h2 className="section-title">Diagnóstico de push semanal (informática)</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Confirma, para el recordatorio semanal y el resumen administrativo de los últimos 7 días, si
          el job de cron corrió, si se creó la notificación interna, y si esa notificación llegó a
          intentar el push real.
        </p>
        <button type="button" className="btn btn-outlined btn-block" disabled={checkingDiagnostics} onClick={() => void handleCheckDiagnostics()}>
          {checkingDiagnostics ? 'Consultando…' : 'Revisar últimos 7 días'}
        </button>
        {diagnosticsError && <p className="field-error" style={{ marginTop: 8 }}>{diagnosticsError}</p>}

        {cronDiagnostics !== null && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <p style={{ marginBottom: 4 }}>
              <strong>Job de cron ({WEEKLY_JOB_NAME}):</strong>{' '}
              {!cronDiagnostics[0]?.jobExists
                ? 'no está programado en pg_cron — la migración 0036 no llegó a crearlo, o fue eliminado.'
                : `programado (${cronDiagnostics[0].schedule}), ${cronDiagnostics[0].active ? 'activo' : 'desactivado'}.`}
            </p>
            {cronDiagnostics[0]?.jobExists && cronDiagnostics[0]?.runStart === null && (
              <p style={{ color: 'var(--color-warning)' }}>
                El job existe pero no tiene ninguna corrida registrada todavía — puede ser normal si se
                creó hace menos de una semana.
              </p>
            )}
            {cronDiagnostics[0]?.jobExists && cronDiagnostics[0]?.runStart !== null && (
              <p style={{ marginBottom: 4 }}>
                Última corrida: {formatDateTime(cronDiagnostics[0].runStart)} —{' '}
                <span style={{ color: cronDiagnostics[0].runStatus === 'succeeded' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {cronDiagnostics[0].runStatus ?? '—'}
                </span>
                {cronDiagnostics[0].runStatus !== 'succeeded' && cronDiagnostics[0].runMessage && ` (${cronDiagnostics[0].runMessage})`}
              </p>
            )}
          </div>
        )}

        {reminderDiagnostics !== null && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <p style={{ marginBottom: 4 }}>
              <strong>Recordatorio semanal general:</strong> {summarize(reminderDiagnostics)}
            </p>
            <p>
              <strong>Resumen semanal administrativo:</strong> {summarize(adminSummaryDiagnostics)}
            </p>
            <p style={{ marginTop: 8 }}>
              <strong>Motivo probable:</strong> {probableCause()}
            </p>
          </div>
        )}
      </div>
    </>
  )

  // Combina las tres fuentes (job de cron, notificación interna, push) en un
  // único diagnóstico legible -- el objetivo es que informática no tenga que
  // interpretar las tres tablas a mano para saber qué falló.
  function probableCause(): string {
    if (cronDiagnostics && !cronDiagnostics[0]?.jobExists) {
      return 'El job de cron no está programado — correr la migración 0036 (o confirmar que pg_cron/pg_net estén habilitados en el Dashboard de Supabase).'
    }
    if (cronDiagnostics?.[0]?.jobExists && cronDiagnostics[0].active === false) {
      return 'El job de cron existe pero está desactivado — reactivarlo con cron.alter_job (jobid, active := true).'
    }
    if (cronDiagnostics?.[0]?.runStatus && cronDiagnostics[0].runStatus !== 'succeeded') {
      return `La última corrida del job falló (${cronDiagnostics[0].runStatus}) — revisar ${cronDiagnostics[0].runMessage ?? 'los logs de Postgres'}.`
    }
    if (reminderDiagnostics?.length === 0) {
      return 'El job corrió pero no se creó ninguna notificación interna — revisá si hay perfiles activos con weekly_reminder_enabled=true.'
    }
    if (reminderDiagnostics?.some((r) => !r.pushAttempted)) {
      return 'La notificación interna se creó pero el push nunca se intentó — falta configurar project_url/cron_shared_secret arriba (revisá también si llegó una alerta "push no configurado" en Notificaciones).'
    }
    if (reminderDiagnostics?.some((r) => r.pushAttempted && r.pushStatus === 'error')) {
      return 'El push se intentó pero la Edge Function respondió error — revisar push_error_message en la tabla o los logs de send-push-system.'
    }
    if (reminderDiagnostics?.every((r) => r.pushAttempted && (r.pushSentCount ?? 0) === 0)) {
      return 'El push se intentó y la Edge Function respondió ok, pero no había suscripciones push activas para ese usuario (nunca aceptó permisos de notificación en el navegador) — la notificación interna sí debería estar visible en /notificaciones.'
    }
    return 'Sin problemas detectados en las últimas corridas — si igual no llegó, revisá manualmente el perfil puntual (weekly_reminder_enabled, push_subscriptions).'
  }
}
