import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { fetchRegions } from '../lib/api/regions'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { buildRoleAssignments } from '../lib/roleAssignments'
import type { RoleAssignment } from '../lib/roleAssignments'

// Roles y divisiones del usuario actual (Mi perfil). Los nombres salen de lo
// que el propio usuario puede ver: su cuartel, su Regional y sus
// departamentos.
export function useMyRoleAssignments(): RoleAssignment[] {
  const { profile, roles, scopes } = useAuth()
  const [assignments, setAssignments] = useState<RoleAssignment[]>([])

  useEffect(() => {
    if (!profile) return
    let active = true
    Promise.all([
      fetchStations().catch(() => []),
      fetchRegions().catch(() => []),
      fetchSubsedes().catch(() => []),
      fetchVisibleDepartments().catch(() => []),
    ]).then(([stations, regions, subsedes, departments]) => {
      if (!active) return
      setAssignments(
        buildRoleAssignments({
          roles,
          profileStationId: profile.station_id,
          profileRegionId: profile.region_id,
          scopes,
          coordinated: departments.filter((d) => d.my_relation === 'coordinador'),
          memberOf: departments.filter((d) => d.my_relation === 'integrante'),
          stationName: (id) => stations.find((s) => s.id === id)?.name ?? null,
          regionName: (id) => regions.find((r) => r.id === id)?.name ?? null,
          subsedeName: (id) => subsedes.find((s) => s.id === id)?.name ?? null,
        }),
      )
    })
    return () => {
      active = false
    }
  }, [profile, roles, scopes])

  return assignments
}
