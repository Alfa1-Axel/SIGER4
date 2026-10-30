import type { ReactNode } from 'react'
import { GuardedRoute } from './GuardedRoute'
import { canUseModule } from '../../lib/moduleAccess'
import type { AppModule } from '../../lib/moduleAccess'

// Guarda de ruta de un módulo que el modo departamento no abre (cuarteles,
// mapa, Escuela, Documentos, Inventario): quien solo es Coordinador o Miembro
// de Departamento ve un aviso claro en vez de la pantalla. El resto de los
// usuarios entra como siempre. La protección real de los datos es la RLS
// (0107): aunque alguien saltee esta pantalla, la base no le devuelve nada.
export function ModuleRoute({ module, title, children }: { module: AppModule; title: string; children: ReactNode }) {
  return (
    <GuardedRoute
      title={title}
      allow={({ isDepartmentOnly }) => canUseModule(module, isDepartmentOnly)}
      deniedMessage={`${title} no forma parte de tu rol: Coordinador y Miembro de Departamento trabajan con su departamento (informes, actas, eventos y avisos). Si necesitás usar ${title}, consultá a Informática y Estadística para que te asignen el rol que corresponde.`}
    >
      {children}
    </GuardedRoute>
  )
}
