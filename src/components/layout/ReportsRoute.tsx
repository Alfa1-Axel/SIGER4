import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Guarda de ruta para /reportes: además de informatica_r4/integrante_informatica
// (isAdmin, acceso total), solo director_escuela, secretario_regional,
// jefe_cuerpo_activo y usuario_carga_cuartel pueden generar reportes. El resto
// de roles (presidente_cuartel, secretario_comision, instructor, invitado,
// administrativo) no tiene acceso a Reportes. El alcance permitido dentro de
// la página (regional/subsede/cuartel propio) se filtra aparte en ReportesPage.
export function ReportsRoute({ children }: { children: ReactNode }) {
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

  if (!isAdmin && !hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')) {
    return <Navigate to="/panel" replace />
  }

  return <>{children}</>
}
