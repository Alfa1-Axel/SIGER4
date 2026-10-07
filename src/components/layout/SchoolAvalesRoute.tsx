import type { ReactNode } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { AccessDenied } from '../ui/AccessDenied'
import { useSchoolAvalesAccess } from '../../hooks/useSchoolAvalesAccess'
import { useAuth } from '../../hooks/useAuth'

// Guarda de ruta para /escuela/avales/*: Informática, Coordinador o
// Secretario de Escuela, o el coordinador de un departamento (sección
// Departamentos). Aunque alguien la saltee, RLS y las policies de Storage no
// le devuelven ni departamentos, ni documentos, ni archivos.
export function SchoolAvalesRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <SchoolAvalesGate>{children}</SchoolAvalesGate>
    </ProtectedRoute>
  )
}

function SchoolAvalesGate({ children }: { children: ReactNode }) {
  const { hasAccess } = useSchoolAvalesAccess()
  const { isDepartmentOnly } = useAuth()
  if (!hasAccess) {
    return (
      <AppShell title="Avales regionales">
        <AccessDenied
          title="No tenés permiso para ver Avales regionales"
          message={
            isDepartmentOnly
              ? 'Avales es para el coordinador de cada departamento, que ve y sube solo los de su departamento. Tu rol (Miembro de Departamento) no incluye Avales. Si lo necesitás, pedíselo a Informática R4.'
              : 'Avales es para Informática, el Coordinador y el Secretario de Escuela, y el coordinador de cada departamento (que ve solo el suyo). Si coordinás un departamento y no lo ves, pedile a Informática que te asigne como coordinador en la sección Departamentos.'
          }
          backTo={isDepartmentOnly ? '/panel' : '/escuela'}
          backLabel={isDepartmentOnly ? 'Volver al inicio' : 'Volver a Escuela'}
        />
      </AppShell>
    )
  }
  return <>{children}</>
}
