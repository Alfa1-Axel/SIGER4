import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  fetchSystemSettingsStatus,
  setSystemSetting,
  fetchWeeklyPushDiagnostics,
  type SystemSettingStatus,
  type WeeklyPushDiagnosticRow,
} from '../lib/api/systemSettings'
import { describeSupabaseError } from '../lib/api/errors'

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
      const [reminder, adminSummary] = await Promise.all([
        fetchWeeklyPushDiagnostics('recordatorio_semanal'),
        fetchWeeklyPushDiagnostics('alerta_admin'),
      ])
      setReminderDiagnostics(reminder)
      setAdminSummaryDiagnostics(adminSummary)
    } catch (err) {
      setDiagnosticsError(describeSupabaseError(err, 'No pudimos consultar el diagnóstico de push.'))
    } finally {
      setCheckingDiagnostics(false)
    }
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
          cada notificación interna llegó a intentar el push real (no solo si se creó la notificación).
        </p>
        <button type="button" className="btn btn-outlined btn-block" disabled={checkingDiagnostics} onClick={() => void handleCheckDiagnostics()}>
          {checkingDiagnostics ? 'Consultando…' : 'Revisar últimos 7 días'}
        </button>
        {diagnosticsError && <p className="field-error" style={{ marginTop: 8 }}>{diagnosticsError}</p>}
        {reminderDiagnostics !== null && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <p style={{ marginBottom: 4 }}>
              <strong>Recordatorio semanal general:</strong> {summarize(reminderDiagnostics)}
            </p>
            <p>
              <strong>Resumen semanal administrativo:</strong> {summarize(adminSummaryDiagnostics)}
            </p>
            {(reminderDiagnostics.some((r) => !r.pushAttempted) || adminSummaryDiagnostics?.some((r) => !r.pushAttempted)) && (
              <p style={{ marginTop: 8, color: 'var(--color-warning)' }}>
                Hay notificaciones internas sin ningún intento de push registrado — revisá que
                project_url/cron_shared_secret estén configurados arriba.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
