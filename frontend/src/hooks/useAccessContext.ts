import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useLoanRequestAccess } from './useLoanRequestAccess'
import { useDepartmentReportsAccess } from './useDepartmentReportsAccess'
import { useSchoolAvalesAccess } from './useSchoolAvalesAccess'
import type { SearchContext } from '../lib/api/globalSearch'

// Qué puede buscar el usuario en la búsqueda global. Espejo de las guardas de
// cada pantalla; la base (RLS) sigue decidiendo.
export function useAccessContext(): SearchContext {
  const { isAdmin, isDepartmentOnly, hasRole, profile } = useAuth()
  const { ownStationIds } = useLoanRequestAccess()
  const { hasAnyAccess: hasReportsAccess } = useDepartmentReportsAccess()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const isJefe = hasRole('jefe_cuerpo_activo')
  const profileId = profile?.id ?? null

  return useMemo<SearchContext>(
    () => ({
      departmentOnly: isDepartmentOnly,
      hasReportsAccess,
      hasAvalesAccess,
      profileId,
      ownStationIds,
      // Abre fichas de usuario: Informática (todas) y el Jefe de Cuerpo
      // Activo (las de su cuartel que puede editar).
      canSearchUsers: isAdmin || isJefe,
      usersLimitedToOwnStation: !isAdmin && isJefe,
    }),
    [isAdmin, isDepartmentOnly, hasReportsAccess, hasAvalesAccess, isJefe, profileId, ownStationIds],
  )
}
