import type { ReactNode } from 'react'
import { GuardedRoute } from './GuardedRoute'

// Guarda de ruta para /usuarios y /usuarios/:id: además de informatica_r4/
// integrante_informatica (isAdmin), jefe_cuerpo_activo también puede entrar
// para gestionar usuarios de su propio cuartel. La autorización real vive
// server-side en admin-update-user (station_id propio, roles no
// privilegiados) y en RLS.
export function UserManagerRoute({ children }: { children: ReactNode }) {
  return (
    <GuardedRoute
      title="Usuarios"
      allow={({ isAdmin, hasRole }) => isAdmin || hasRole('jefe_cuerpo_activo')}
      deniedMessage="La gestión de usuarios es de Informática y, para su propio cuartel, del Jefe de Cuerpo Activo. Para cambiar tus propios datos andá a Mi perfil y ajustes."
    >
      {children}
    </GuardedRoute>
  )
}
