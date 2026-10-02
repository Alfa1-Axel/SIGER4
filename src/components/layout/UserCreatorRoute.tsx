import type { ReactNode } from 'react'
import { GuardedRoute } from './GuardedRoute'

// Guarda de ruta para /usuarios/nuevo: además de informatica_r4/
// integrante_informatica, director_escuela y jefe_cuerpo_activo también
// pueden crear usuarios (con roles/alcance limitados). La autorización real
// vive server-side en la Edge Function admin-create-user.
export function UserCreatorRoute({ children }: { children: ReactNode }) {
  return (
    <GuardedRoute
      title="Nuevo usuario"
      allow={({ isAdmin, hasRole }) => isAdmin || hasRole('director_escuela', 'jefe_cuerpo_activo')}
      deniedMessage="Crear usuarios es de Informática, el Director de Escuela y el Jefe de Cuerpo Activo (para su cuartel). Si alguien necesita una cuenta, pedísela a ellos."
    >
      {children}
    </GuardedRoute>
  )
}
