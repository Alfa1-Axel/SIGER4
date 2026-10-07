import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useLoanRequestAccess } from './useLoanRequestAccess'
import { useDepartmentReportsAccess } from './useDepartmentReportsAccess'
import { useSchoolAvalesAccess } from './useSchoolAvalesAccess'
import type { HelpAudienceContext } from '../config/helpContent'
import type { SearchContext } from '../lib/api/globalSearch'

// Qué puede hacer el usuario, resumido para la Ayuda y la búsqueda global.
// Espejo de las guardas de cada pantalla; la base (RLS) sigue decidiendo.
export function useAccessContext(): SearchContext {
  const { isAdmin, isSuperAdmin, isDepartmentOnly, hasRole, profile, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const { canRequest, ownStationIds } = useLoanRequestAccess()
  const { hasAnyAccess: hasReportsAccess } = useDepartmentReportsAccess()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const isJefe = hasRole('jefe_cuerpo_activo')
  const isRegional = hasRole('secretario_regional')
  const isDirector = hasRole('director_escuela')
  const isEscuelaRole = hasRole('director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela')
  const canUploadDocuments = isAdmin || hasRole('secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const profileId = profile?.id ?? null

  return useMemo<SearchContext>(() => {
    const help: HelpAudienceContext = {
      isAdmin,
      isSuperAdmin,
      canRequestLoans: canRequest,
      canManageLoans: isAdmin || isRegional || isDirector,
      hasReportsAccess,
      hasAvalesAccess,
      isEscuelaRole,
      canUploadDocuments,
      canManageUsers: isAdmin || isJefe || isDirector,
      canNotifyDepartments: isAdmin || isRegional || coordinatedDepartmentIds.length > 0,
      departmentOnly: isDepartmentOnly,
      hasOwnDepartments: coordinatedDepartmentIds.length > 0 || memberDepartmentIds.length > 0,
    }
    return {
      ...help,
      profileId,
      ownStationIds,
      // Abre fichas de usuario: Informática (todas) y el Jefe de Cuerpo
      // Activo (las de su cuartel que puede editar).
      canSearchUsers: isAdmin || isJefe,
      usersLimitedToOwnStation: !isAdmin && isJefe,
    }
  }, [isAdmin, isSuperAdmin, isDepartmentOnly, canRequest, isRegional, isDirector, hasReportsAccess, hasAvalesAccess, isEscuelaRole, canUploadDocuments, isJefe, profileId, ownStationIds, coordinatedDepartmentIds, memberDepartmentIds])
}
