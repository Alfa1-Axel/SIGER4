import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Footer } from '../components/layout/Footer'

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const location = useLocation()
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/panel" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError('No pudimos iniciar sesión. Verificá tu email y contraseña.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logos">
          <img src="/logos/logo-escuela.png" alt="Escuela Regional de Bomberos" />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" />
        </div>
        <h1 className="login-title">SIGER4</h1>
        <p className="login-subtitle">Sistema Integral de Gestión de la Regional 4</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email institucional</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@bomberos.gob.ar"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {redirectMessage && !error && <p className="field-error">{redirectMessage}</p>}
          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  )
}
