import type { ReactNode } from 'react'
import { GuardedRoute } from './GuardedRoute'

// Guarda de ruta para /reportes: además de informatica_r4/integrante_informatica
// (isAdmin, acceso total), solo director_escuela, secretario_regional,
// jefe_cuerpo_activo y usuario_carga_cuartel pueden generar reportes. El
// alcance permitido dentro de la página (regional/subsede/cuartel propio) se
// filtra aparte en ReportesPage.
export function ReportsRoute({ children }: { children: ReactNode }) {
  return (
    <GuardedRoute
      title="Reportes"
      allow={({ isAdmin, hasRole }) => isAdmin || hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')}
      deniedMessage="Generar reportes está disponible para Informática, Director de Escuela, Secretario Regional, Jefe de Cuerpo Activo y Usuario de carga de cuartel. Si necesitás un reporte, pedíselo a alguno de ellos."
    >
      {children}
    </GuardedRoute>
  )
}
