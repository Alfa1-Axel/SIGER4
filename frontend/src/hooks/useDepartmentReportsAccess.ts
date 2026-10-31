import { useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import type { DepartmentReport } from '../types/database'

type ReportRef = Pick<DepartmentReport, 'department_id' | 'created_by_profile_id'>

// Espejo en pantalla de los helpers de 0098 (can_view_department_reports,
// can_manage_department_report y la policy de delete). La base es la que
// decide; esto solo evita mostrar acciones que después se rechazarían.
export function useDepartmentReportsAccess() {
  const { isAdmin, isSuperAdmin, profile, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const profileId = profile?.id ?? null

  const canView = useCallback(
    (departmentId: string) => isAdmin || coordinatedDepartmentIds.includes(departmentId) || memberDepartmentIds.includes(departmentId),
    [isAdmin, coordinatedDepartmentIds, memberDepartmentIds],
  )

  const canManage = useCallback(
    (report: ReportRef) =>
      isAdmin ||
      coordinatedDepartmentIds.includes(report.department_id) ||
      (!!profileId && report.created_by_profile_id === profileId && canView(report.department_id)),
    [isAdmin, coordinatedDepartmentIds, profileId, canView],
  )

  const canDelete = useCallback(
    (report: ReportRef) => isSuperAdmin || (!!profileId && report.created_by_profile_id === profileId && canView(report.department_id)),
    [isSuperAdmin, profileId, canView],
  )

  return useMemo(
    () => ({
      // true si puede ver informes de al menos un departamento.
      hasAnyAccess: isAdmin || coordinatedDepartmentIds.length > 0 || memberDepartmentIds.length > 0,
      canViewAll: isAdmin,
      canView,
      canManage,
      canDelete,
    }),
    [isAdmin, coordinatedDepartmentIds, memberDepartmentIds, canView, canManage, canDelete],
  )
}
