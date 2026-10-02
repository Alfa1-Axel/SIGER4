import type { ReactNode } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { AccessDenied } from '../ui/AccessDenied'
import { useAuth } from '../../hooks/useAuth'

type AuthValue = ReturnType<typeof useAuth>

interface GuardedRouteProps {
  // Título del header mientras se muestra el aviso de acceso.
  title: string
  // Quién puede entrar. Es solo la puerta de la pantalla: la protección real
  // de los datos está en RLS.
  allow: (auth: AuthValue) => boolean
  // Por qué no puede entrar y qué hacer, en lenguaje de usuario.
  deniedMessage: string
  children: ReactNode
}

// Ruta autenticada con control de acceso por rol. Si el usuario no tiene
// permiso, muestra un aviso claro dentro de la app (no redirige en silencio).
export function GuardedRoute({ title, allow, deniedMessage, children }: GuardedRouteProps) {
  return (
    <ProtectedRoute>
      <Gate title={title} allow={allow} deniedMessage={deniedMessage}>
        {children}
      </Gate>
    </ProtectedRoute>
  )
}

function Gate({ title, allow, deniedMessage, children }: GuardedRouteProps) {
  const auth = useAuth()
  if (!allow(auth)) {
    return (
      <AppShell title={title}>
        <AccessDenied message={deniedMessage} />
      </AppShell>
    )
  }
  return <>{children}</>
}
