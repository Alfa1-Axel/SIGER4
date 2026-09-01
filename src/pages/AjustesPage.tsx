import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ContactLink } from '../components/ui/ContactLink'
import { ImagePicker } from '../components/ui/ImagePicker'
import { SystemSettingsSection } from '../components/SystemSettingsSection'
import { useAuth } from '../hooks/useAuth'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { ROLE_DEFINITIONS } from '../types/roles'
import { updateProfile } from '../lib/api/users'
import { deleteAvatar, uploadAvatar } from '../lib/api/storage'
import { createNotification } from '../lib/api/notifications'
import {
  fetchOwnPushDiagnostics,
  fetchOwnPushSubscriptionCount,
  fetchPushSubscriptionsAdminDiagnostics,
  fetchPushSubscriptionCountsByProfile,
  fetchPushInfraDiagnostics,
  testPushDispatcherAuth,
} from '../lib/api/pushSubscriptions'
import type {
  OwnPushDiagnosticRow,
  PushSubscriptionAdminDiagnosticRow,
  PushSubscriptionCountByProfileRow,
  PushInfraDiagnostics,
  PushDispatcherAuthTestResult,
} from '../lib/api/pushSubscriptions'
import { supabase } from '../lib/supabaseClient'
import { describeSupabaseError } from '../lib/api/errors'
import { readLastPushDiagnostic } from '../lib/pushDiagnosticLocal'
import type { PushDiagnosticRecord } from '../lib/pushDiagnosticLocal'

// Cuanto esperar entre reintentos de lectura de push_send_log al probar el
// push server-side: pg_net (dispatch_notification_push, migracion 0085) es
// fire-and-forget desde el trigger -- el insert en notifications ya volvió
// antes de que el push real termine de enviarse, así que hay que darle un
// margen real antes de leer el resultado, no asumir que ya está listo
// apenas createNotification() devuelve.
const PUSH_DIAGNOSTIC_POLL_DELAYS_MS = [800, 1200, 2000]

// notification_scope (0093): de donde viene el alcance de cada notificación
// en el diagnóstico -- antes el panel solo mostraba notificaciones
// personales (profile_id puntual), dejando ciegas casi todas las
// notificaciones reales de módulos (calendario/préstamos/cambios de
// estado), que en su mayoría usan scope territorial.
const SCOPE_LABELS: Record<string, string> = {
  personal: 'personal',
  cuartel: 'todo tu cuartel',
  subsede: 'toda tu subsede',
  region: 'toda tu región',
  sin_alcance: 'sin alcance',
}

// Un 401 puede venir de dos lugares completamente distintos, y ningún
// cambio de cron_shared_secret arregla el que no corresponde:
//   - GATEWAY de Supabase Edge Functions (verify_jwt=true, el valor por
//     defecto si la función se desplegó sin --no-verify-jwt): rechaza la
//     request ANTES de ejecutar nuestro código, porque pg_net nunca manda
//     un JWT (solo x-cron-secret). Body típico: {"code":401,"message":
//     "Missing authorization header"} o "Invalid JWT".
//   - NUESTRO CÓDIGO (send-push-system/index.ts): x-cron-secret no
//     coincide con CRON_SHARED_SECRET. Body: {"sent":0,"error":"No
//     autorizado."} -- nunca dice "message" ni menciona JWT.
// Se distingue por el CONTENIDO del body, no solo por el status_code
// (ambos casos dan 401) -- ver get_push_infra_diagnostics()/
// test_push_dispatcher_auth() (migración 0092).
function looksLikeGatewayRejection(body: string | null): boolean {
  if (!body) return false
  const lower = body.toLowerCase()
  return (
    lower.includes('missing authorization') ||
    lower.includes('invalid jwt') ||
    lower.includes('invalid claim') ||
    lower.includes('jwt expired') ||
    lower.includes('"message"')
  )
}

// Interpreta el resultado consolidado de get_push_infra_diagnostics()
// (0089) en un mensaje accionable en vez de mostrar el número de status
// HTTP pelado -- antes de esto, un HTTP 401 ya registrado en
// last_response_status_code no se distinguía de "todavía no hay
// respuesta" (ambos caían en el mismo texto genérico "sin resultado").
function describePushInfraStatus(infra: PushInfraDiagnostics): { message: string; action?: string } | null {
  if (infra.recent_requests_count === 0) {
    return { message: 'El trigger no llamó a pg_net en los últimos 7 días (sin notificaciones recientes, o project_url/cron_shared_secret faltaban en ese momento).' }
  }
  if (infra.recent_responses_count === 0 || infra.recent_responses_count == null) {
    return {
      message: 'pg_net todavía no registró respuesta para las llamadas recientes.',
      action: 'Puede ser una demora normal (unos segundos) o que pg_net esté atascado -- revisar la extensión desde el Dashboard de Supabase, o usar "Probar autorización" abajo para un chequeo inmediato.',
    }
  }
  const status = infra.last_response_status_code
  // Prefijo "(histórico)" cuando la última respuesta tiene más de 15 minutos
  // (0093, last_response_is_historical) -- evita que un error viejo ya
  // corregido (ej. el 401 de JWT antes del fix de --no-verify-jwt) se lea
  // como si fuera el problema vigente ahora mismo.
  const prefix = infra.last_response_is_historical ? '(Histórico, no necesariamente vigente) ' : ''
  if (status === 401 && looksLikeGatewayRejection(infra.last_response_body)) {
    return {
      message: prefix + 'HTTP 401 del GATEWAY de Supabase, no de nuestro código: send-push-system exige un JWT válido y pg_net nunca lo manda (solo x-cron-secret).',
      action: 'Redesplegar con: npx supabase functions deploy send-push-system --no-verify-jwt. Ningún cambio en cron_shared_secret va a arreglar esto.',
    }
  }
  if (status === 401) {
    return {
      message: prefix + 'La Edge Function rechazó la llamada: secreto incorrecto o desincronizado.',
      action: 'Verificá que system_settings.cron_shared_secret (Configuración del sistema, abajo) y el Edge Secret CRON_SHARED_SECRET de send-push-system sean exactamente iguales -- cuidado con espacios o saltos de línea al pegarlos. Usá "Probar autorización" abajo para confirmar sin esperar al próximo insert.',
    }
  }
  if (status === 404) {
    return { message: prefix + 'La Edge Function no existe o no está desplegada.', action: 'Ejecutar: npx supabase functions deploy send-push-system' }
  }
  if (status === 500) {
    return { message: prefix + 'La Edge Function falló internamente.', action: 'Revisar logs de send-push-system en el Dashboard de Supabase (probablemente faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/SUPABASE_SERVICE_ROLE_KEY).' }
  }
  if (status != null && status >= 200 && status < 300) {
    return { message: `${prefix}La última llamada respondió correctamente (HTTP ${status}).` }
  }
  if (status != null) {
    return { message: `${prefix}La última llamada respondió con HTTP ${status} -- revisar logs de send-push-system.` }
  }
  return null
}

export function AjustesPage() {
  const { profile, user, roles, isAdmin, hasRole, signOut, refreshProfile } = useAuth()
  const push = usePushNotifications(profile?.id)
  const [clearingCache, setClearingCache] = useState(false)
  const [clearCacheError, setClearCacheError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [position, setPosition] = useState(profile?.position ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const [testingNotification, setTestingNotification] = useState(false)
  const [testNotificationResult, setTestNotificationResult] = useState<'ok' | 'error' | null>(null)
  const [testPushResult, setTestPushResult] = useState<
    { ok: boolean; attempted: boolean; sent: number; recipients: number; error?: string; notificationId?: string } | null
  >(null)

  const [localPushDiagnostic, setLocalPushDiagnostic] = useState<PushDiagnosticRecord | null>(null)
  const [localPushDiagnosticLoaded, setLocalPushDiagnosticLoaded] = useState(false)

  const [pushDiagnosticsOpen, setPushDiagnosticsOpen] = useState(false)
  const [loadingPushDiagnostics, setLoadingPushDiagnostics] = useState(false)
  const [pushDiagnosticsError, setPushDiagnosticsError] = useState<string | null>(null)
  const [pushSubscriptionCount, setPushSubscriptionCount] = useState<number | null>(null)
  const [pushDiagnosticsRows, setPushDiagnosticsRows] = useState<OwnPushDiagnosticRow[]>([])
  const [pushSubscriptionsAdmin, setPushSubscriptionsAdmin] = useState<PushSubscriptionAdminDiagnosticRow[]>([])
  const [pushSubscriptionCountsByProfile, setPushSubscriptionCountsByProfile] = useState<PushSubscriptionCountByProfileRow[]>([])
  const [pushInfraDiagnostics, setPushInfraDiagnostics] = useState<PushInfraDiagnostics | null>(null)
  const [runningAuthTest, setRunningAuthTest] = useState(false)
  const [authTestError, setAuthTestError] = useState<string | null>(null)
  const [authTestResult, setAuthTestResult] = useState<PushDispatcherAuthTestResult | null>(null)

  const [savingWeeklyReminder, setSavingWeeklyReminder] = useState(false)
  const [weeklyReminderError, setWeeklyReminderError] = useState<string | null>(null)

  const [savingWeeklyAdminSummary, setSavingWeeklyAdminSummary] = useState(false)
  const [weeklyAdminSummaryError, setWeeklyAdminSummaryError] = useState<string | null>(null)

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setProfileError(null)
    setProfileSaved(false)
    setSavingProfile(true)
    try {
      let avatarUrl = profile.avatar_url
      if (avatarFile) {
        const previousAvatarUrl = profile.avatar_url
        avatarUrl = await uploadAvatar(profile.id, avatarFile)
        await deleteAvatar(previousAvatarUrl)
      }
      await updateProfile(profile.id, {
        full_name: fullName,
        phone: phone || null,
        position: position || null,
        avatar_url: avatarUrl,
      })
      await refreshProfile()
      setProfileSaved(true)
    } catch (err) {
      setProfileError(describeSupabaseError(err, 'No pudimos guardar tus datos.'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleToggleWeeklyReminder() {
    if (!profile) return
    setWeeklyReminderError(null)
    setSavingWeeklyReminder(true)
    try {
      await updateProfile(profile.id, { weekly_reminder_enabled: !profile.weekly_reminder_enabled })
      await refreshProfile()
    } catch (err) {
      setWeeklyReminderError(describeSupabaseError(err, 'No pudimos guardar el cambio.'))
    } finally {
      setSavingWeeklyReminder(false)
    }
  }

  async function handleToggleWeeklyAdminSummary() {
    if (!profile) return
    setWeeklyAdminSummaryError(null)
    setSavingWeeklyAdminSummary(true)
    try {
      await updateProfile(profile.id, { weekly_admin_summary_enabled: !profile.weekly_admin_summary_enabled })
      await refreshProfile()
    } catch (err) {
      setWeeklyAdminSummaryError(describeSupabaseError(err, 'No pudimos guardar el cambio.'))
    } finally {
      setSavingWeeklyAdminSummary(false)
    }
  }

  async function handleTestNotification() {
    if (!profile) return
    setTestingNotification(true)
    setTestNotificationResult(null)
    setTestPushResult(null)
    try {
      // Se inserta directo (no via recordAuditEvent): notifications ya tiene
      // su propio trigger de auditoria automatico (audit_row_change, ver
      // 0004_audit_triggers.sql), asi que esto ya queda registrado en
      // audit_logs sin ensuciar nada extra. profile_id = uno mismo: nunca es
      // un broadcast. Desde la migracion 0085, el push real lo dispara
      // trg_dispatch_notification_push server-side (pg_net -> send-push-
      // system) con este mismo insert -- este boton YA NO llama a send-push
      // desde el cliente: prueba EXACTAMENTE el mismo camino que usaría
      // cualquier notificación con la PWA cerrada, no un atajo client-side
      // que podría funcionar aunque el trigger estuviera roto.
      const notification = await createNotification({
        type: 'prueba',
        title: 'Notificación de prueba',
        body: 'Si ves esto, las notificaciones internas funcionan correctamente.',
        profile_id: profile.id,
      })
      setTestNotificationResult('ok')

      for (const delayMs of PUSH_DIAGNOSTIC_POLL_DELAYS_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))
        const rows = await fetchOwnPushDiagnostics(5)
        const row = rows.find((r) => r.notification_id === notification.id)
        if (row?.push_attempted) {
          // "ok" exige status distinto de 'error' Y ausencia de error_message:
          // push_send_log.status se queda en 'ok' aunque haya fallas
          // PARCIALES de entrega (ver send-push-system/index.ts,
          // deliveryErrors) -- confiar solo en push_status ocultaría un envío
          // parcialmente fallido detrás de un resultado "exitoso".
          const hasPartialError = Boolean(row.push_error_message)
          setTestPushResult({
            ok: row.push_status !== 'error' && !hasPartialError,
            attempted: true,
            sent: row.push_sent_count ?? 0,
            recipients: row.push_recipients_count ?? 0,
            error: row.push_error_message ?? undefined,
            notificationId: notification.id,
          })
          break
        }
        setTestPushResult({ ok: false, attempted: false, sent: 0, recipients: 0, notificationId: notification.id })
      }

      // Refresca el panel de diagnóstico (si está abierto) para que la
      // prueba recién hecha aparezca sin tener que cerrarlo y reabrirlo.
      if (pushDiagnosticsOpen) void handleLoadPushDiagnostics()
      // Re-lee el diagnóstico local del SW: si la pestaña sigue en primer
      // plano, el evento 'push' puede llegar a procesarse durante el poll
      // de arriba y dejar un registro nuevo en IndexedDB.
      void loadLocalPushDiagnostic()
    } catch {
      setTestNotificationResult('error')
    } finally {
      setTestingNotification(false)
    }
  }

  // Diagnostico local del service worker (IndexedDB, ver src/sw.ts) -- se
  // carga solo, sin esperar a que el usuario abra "Ver diagnóstico de push":
  // es lo único que puede responder "¿el push que el backend dice haber
  // enviado realmente llegó a ESTE dispositivo?", y el usuario común
  // también debe poder verlo (a diferencia del resto del diagnóstico
  // técnico, esto no expone infraestructura del servidor -- ver sección 2
  // del pedido).
  async function loadLocalPushDiagnostic() {
    const record = await readLastPushDiagnostic()
    setLocalPushDiagnostic(record)
    setLocalPushDiagnosticLoaded(true)
  }

  useEffect(() => {
    void loadLocalPushDiagnostic()
  }, [])

  async function handleLoadPushDiagnostics() {
    if (!profile) return
    setLoadingPushDiagnostics(true)
    setPushDiagnosticsError(null)
    try {
      // Las funciones "admin" (endpoint/perfil vinculado de TODOS los
      // usuarios) solo se piden si isAdmin -- la RPC ya las restringe
      // server-side, pero evitamos la llamada innecesaria para el resto.
      // get_push_infra_diagnostics() exige is_super_admin() (solo
      // informatica_r4, NI SIQUIERA integrante_informatica -- mismo
      // criterio que list_system_settings_status/set_system_setting,
      // project_url/cron_shared_secret son datos de infraestructura), asi
      // que se pide aparte con hasRole('informatica_r4'), no isAdmin.
      const canSeeInfra = hasRole('informatica_r4')
      const [count, rows, adminRows, adminCounts, infra] = await Promise.all([
        fetchOwnPushSubscriptionCount(),
        fetchOwnPushDiagnostics(10),
        isAdmin ? fetchPushSubscriptionsAdminDiagnostics() : Promise.resolve([]),
        isAdmin ? fetchPushSubscriptionCountsByProfile() : Promise.resolve([]),
        canSeeInfra ? fetchPushInfraDiagnostics() : Promise.resolve(null),
      ])
      setPushSubscriptionCount(count)
      setPushDiagnosticsRows(rows)
      setPushSubscriptionsAdmin(adminRows)
      setPushSubscriptionCountsByProfile(adminCounts)
      setPushInfraDiagnostics(infra)
    } catch (err) {
      setPushDiagnosticsError(describeSupabaseError(err, 'No pudimos cargar el diagnóstico de push.'))
    } finally {
      setLoadingPushDiagnostics(false)
    }
  }

  async function handleRunAuthTest() {
    setRunningAuthTest(true)
    setAuthTestError(null)
    try {
      const result = await testPushDispatcherAuth()
      setAuthTestResult(result)
    } catch (err) {
      setAuthTestError(describeSupabaseError(err, 'No pudimos ejecutar la prueba de autorización.'))
    } finally {
      setRunningAuthTest(false)
    }
  }

  function handleTogglePushDiagnostics() {
    const willOpen = !pushDiagnosticsOpen
    setPushDiagnosticsOpen(willOpen)
    if (willOpen) void handleLoadPushDiagnostics()
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)

    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } catch (err) {
      setPasswordError(describeSupabaseError(err, 'No pudimos cambiar la contraseña.'))
    } finally {
      setChangingPassword(false)
    }
  }

  // Reinicio manual completo del service worker/caché de la PWA — fallback
  // explícito para informática cuando el banner de actualización (ver
  // main.tsx/SwUpdateBanner.tsx) no llega a mostrarse o el usuario nunca lo
  // confirma, o para confirmar de una vez que un dispositivo puntual quedó
  // con una versión vieja. Desregistra TODOS los service workers de este
  // origen y borra TODA la Cache Storage (no solo la de SIGER4 — en este
  // origen no hay otra app, así que no hay riesgo de borrar caché ajena),
  // y recarga forzando bypass de cualquier caché HTTP intermedia.
  async function handleClearCacheAndReload() {
    setClearCacheError(null)
    setClearingCache(true)
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
      window.location.href = window.location.origin + '/panel?cache-cleared=' + Date.now()
    } catch (err) {
      setClearCacheError(describeSupabaseError(err, 'No pudimos limpiar la caché. Cerrá y reabrí la app manualmente.'))
      setClearingCache(false)
    }
  }

  return (
    <AppShell title="Mi Perfil">
      <h1 className="page-title">Mi Perfil</h1>
      <p className="page-subtitle">Tus datos personales, rol y alcance dentro del sistema.</p>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -12, marginBottom: 16 }}>
        SIGER4 v{__SIGER4_APP_VERSION__}
      </p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="avatar" style={{ width: 48, height: 48 }} />
          ) : (
            <div className="btn btn-icon btn-inverted" style={{ width: 48, height: 48 }}>
              <Icon name="user" size={22} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700 }}>{profile?.full_name ?? 'Usuario'}</div>
            {user?.email && <ContactLink kind="email" value={user.email} />}
          </div>
        </div>

        {roles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="kpi-label" style={{ marginBottom: 6 }}>
              Roles asignados (no editable — solo un administrador puede cambiarlo)
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {roles.map((role) => {
                const def = ROLE_DEFINITIONS.find((r) => r.key === role)
                return (
                  <span key={role} className="badge badge-info">
                    {def?.label ?? role}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="section-header">
        <h2 className="section-title">Editar mis datos</h2>
      </div>
      <form onSubmit={handleSaveProfile} className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="phone">Teléfono (opcional)</label>
          <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0351 4123456" />
        </div>

        <div className="field">
          <label htmlFor="position">Cargo o función (opcional)</label>
          <input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Jefe de Cuerpo Activo" />
        </div>

        <ImagePicker label="Foto de perfil (opcional)" currentUrl={profile?.avatar_url} onFileSelected={setAvatarFile} />
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
          La imagen se recorta automáticamente en formato cuadrado, centrada. Para mejores resultados, usá una foto
          donde tu rostro esté centrado.
        </p>

        {profile?.rank && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
            Jerarquía: {profile.rank} · {profile.seniority_start_date && `Antigüedad desde ${new Date(profile.seniority_start_date).toLocaleDateString('es-AR')}`}
            {' '}(estos datos los administra el Dpto. de Informática y Estadística)
          </p>
        )}

        {profileError && <p className="field-error">{profileError}</p>}
        {profileSaved && <p style={{ fontSize: 12, color: 'var(--color-success)' }}>Datos guardados correctamente.</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={savingProfile}>
          {savingProfile ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <div className="section-header">
        <h2 className="section-title">Cambiar contraseña</h2>
      </div>
      <form onSubmit={handleChangePassword} className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="newPassword">Nueva contraseña</label>
          <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirmar contraseña</label>
          <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {passwordError && <p className="field-error">{passwordError}</p>}
        {passwordSaved && <p style={{ fontSize: 12, color: 'var(--color-success)' }}>Contraseña actualizada correctamente.</p>}

        <button type="submit" className="btn btn-outlined btn-block" disabled={changingPassword}>
          {changingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>

      <div className="section-header">
        <h2 className="section-title">Notificaciones push</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        {push.status === 'unsupported' && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Tu navegador no soporta notificaciones push. Las notificaciones internas siguen funcionando
            normalmente desde /notificaciones.
          </p>
        )}
        {push.status === 'unconfigured' && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Las notificaciones push todavía no están configuradas en este sistema.
          </p>
        )}
        {push.status === 'ready' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Recibí avisos del sistema aunque no tengas SIGER4 abierto: cursos nuevos, documentos,
              cambios de estado y notificaciones importantes.
            </p>

            {/* Estado real del push en este dispositivo — no solo "el
                navegador recuerda haberse suscripto", sino confirmado contra
                la base (ver usePushNotifications.checkStatus). */}
            {!push.checking && push.diagnostic && (
              <div
                className={`badge ${
                  push.diagnostic === 'active' ? 'badge-success' : push.diagnostic === 'denied' ? 'badge-danger' : 'badge-warning'
                }`}
                style={{ marginBottom: 12 }}
              >
                {push.diagnostic === 'active' && 'Push activo en este dispositivo'}
                {push.diagnostic === 'denied' && 'Permiso de notificaciones denegado'}
                {push.diagnostic === 'not_subscribed' && 'Sin suscripción'}
                {push.diagnostic === 'stale' && 'Suscripción inválida — necesita reactivarse'}
                {push.diagnostic === 'other_profile' && 'Suscripción de otra sesión en este dispositivo'}
                {push.diagnostic === 'no_worker' && 'Service worker no disponible'}
              </div>
            )}

            {push.diagnostic === 'stale' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Este dispositivo tenía notificaciones activadas, pero la suscripción ya no es válida
                (puede pasar si reinstalaste la PWA, o si estuvo mucho tiempo sin usarse). Reactivala
                para seguir recibiendo avisos.
              </p>
            )}
            {push.diagnostic === 'other_profile' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Esta suscripción estaba asociada a otra sesión en este mismo dispositivo. Activala de nuevo
                para vincularla a tu usuario.
              </p>
            )}

            {push.diagnostic === 'stale' || push.diagnostic === 'other_profile' ? (
              <button type="button" className="btn btn-primary btn-block" disabled={push.loading} onClick={() => push.enable()}>
                {push.loading ? 'Vinculando…' : 'Activar para este usuario'}
              </button>
            ) : push.subscribed ? (
              <>
                <button type="button" className="btn btn-outlined btn-block" disabled={push.loading} onClick={() => push.disable()}>
                  {push.loading ? 'Desactivando…' : 'Desactivar notificaciones push'}
                </button>
                <button
                  type="button"
                  className="btn btn-outlined btn-block"
                  style={{ marginTop: 8 }}
                  disabled={push.loading}
                  onClick={() => push.reactivate()}
                >
                  {push.loading ? 'Re-suscribiendo…' : 'Re-suscribir este dispositivo'}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-block" disabled={push.loading} onClick={() => push.enable()}>
                {push.loading ? 'Activando…' : 'Activar notificaciones push'}
              </button>
            )}
            {push.error && <p className="field-error" style={{ marginTop: 8 }}>{push.error}</p>}
            {push.permission === 'denied' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 8 }}>
                Bloqueaste los permisos de notificaciones para este sitio. Para activarlas, habilitalas desde la
                configuración del navegador.
              </p>
            )}
          </>
        )}

        <button
          type="button"
          className="btn btn-outlined btn-block"
          style={{ marginTop: 12 }}
          disabled={testingNotification}
          onClick={handleTestNotification}
        >
          {testingNotification ? 'Probando…' : isAdmin ? 'Probar push server-side' : 'Probar mi notificación'}
        </button>
        {isAdmin && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Crea una notificación real y espera a que el dispatcher server-side (no el navegador) confirme el envío del push —
            prueba lo mismo que recibirías con la app cerrada.
          </p>
        )}
        {testNotificationResult === 'ok' && (
          <p style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 8 }}>
            Notificación interna creada correctamente. Revisá /notificaciones.
          </p>
        )}
        {testNotificationResult === 'error' && (
          <p className="field-error" style={{ marginTop: 8 }}>
            No pudimos crear la notificación de prueba.
          </p>
        )}
        {/* Usuario comun: solo un resultado binario, sin detalle tecnico
            (status/error/conteos globales) -- ver seccion 6 del pedido. Solo
            informatica_r4/integrante_informatica ve el detalle completo. */}
        {testPushResult && !isAdmin && (
          <p
            style={{
              fontSize: 12,
              marginTop: 4,
              color: testPushResult.attempted && testPushResult.ok && testPushResult.sent > 0 ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {testPushResult.attempted && testPushResult.ok && testPushResult.sent > 0 &&
              'Push enviado a tu(s) dispositivo(s). Si no te llegó, revisá los permisos de notificaciones del navegador/SO.'}
            {!(testPushResult.attempted && testPushResult.ok && testPushResult.sent > 0) && !push.subscribed &&
              'No hay dispositivo push registrado para este usuario. Activá las notificaciones push arriba.'}
            {!(testPushResult.attempted && testPushResult.ok && testPushResult.sent > 0) && push.subscribed &&
              'No pudimos confirmar el envío del push. Probá reactivar las notificaciones push arriba.'}
          </p>
        )}
        {testPushResult && isAdmin && (
          <p
            style={{
              fontSize: 12,
              marginTop: 4,
              color: testPushResult.attempted && testPushResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {!testPushResult.attempted &&
              'El servidor todavía no intentó el push (project_url/cron_shared_secret sin configurar, o pg_net no respondió a tiempo). Revisá el diagnóstico de abajo.'}
            {testPushResult.attempted && testPushResult.ok && testPushResult.sent > 0 &&
              `Push server-side enviado a ${testPushResult.sent} de ${testPushResult.recipients} dispositivo(s). Si no te llegó, revisá los permisos de notificaciones del navegador/SO.`}
            {testPushResult.attempted && testPushResult.ok && testPushResult.sent === 0 &&
              'El servidor intentó el push, pero no había ninguna suscripción activa para este perfil (revisá el estado de arriba).'}
            {testPushResult.attempted && !testPushResult.ok && testPushResult.sent > 0 &&
              `El servidor envió el push a ${testPushResult.sent} de ${testPushResult.recipients} dispositivo(s), con errores parciales: ${testPushResult.error}`}
            {testPushResult.attempted && !testPushResult.ok && testPushResult.sent === 0 &&
              `El servidor intentó el push y falló: ${testPushResult.error}`}
          </p>
        )}
        {testNotificationResult === 'ok' && push.status === 'ready' && !push.subscribed && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Notificaciones push desactivadas en este dispositivo: no vas a recibir el push aunque el servidor lo envíe.
          </p>
        )}

        {/* Diagnostico local del service worker de ESTE dispositivo (ver
            src/sw.ts / src/lib/pushDiagnosticLocal.ts) -- visible para
            cualquier usuario, a diferencia del diagnostico tecnico de abajo:
            no expone infraestructura del servidor, solo si el navegador
            recibió y pudo mostrar el último push. Es la pieza que faltaba
            para distinguir "el backend envió" de "la PWA recibió": el
            backend nunca puede saber esto por sí solo. */}
        {push.status === 'ready' && localPushDiagnosticLoaded && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--color-surface-muted, rgba(0,0,0,0.03))' }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Último push recibido en este dispositivo</p>
            {!localPushDiagnostic && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Este service worker todavía no registró haber recibido ningún push (probá el botón de arriba con la app en
                segundo plano, o esperá a la próxima notificación real).
              </p>
            )}
            {localPushDiagnostic && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div>Recibido: {new Date(localPushDiagnostic.push_event_received_at).toLocaleString('es-AR')}</div>
                <div>Título: {localPushDiagnostic.notification_title ?? '(sin título)'}</div>
                {!localPushDiagnostic.payload_valid_json && (
                  <div style={{ color: 'var(--color-danger)' }}>
                    El payload recibido no era JSON válido — se mostró un título/cuerpo genérico como respaldo.
                  </div>
                )}
                {localPushDiagnostic.show_notification_succeeded ? (
                  <div style={{ color: 'var(--color-success)' }}>La notificación se mostró correctamente en este dispositivo.</div>
                ) : (
                  <div style={{ color: 'var(--color-danger)' }}>
                    El service worker recibió el push pero showNotification() falló
                    {localPushDiagnostic.show_notification_error ? `: ${localPushDiagnostic.show_notification_error}` : '.'}
                  </div>
                )}
                {testPushResult?.attempted &&
                  testPushResult.notificationId &&
                  localPushDiagnostic.notification_id === testPushResult.notificationId && (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      {/* Solo se muestra cuando el push local registrado ES el de esta
                          prueba (mismo notification_id) -- evita comparar contra un push
                          viejo que no tiene nada que ver con la prueba recién hecha. */}
                      Comparación: el servidor confirmó el envío de esta prueba{testPushResult.ok && testPushResult.sent > 0 ? ' y' : ', pero'} el
                      service worker {localPushDiagnostic.show_notification_succeeded ? 'sí' : 'no'} llegó a mostrarla.
                    </div>
                  )}
                {testPushResult?.attempted &&
                  testPushResult.notificationId &&
                  testPushResult.ok &&
                  testPushResult.sent > 0 &&
                  localPushDiagnostic.notification_id !== testPushResult.notificationId && (
                    <div style={{ color: 'var(--color-danger)', fontSize: 11 }}>
                      El servidor confirmó el envío de esta prueba, pero el service worker de este dispositivo todavía no
                      registró haberla recibido. Probá "Actualizar" en unos segundos, o esto puede indicar que el push no
                      llegó al navegador.
                    </div>
                  )}
              </div>
            )}
            <button
              type="button"
              className="btn btn-outlined"
              style={{ fontSize: 11, padding: '4px 10px', marginTop: 8 }}
              onClick={() => void loadLocalPushDiagnostic()}
            >
              Actualizar
            </button>
          </div>
        )}

        {/* Diagnostico tecnico completo (push_send_log: estado, errores,
            conteos por notificacion) -- SOLO informatica_r4/integrante_informatica.
            Un usuario comun nunca ve esto (seccion 6 del pedido): ni siquiera
            de sus propias notificaciones, para no exponer vocabulario tecnico
            (project_url/cron_shared_secret/pg_net) que no puede accionar. */}
        {isAdmin && (
          <>
            <button
              type="button"
              className="btn btn-outlined btn-block"
              style={{ marginTop: 12 }}
              onClick={handleTogglePushDiagnostics}
            >
              {pushDiagnosticsOpen ? 'Ocultar diagnóstico de push' : 'Ver diagnóstico de push'}
            </button>
            {pushDiagnosticsOpen && (
              <div style={{ marginTop: 8 }}>
                {loadingPushDiagnostics && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Cargando…</p>}
                {pushDiagnosticsError && <p className="field-error">{pushDiagnosticsError}</p>}
                {!loadingPushDiagnostics && !pushDiagnosticsError && (
                  <>
                    <p style={{ fontSize: 12, marginBottom: 8 }}>
                      Suscripciones activas (todos tus dispositivos):{' '}
                      <strong>{pushSubscriptionCount ?? 0}</strong>
                    </p>
                    {pushDiagnosticsRows.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Todavía no tenés notificaciones propias.</p>
                    )}
                    {pushDiagnosticsRows.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pushDiagnosticsRows.map((row) => (
                          <div key={row.notification_id} style={{ fontSize: 11, borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}>
                            <div style={{ fontWeight: 600 }}>
                              {row.notification_title}{' '}
                              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: 10 }}>
                                ({SCOPE_LABELS[row.notification_scope] ?? row.notification_scope})
                              </span>
                            </div>
                            <div style={{ color: 'var(--color-text-muted)' }}>
                              {new Date(row.notification_created_at).toLocaleString('es-AR')} —{' '}
                              {row.push_status === 'not_attempted' &&
                                `no se pudo intentar (${row.push_error_message ?? 'falta configuración'})`}
                              {row.push_status === 'dispatched' && 'se llamó al servidor, todavía sin resultado — revisá abajo'}
                              {!row.push_status && 'sin registro (¿trigger no corrió?)'}
                              {row.push_attempted && row.push_status === 'error' && `error: ${row.push_error_message ?? 'desconocido'}`}
                              {row.push_attempted && row.push_status !== 'error' &&
                                `push enviado a ${row.push_sent_count ?? 0}/${row.push_recipients_count ?? 0} dispositivo(s)` +
                                  (row.push_error_message ? ` — con errores parciales: ${row.push_error_message}` : '')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Diagnostico de TODOS los usuarios (endpoint/perfil
                        vinculado) -- solo informatica_r4/integrante_informatica,
                        ver seccion 7 del pedido. Sirve para detectar un
                        endpoint atado a un perfil equivocado (dispositivo
                        compartido/de prueba, ver migración 0088). */}
                    <p style={{ fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
                      Suscripciones de todos los usuarios ({pushSubscriptionsAdmin.length})
                    </p>
                    {pushSubscriptionCountsByProfile.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                        Por usuario: {pushSubscriptionCountsByProfile.map((c) => `${c.profile_full_name} (${c.subscription_count})`).join(', ')}
                      </p>
                    )}
                    {pushSubscriptionsAdmin.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No hay suscripciones registradas.</p>
                    )}
                    {pushSubscriptionsAdmin.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pushSubscriptionsAdmin.map((row) => (
                          <div key={row.subscription_id} style={{ fontSize: 11, borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}>
                            <div style={{ fontWeight: 600 }}>{row.profile_full_name}</div>
                            <div style={{ color: 'var(--color-text-muted)' }}>
                              {row.endpoint_short} · {row.user_agent ?? 'sin user agent'}
                            </div>
                            <div style={{ color: 'var(--color-text-muted)' }}>
                              actualizada: {new Date(row.updated_at).toLocaleString('es-AR')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Infraestructura del dispatcher server-side --
                        SOLO informatica_r4 (is_super_admin(), ni siquiera
                        integrante_informatica: project_url/cron_shared_secret
                        son datos de infraestructura, mismo criterio que
                        Configuración del sistema más abajo). */}
                    {pushInfraDiagnostics && (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
                          Infraestructura del dispatcher
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                          <div>
                            project_url:{' '}
                            <strong style={{ color: pushInfraDiagnostics.project_url_configured ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {pushInfraDiagnostics.project_url_configured ? 'configurado' : 'sin configurar'}
                            </strong>
                          </div>
                          <div>
                            cron_shared_secret:{' '}
                            <strong style={{ color: pushInfraDiagnostics.cron_shared_secret_configured ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {pushInfraDiagnostics.cron_shared_secret_configured ? 'configurado' : 'sin configurar'}
                            </strong>
                          </div>
                          <div>
                            extensión pg_net:{' '}
                            <strong style={{ color: pushInfraDiagnostics.pg_net_installed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {pushInfraDiagnostics.pg_net_installed ? 'instalada' : 'no instalada'}
                            </strong>
                          </div>
                          <div style={{ color: 'var(--color-text-muted)' }}>
                            Llamadas a pg_net (últimos 7 días): {pushInfraDiagnostics.recent_requests_count}
                            {pushInfraDiagnostics.recent_responses_count != null &&
                              ` · respuestas registradas: ${pushInfraDiagnostics.recent_responses_count}`}
                            {pushInfraDiagnostics.recent_error_count != null &&
                              ` · con error: ${pushInfraDiagnostics.recent_error_count}`}
                          </div>
                          {pushInfraDiagnostics.last_response_at && (
                            <div style={{ color: 'var(--color-text-muted)' }}>
                              {pushInfraDiagnostics.last_response_is_historical
                                ? 'Última respuesta (histórica, no necesariamente el estado actual): '
                                : 'Última respuesta (reciente, refleja el estado actual): '}
                              {new Date(pushInfraDiagnostics.last_response_at).toLocaleString('es-AR')}
                              {pushInfraDiagnostics.last_response_status_code != null && ` · HTTP ${pushInfraDiagnostics.last_response_status_code}`}
                              {pushInfraDiagnostics.last_response_error && ` · ${pushInfraDiagnostics.last_response_error}`}
                            </div>
                          )}
                          {pushInfraDiagnostics.last_response_is_historical &&
                            pushInfraDiagnostics.last_response_status_code != null &&
                            pushInfraDiagnostics.last_response_status_code >= 400 && (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: 10, marginTop: 2 }}>
                              Este error tiene más de 15 minutos -- puede ya estar resuelto. Usá "Probar autorización"
                              abajo para confirmar el estado actual sin esperar a la próxima notificación real.
                            </p>
                          )}
                          {pushInfraDiagnostics.last_response_body && (
                            <div style={{ color: 'var(--color-text-muted)', fontSize: 10, wordBreak: 'break-all' }}>
                              Respuesta cruda: <code>{pushInfraDiagnostics.last_response_body}</code>
                            </div>
                          )}
                          {(() => {
                            const status = describePushInfraStatus(pushInfraDiagnostics)
                            if (!status) return null
                            return (
                              <p style={{ color: 'var(--color-danger)', marginTop: 4 }}>
                                {status.message}
                                {status.action && <><br />{status.action}</>}
                              </p>
                            )
                          })()}
                          {(!pushInfraDiagnostics.project_url_configured || !pushInfraDiagnostics.cron_shared_secret_configured) && (
                            <p style={{ color: 'var(--color-danger)', marginTop: 4 }}>
                              Configurá los valores faltantes en "Configuración del sistema" más abajo. El
                              cron_shared_secret guardado ahí debe coincidir exactamente con el secreto{' '}
                              <code>CRON_SHARED_SECRET</code> de la Edge Function send-push-system.
                            </p>
                          )}

                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn btn-outlined"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              onClick={handleRunAuthTest}
                              disabled={runningAuthTest}
                            >
                              {runningAuthTest ? 'Probando…' : 'Probar autorización'}
                            </button>
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                              Llama a send-push-system con un ID inexistente (nunca manda un push real) para confirmar
                              en el momento si el secreto está sincronizado, sin esperar a la próxima notificación.
                            </p>
                            {authTestError && <p className="field-error">{authTestError}</p>}
                            {authTestResult && (
                              <>
                                <p style={{ fontSize: 12, marginTop: 4, color: authTestResult.http_status_code === 404 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                  {authTestResult.http_status_code != null && `HTTP ${authTestResult.http_status_code} — `}
                                  {authTestResult.diagnosis}
                                </p>
                                {authTestResult.response_body && (
                                  <p style={{ fontSize: 10, marginTop: 2, color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>
                                    Respuesta cruda: <code>{authTestResult.response_body}</code>
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="section-header">
        <h2 className="section-title">Recordatorio semanal</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Todos los lunes al mediodía, SIGER4 envía un recordatorio institucional para revisar
          cargas pendientes, novedades y documentación. Podés desactivarlo si no lo querés recibir.
        </p>
        <button
          type="button"
          className={`btn btn-block ${profile?.weekly_reminder_enabled ? 'btn-outlined' : 'btn-primary'}`}
          disabled={savingWeeklyReminder || !profile}
          onClick={handleToggleWeeklyReminder}
        >
          {savingWeeklyReminder
            ? 'Guardando…'
            : profile?.weekly_reminder_enabled
              ? 'Desactivar recordatorio semanal'
              : 'Activar recordatorio semanal'}
        </button>
        {weeklyReminderError && <p className="field-error" style={{ marginTop: 8 }}>{weeklyReminderError}</p>}
      </div>

      {isAdmin && (
        <>
          <div className="section-header">
            <h2 className="section-title">Resumen semanal administrativo</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Todos los lunes, además del recordatorio institucional, Informática recibe un resumen
              con cuarteles en rojo/amarillo del semáforo, cuarteles sin actividad reciente,
              solicitudes de préstamo pendientes/vencidas, documentos nuevos y altas/bajas de
              usuario de la semana. Podés desactivarlo si no lo querés recibir.
            </p>
            <button
              type="button"
              className={`btn btn-block ${profile?.weekly_admin_summary_enabled ? 'btn-outlined' : 'btn-primary'}`}
              disabled={savingWeeklyAdminSummary || !profile}
              onClick={handleToggleWeeklyAdminSummary}
            >
              {savingWeeklyAdminSummary
                ? 'Guardando…'
                : profile?.weekly_admin_summary_enabled
                  ? 'Desactivar resumen semanal administrativo'
                  : 'Activar resumen semanal administrativo'}
            </button>
            {weeklyAdminSummaryError && <p className="field-error" style={{ marginTop: 8 }}>{weeklyAdminSummaryError}</p>}
          </div>

          <div className="section-header">
            <h2 className="section-title">Versión / actualización de la app (informática)</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Versión: <code style={{ fontFamily: 'var(--font-mono)' }}>{__SIGER4_APP_VERSION__}</code> · Build:{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>{__SIGER4_BUILD_VERSION__}</code>
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Compilado: {new Date(__SIGER4_BUILD_TIME__).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Cuando hay una versión nueva disponible, aparece un aviso arriba de la pantalla para
              actualizar cuando quieras (ya no se recarga sola sin avisar). Si un dispositivo puntual
              parece estar corriendo una versión vieja (compará el build de arriba con el último
              commit en el repositorio) y no vio ese aviso, usá este botón para forzar un reinicio
              completo del service worker y la caché local.
            </p>
            <button type="button" className="btn btn-outlined btn-block" disabled={clearingCache} onClick={() => void handleClearCacheAndReload()}>
              {clearingCache ? 'Limpiando…' : 'Actualizar app / limpiar caché'}
            </button>
            {clearCacheError && <p className="field-error" style={{ marginTop: 8 }}>{clearCacheError}</p>}
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
              Si esto no alcanza, cerrá la PWA por completo (deslizarla fuera de la lista de apps
              recientes en Android, no solo minimizarla) y volvé a abrirla.
            </p>
          </div>

          {hasRole('informatica_r4') && <SystemSettingsSection />}
        </>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Institucional
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <img src="/logos/logo-escuela.png" alt="SIGER4" style={{ height: 40, borderRadius: 8 }} />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" style={{ height: 40, borderRadius: 8 }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          La carga de documentos (Documentos → Cargar archivo) está disponible solo desde PC. Desde el
          celular podés ver y descargar documentos normalmente.
        </p>
      </div>

      <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
        <Icon name="logout" size={16} />
        Cerrar sesión
      </button>
    </AppShell>
  )
}
