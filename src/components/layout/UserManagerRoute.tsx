import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Guarda de ruta para /usuarios y /usuarios/:id: además de informatica_r4/
// integrante_informatica (isAdmin), jefe_cuerpo_activo también puede entrar
// para gestionar usuarios de su propio cuartel (resetear contraseña,
// activar/desactivar, editar datos básicos). La autorización real vive
// server-side en admin-update-user (station_id propio, roles no
// privilegiados) — esto solo evita que llegue a un listado/formulario que
// va a tener bloqueado.
export function UserManagerRoute({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin, hasRole } = useAuth()

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

  if (!isAdmin && !hasRole('jefe_cuerpo_activo')) {
    return <Navigate to="/panel" replace />
  }

  return <>{children}</>
}
