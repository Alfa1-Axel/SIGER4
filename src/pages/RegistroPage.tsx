import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { Footer } from '../components/layout/Footer'

export function RegistroPage() {
  const { session, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!loading && session) {
    return <Navigate to="/panel" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setSubmitting(true)
    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    setSubmitting(false)

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already registered')
          ? 'Ese email ya tiene una cuenta activada. Probá ingresar directamente.'
          : 'No pudimos activar tu cuenta. Verificá tus datos e intentá de nuevo.',
      )
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logos">
            <img src="/logos/logo-escuela.png" alt="Escuela Regional de Bomberos" />
            <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" />
          </div>
          <h1 className="login-title">¡Listo!</h1>
          <p className="login-subtitle">
            Tu cuenta fue creada. Si tu institución te pidió confirmar el email, revisá tu casilla de
            correo antes de ingresar.
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Ir a Ingresar
          </Link>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logos">
          <img src="/logos/logo-escuela.png" alt="Escuela Regional de Bomberos" />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" />
        </div>
        <h1 className="login-title">Completar registro</h1>
        <p className="login-subtitle">
          Tu institución ya cargó tus datos en SIGER4. Elegí una contraseña para activar tu cuenta.
        </p>

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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Creando cuenta…' : 'Activar cuenta'}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  )
}
