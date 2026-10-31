import { useAuth } from './useAuth'
import type { DocumentAccessContext } from '../lib/documentAccess'
import type { Station, Subsede } from '../types/database'

// Quién es la persona frente a los documentos: lo que necesitan las pantallas
// de Documentos para decidir qué botones ofrecer (la base decide de verdad).
// Si la pantalla ya tiene los cuarteles y las subsedes, se los pasa para que
// el Secretario Regional se reconozca dentro de su Regional.
export function useDocumentAccess(stations: Pick<Station, 'id' | 'region_id'>[] = [], subsedes: Pick<Subsede, 'id' | 'region_id'>[] = []): DocumentAccessContext {
  const { profile, scopes, isAdmin, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const stationIds = [profile?.station_id, ...scopes.filter((s) => s.scope_type === 'station').map((s) => s.station_id)].filter(Boolean) as string[]
  const regionIds = [profile?.region_id, ...scopes.filter((s) => s.scope_type === 'region').map((s) => s.region_id)].filter(Boolean) as string[]
  return {
    isAdmin,
    isRegional: hasRole('secretario_regional'),
    isStationRole: hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision'),
    profileId: profile?.id ?? null,
    regionIds,
    stationIds,
    coordinatedDepartmentIds,
    memberDepartmentIds,
    regionOfSubsede: (id) => subsedes.find((s) => s.id === id)?.region_id ?? null,
    regionOfStation: (id) => stations.find((s) => s.id === id)?.region_id ?? null,
  }
}
