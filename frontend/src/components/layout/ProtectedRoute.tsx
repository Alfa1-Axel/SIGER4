import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { FallbackScreen } from '../ui/FallbackScreen'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, deactivated, profile, profileError, retryProfile, signOut } = useAuth()

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
        state={{ message: 'Tu cuenta fue desactivada. Si creés que es un error, consultá a Informática y Estadística.' }}
      />
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Hay sesión pero el perfil no cargó (red caída, servidor ocupado): se avisa y se deja reintentar, en vez de
  // mostrar la app como si la persona no tuviera ningún permiso.
  if (profileError && !profile) {
    return (
      <FallbackScreen title="No pudimos cargar tu perfil" message={profileError}>
        <button type="button" className="btn btn-primary btn-block" onClick={retryProfile}>
          Reintentar
        </button>
        <button type="button" className="btn btn-outlined btn-block" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </FallbackScreen>
    )
  }

  // Contraseña temporal definida por un admin al crear la cuenta: bloquea
  // cualquier otra pantalla hasta que el usuario elija la suya propia (ver
  // CambiarPasswordPage y migración 0034_must_change_password.sql).
  if (profile?.must_change_password) {
    return <Navigate to="/cambiar-password" replace />
  }

  return <>{children}</>
}
