import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { useSchoolAvalesAccess } from '../../hooks/useSchoolAvalesAccess'

// Guarda de ruta para /escuela/avales/*: además de la sesión (ProtectedRoute),
// exige un rol con acceso a Avales regionales. Es solo para no mostrar una
// pantalla vacía o confusa: aunque alguien la saltee, RLS y las policies de
// Storage no le devuelven ni departamentos, ni documentos, ni archivos.
export function SchoolAvalesRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <SchoolAvalesGate>{children}</SchoolAvalesGate>
    </ProtectedRoute>
  )
}

function SchoolAvalesGate({ children }: { children: ReactNode }) {
  const { hasAccess } = useSchoolAvalesAccess()
  if (!hasAccess) {
    return (
      <AppShell title="Avales regionales">
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>
            No tenés permiso para acceder a Avales regionales. La sección es solo para Informática, el Coordinador y el
            Secretario de Escuela, y los coordinadores de departamento asignados en Avales.
          </p>
          <Link to="/escuela" className="btn btn-outlined">
            Volver a Escuela
          </Link>
        </div>
      </AppShell>
    )
  }
  return <>{children}</>
}
