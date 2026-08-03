import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, deactivated, profile } = useAuth()

  if (loading) {
    return (
      <div className="login-page">
        <div className="spinner" />
      </div>
    )
  }

  if (deactivated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ message: 'Tu cuenta fue desactivada. Contactá a un administrador si creés que es un error.' }}
      />
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Contraseña temporal definida por un admin al crear la cuenta: bloquea
  // cualquier otra pantalla hasta que el usuario elija la suya propia (ver
  // CambiarPasswordPage y migración 0034_must_change_password.sql).
  if (profile?.must_change_password) {
    return <Navigate to="/cambiar-password" replace />
  }

  return <>{children}</>
}
