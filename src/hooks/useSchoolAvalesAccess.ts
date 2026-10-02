import { useAuth } from './useAuth'
import { SCHOOL_AVALES_ROLES } from '../types/roles'

// Espejo de UI de los helpers SQL de Avales (0095 y 0097). Solo decide qué
// mostrar: la autorización real la hacen RLS y las policies de Storage.
//   - hasAccess: puede entrar a la sección: Informática, Coordinador o
//     Secretario de Escuela, o coordinador de algún departamento en la
//     sección Departamentos.
//   - canViewAll: ve todos los departamentos (can_view_all_school_avales()).
//   - canManage: edita, archiva y elimina avales (can_manage_school_avales()
//     = is_super_admin() = solo informatica_r4). Los departamentos y sus
//     coordinadores se administran en la sección Departamentos.
export function useSchoolAvalesAccess() {
  const { isAdmin, isSuperAdmin, hasRole, coordinatedDepartmentIds } = useAuth()
  const canViewAll = isAdmin || hasRole(...SCHOOL_AVALES_ROLES)
  return {
    hasAccess: canViewAll || coordinatedDepartmentIds.length > 0,
    canViewAll,
    canManage: isSuperAdmin,
    coordinatedDepartmentIds,
  }
}
