import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { updateProfile } from '../lib/api/users'
import { Footer } from '../components/layout/Footer'
import { describeSupabaseError } from '../lib/api/errors'

// Pantalla de cambio de contraseña obligatorio: se muestra en vez de
// cualquier ruta protegida mientras profile.must_change_password sea true
// (ver ProtectedRoute). Reutiliza el mismo mecanismo que AjustesPage
// (supabase.auth.updateUser), y además apaga la bandera en profiles para que
// ProtectedRoute deje pasar al resto de la app.
export function CambiarPasswordPage() {
  const { session, loading, profile, refreshProfile, signOut } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="login-page">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (profile && !profile.must_change_password) {
    return <Navigate to="/panel" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword })
      if (authError) throw authError
      if (profile) await updateProfile(profile.id, { must_change_password: false })
      await refreshProfile()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cambiar la contraseña.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logos">
          <img src="/logos/logo-escuela.png" alt="SIGER4" />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" />
        </div>
        <h1 className="login-title">Cambiar contraseña</h1>
        <p className="login-subtitle">
          Por seguridad, tenés que elegir tu propia contraseña antes de seguir usando SIGER4.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="newPassword">Nueva contraseña</label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>

        <button type="button" className="btn btn-outlined btn-block" style={{ marginTop: 12 }} onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
      <Footer />
    </div>
  )
}
