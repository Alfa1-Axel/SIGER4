import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { SCHOOL_AVALES_UPLOAD_ROLES } from '../types/roles'

// Espejo de UI de los helpers SQL de Avales (0095, 0097 y 0117). Solo decide qué
// mostrar: la autorización real la hacen RLS, las funciones y las policies de Storage.
//   - canLoad: puede cargar y renovar SU aval (can_load_school_avales()): los roles
//     operativos e institucionales de la lista. No cargan Invitado, Presidente de CD,
//     Secretario de CD ni los roles retirados.
//   - canViewAll: ve los avales de todos los departamentos (can_view_all_school_avales()):
//     Informática (los dos roles) y el Coordinador de Escuela.
//   - canManageAll: autoridad sobre todos (can_manage_school_avales()): Informática R4 y el
//     Coordinador de Escuela. Edita, renueva por otra persona, archiva y elimina, y revisa
//     los movimientos.
//   - isAuthority: es autoridad de al menos un área (todas, o el departamento que coordina).
//   - canManageDepartment(id): autoridad de ESE departamento.
//   - hasAccess: puede entrar a la sección: carga su aval o es autoridad.
export function useSchoolAvalesAccess() {
  const { isAdmin, isSuperAdmin, hasRole, coordinatedDepartmentIds } = useAuth()
  const canViewAll = isAdmin || hasRole('coordinador_escuela')
  const canManageAll = isSuperAdmin || hasRole('coordinador_escuela')
  const canLoad = hasRole(...SCHOOL_AVALES_UPLOAD_ROLES)
  const isAuthority = canManageAll || coordinatedDepartmentIds.length > 0
  const canManageDepartment = useCallback(
    (departmentId: string | null | undefined) => canManageAll || (departmentId != null && coordinatedDepartmentIds.includes(departmentId)),
    [canManageAll, coordinatedDepartmentIds],
  )
  return {
    hasAccess: canLoad || canViewAll || isAuthority,
    canLoad,
    canViewAll,
    canManageAll,
    isAuthority,
    canManageDepartment,
    // Compatibilidad con las pantallas que preguntan "¿gestiona?": solo quien gestiona todo.
    canManage: canManageAll,
    coordinatedDepartmentIds,
  }
}
