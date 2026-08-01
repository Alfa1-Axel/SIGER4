import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Guarda de ruta para /usuarios/nuevo: además de informatica_r4/
// integrante_informatica (AdminRoute), director_escuela y jefe_cuerpo_activo
// también pueden crear usuarios (con roles/alcance limitados — la
// autorización real vive server-side en la Edge Function admin-create-user,
// esto solo evita que lleguen a un formulario que van a tener bloqueado).
// /usuarios (listado) y /usuarios/:id (edición completa de un usuario
// existente) siguen exclusivos de AdminRoute: crear un usuario acotado es una
// capacidad distinta de administrar cualquier usuario del sistema.
export function UserCreatorRoute({ children }: { children: ReactNode }) {
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

  if (!isAdmin && !hasRole('director_escuela', 'jefe_cuerpo_activo')) {
    return <Navigate to="/panel" replace />
  }

  return <>{children}</>
}
