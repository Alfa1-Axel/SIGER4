import { useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Footer } from '../components/layout/Footer'
import { SupportContact } from '../components/SupportContact'
import { Icon } from '../components/ui/Icon'
import {
  describePasskeyError,
  describeSignInError,
  offerToSaveCredential,
  passkeysAvailable,
  readRememberedEmail,
  saveRememberedEmail,
  signInWithPasskey,
} from '../lib/auth/loginHelpers'

// Inicio de sesión. La contraseña solo viaja a Supabase Auth: la app no la
// guarda. Para no tipearla cada vez, el navegador ofrece guardarla en su
// gestor de contraseñas (que en el celular la completa con huella o rostro)
// y, si está habilitado, se puede ingresar con passkey. Ver
// DEPLOYMENT.md sección 57.5.
export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const location = useLocation()
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null
  const [rememberedEmail] = useState(readRememberedEmail)
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(Boolean(rememberedEmail))
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const showPasskey = passkeysAvailable()

  if (!loading && session) {
    return <Navigate to="/panel" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const cleanEmail = email.trim()
    if (!cleanEmail) return setError('Escribí tu email institucional.')
    if (!password) return setError('Escribí tu contraseña.')
    setSubmitting(true)
    const result = await signIn(cleanEmail, password)
    if (result.error) {
      setSubmitting(false)
      setError(describeSignInError(result))
      return
    }
    saveRememberedEmail(rememberEmail ? cleanEmail : null)
    void offerToSaveCredential(cleanEmail, password)
  }

  async function handlePasskey() {
    setError(null)
    setPasskeyBusy(true)
    try {
      await signInWithPasskey()
    } catch (err) {
      setError(describePasskeyError(err))
      setPasskeyBusy(false)
    }
  }

  function handlePasswordKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'))
  }

  const busy = submitting || passkeyBusy

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logos">
          <img src="/logos/logo-escuela.png" alt="SIGER4" />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" />
        </div>
        <h1 className="login-title">SIGER4</h1>
        <p className="login-subtitle">Sistema Integral de Gestión de la Regional 4</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email institucional</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@bomberos.gob.ar"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={handlePasswordKey}
                onKeyDown={handlePasswordKey}
                disabled={busy}
                aria-describedby={capsLock ? 'caps-warning' : undefined}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                aria-controls="password"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            {capsLock && (
              <p id="caps-warning" className="field-help" style={{ color: 'var(--color-warning)' }}>
                Bloq Mayús está activado.
              </p>
            )}
          </div>

          <label className="check-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} disabled={busy} />
            Recordar mi email en este dispositivo
          </label>

          {redirectMessage && !error && (
            <div className="alert alert-info" role="status">
              {redirectMessage}
            </div>
          )}
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        {showPasskey && (
          <>
            <div className="login-divider" aria-hidden="true">
              <span>o</span>
            </div>
            <button type="button" className="btn btn-outlined btn-block" onClick={handlePasskey} disabled={busy}>
              <Icon name="fingerprint" size={18} />
              {passkeyBusy ? 'Esperando la verificación…' : 'Ingresar con huella, rostro o PIN'}
            </button>
          </>
        )}

        <p className="login-help">
          ¿Olvidaste la contraseña o no tenés cuenta? Pedíselo al Dpto. de Informática y Estadística R4.
        </p>
        <SupportContact variant="inline" />
      </div>
      <Footer />
    </div>
  )
}
