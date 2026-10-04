import { useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import type { Station } from '../types/database'

const STATION_ROLES = ['jefe_cuerpo_activo', 'presidente_cuartel', 'usuario_carga_cuartel'] as const

// Espejo en pantalla de la policy de alta de inventory_loan_requests (0057):
// Informática y el Secretario Regional solicitan en nombre de cualquier
// cuartel; los roles de cuartel, solo para su propio cuartel. La base es la
// que decide; esto define qué cuarteles ofrecer y qué explicar.
export function useLoanRequestAccess() {
  const { isAdmin, hasRole, profile, scopes } = useAuth()
  const isRegional = hasRole('secretario_regional')
  const isStationRole = hasRole(...STATION_ROLES)

  const ownStationIds = useMemo(
    () => [...new Set([profile?.station_id, ...scopes.filter((s) => s.scope_type === 'station').map((s) => s.station_id)].filter(Boolean) as string[])],
    [profile?.station_id, scopes],
  )
  const myRegionIds = useMemo(
    () => [...new Set([profile?.region_id, ...scopes.filter((s) => s.scope_type === 'region').map((s) => s.region_id)].filter(Boolean) as string[])],
    [profile?.region_id, scopes],
  )

  const requestableStations = useCallback(
    (stations: Station[]): Station[] => {
      if (isAdmin) return stations
      return stations.filter(
        (s) =>
          (isStationRole && ownStationIds.includes(s.id)) ||
          // Secretario Regional: los cuarteles de su Regional (si no tiene
          // una asignada, todos, igual que la policy).
          (isRegional && (myRegionIds.length === 0 || myRegionIds.includes(s.region_id))),
      )
    },
    [isAdmin, isRegional, isStationRole, ownStationIds, myRegionIds],
  )

  return useMemo(
    () => ({
      canRequest: isAdmin || isRegional || isStationRole,
      // Solicita en nombre de un cuartel que no es el propio.
      actsOnBehalf: isAdmin || isRegional,
      ownStationIds,
      requestableStations,
    }),
    [isAdmin, isRegional, isStationRole, ownStationIds, requestableStations],
  )
}
