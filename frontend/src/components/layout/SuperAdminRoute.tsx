import type { ReactNode } from 'react'
import { GuardedRoute } from './GuardedRoute'

// Guarda de ruta para pantallas exclusivas del administrador supremo
// (informatica_r4): hoy, Auditoría. En la base, audit_logs solo es legible
// por is_super_admin() (0097): aunque alguien saltee esta pantalla, la
// consulta no devuelve nada.
export function SuperAdminRoute({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GuardedRoute
      title={title}
      allow={({ isSuperAdmin }) => isSuperAdmin}
      deniedMessage="Esta sección es exclusiva del Dpto. de Informática y Estadística R4 (administrador del sistema)."
    >
      {children}
    </GuardedRoute>
  )
}
