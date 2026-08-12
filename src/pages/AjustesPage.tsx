import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ImagePicker } from '../components/ui/ImagePicker'
import { SystemSettingsSection } from '../components/SystemSettingsSection'
import { useAuth } from '../hooks/useAuth'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { ROLE_DEFINITIONS } from '../types/roles'
import { updateProfile } from '../lib/api/users'
import { deleteAvatar, uploadAvatar } from '../lib/api/storage'
import { createNotification } from '../lib/api/notifications'
import { triggerPushDiagnostic } from '../lib/api/pushSubscriptions'
import { supabase } from '../lib/supabaseClient'
import { describeSupabaseError } from '../lib/api/errors'

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
  const [testPushResult, setTestPushResult] = useState<{ ok: boolean; sent: number; duplicate: boolean; error?: string } | null>(null)

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
      // un broadcast. NotificationPushBridge también va a intentar disparar
      // el push al detectar este insert por Realtime, pero ese camino es
      // fire-and-forget (no informa resultado) — para el diagnóstico de esta
      // pantalla se llama a triggerPushDiagnostic directo abajo, que sí
      // devuelve si el push se envió realmente y a cuántos dispositivos, para
      // poder distinguir "la notificación interna funciona pero el push real
      // no llega" de "todo funciona".
      const notification = await createNotification({
        type: 'prueba',
        title: 'Notificación de prueba',
        body: 'Si ves esto, las notificaciones internas funcionan correctamente.',
        profile_id: profile.id,
      })
      setTestNotificationResult('ok')

      if (push.status === 'ready' && push.subscribed) {
        const result = await triggerPushDiagnostic({
          title: 'Notificación de prueba',
          body: 'Si ves esto como notificación push, todo el circuito funciona correctamente.',
          url: '/notificaciones',
          profileId: profile.id,
          notificationId: notification.id,
        })
        setTestPushResult(result)
      }
    } catch {
      setTestNotificationResult('error')
    } finally {
      setTestingNotification(false)
    }
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
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{user?.email}</div>
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
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0351 4123456" />
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

            {push.diagnostic === 'stale' ? (
              <button type="button" className="btn btn-primary btn-block" disabled={push.loading} onClick={() => push.reactivate()}>
                {push.loading ? 'Reactivando…' : 'Reactivar notificaciones push'}
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
          {testingNotification ? 'Enviando…' : 'Probar notificación'}
        </button>
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
        {testPushResult && (
          <p
            style={{
              fontSize: 12,
              marginTop: 4,
              color: testPushResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {testPushResult.ok && testPushResult.duplicate && 'Push ya enviado por otra pestaña/dispositivo activo (deduplicado).'}
            {testPushResult.ok && !testPushResult.duplicate && testPushResult.sent > 0 &&
              `Push real enviado a ${testPushResult.sent} dispositivo${testPushResult.sent === 1 ? '' : 's'}. Si no te llegó, revisá los permisos de notificaciones del navegador/SO.`}
            {testPushResult.ok && !testPushResult.duplicate && testPushResult.sent === 0 &&
              'La notificación interna se creó, pero no había ninguna suscripción push activa para enviar el push real (revisá el estado de arriba).'}
            {!testPushResult.ok && `No se pudo enviar el push real: ${testPushResult.error}`}
          </p>
        )}
        {testNotificationResult === 'ok' && push.status === 'ready' && !push.subscribed && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Notificaciones push desactivadas en este dispositivo: solo se probó la notificación interna.
          </p>
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
          <img src="/logos/logo-escuela.png" alt="Escuela Regional" style={{ height: 40, borderRadius: 8 }} />
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
