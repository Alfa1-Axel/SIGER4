import type { ReactNode } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { AccessDenied } from '../ui/AccessDenied'
import { useSchoolAvalesAccess } from '../../hooks/useSchoolAvalesAccess'
import { useAuth } from '../../hooks/useAuth'

// Guarda de ruta para /escuela/avales/*: cualquier persona con un rol que carga su aval (Avales
// regionales) o que es autoridad de un área. No entran el Invitado, el Presidente de CD ni el
// Secretario de CD (secretario_comision). authorityOnly: pantallas de administración
// (Movimientos), solo para la autoridad. Aunque alguien salte la guarda, RLS, las funciones de la
// base y las policies de Storage no le devuelven ni avales ajenos, ni archivos, ni movimientos.
export function SchoolAvalesRoute({ children, authorityOnly = false }: { children: ReactNode; authorityOnly?: boolean }) {
  return (
    <ProtectedRoute>
      <SchoolAvalesGate authorityOnly={authorityOnly}>{children}</SchoolAvalesGate>
    </ProtectedRoute>
  )
}

function SchoolAvalesGate({ children, authorityOnly }: { children: ReactNode; authorityOnly: boolean }) {
  const { hasAccess, isAuthority } = useSchoolAvalesAccess()
  const { isDepartmentOnly } = useAuth()
  if (!hasAccess || (authorityOnly && !isAuthority)) {
    return (
      <AppShell title="Avales regionales">
        <AccessDenied
          title={authorityOnly && hasAccess ? 'No tenés permiso para ver estos movimientos' : 'No tenés permiso para ver Avales regionales'}
          message={
            authorityOnly && hasAccess
              ? 'Los movimientos de Avales los ve la autoridad de cada área: Informática R4, el Coordinador de Escuela y el coordinador de cada departamento (solo el suyo).'
              : 'Avales es para quienes tienen un rol operativo o institucional: cada persona carga y renueva el suyo. El Invitado, el Presidente de CD y el Secretario de CD no cargan avales. Si lo necesitás, consultá a Informática y Estadística.'
          }
          backTo={isDepartmentOnly ? '/panel' : '/escuela'}
          backLabel={isDepartmentOnly ? 'Volver al inicio' : 'Volver a Escuela'}
        />
      </AppShell>
    )
  }
  return <>{children}</>
}
