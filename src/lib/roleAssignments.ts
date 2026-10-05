import { DEPARTMENT_ROLE_DEFINITIONS, getRoleDefinition, roleDivisionNeed } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { UserScope } from '../types/database'

// Un rol con la división donde aplica, listo para mostrar: "Jefe de Cuerpo
// Activo · Cuartel Villa del Rosario", "Coordinador de departamento · Fuego".
export interface RoleAssignment {
  key: string
  role: string
  division: string
  // El rol pide una división (cuartel o Regional) que la persona no tiene: no
  // ve los datos que le corresponden hasta que se la asignen.
  missing: boolean
  kind: 'sistema' | 'regional' | 'escuela' | 'cuartel' | 'departamento' | 'retirado'
}

export interface RoleAssignmentInput {
  roles: RoleKey[]
  profileStationId: string | null
  profileRegionId: string | null
  scopes: Pick<UserScope, 'scope_type' | 'region_id' | 'subsede_id' | 'station_id'>[]
  coordinated: { id: string; name: string }[]
  memberOf: { id: string; name: string }[]
  stationName: (id: string) => string | null
  regionName: (id: string) => string | null
  subsedeName: (id: string) => string | null
}

function uniq(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))]
}

export function buildRoleAssignments(input: RoleAssignmentInput): RoleAssignment[] {
  const stationIds = uniq([input.profileStationId, ...input.scopes.map((s) => s.station_id)])
  const subsedeIds = uniq(input.scopes.map((s) => s.subsede_id))
  const regionIds = uniq([input.profileRegionId, ...input.scopes.map((s) => s.region_id)])

  const stationDivision = [
    ...stationIds.map((id) => `Cuartel ${input.stationName(id) ?? ''}`.trim()),
    ...subsedeIds.map((id) => input.subsedeName(id) ?? 'Subsede'),
  ].join(', ')
  const regionDivision = regionIds.map((id) => input.regionName(id) ?? 'Regional').join(', ')

  const result: RoleAssignment[] = []
  for (const role of input.roles) {
    const def = getRoleDefinition(role)
    const label = def?.label ?? role
    if (def && !def.assignable) {
      result.push({ key: role, role: label, division: 'Rol retirado: se puede quitar', missing: false, kind: 'retirado' })
      continue
    }
    const need = roleDivisionNeed(role)
    if (need === 'station') {
      result.push({ key: role, role: label, division: stationDivision || 'Falta asignar el cuartel', missing: !stationDivision, kind: 'cuartel' })
    } else if (need === 'region') {
      const isEscuela = def?.scope === 'escuela'
      const division = regionDivision ? (isEscuela ? `Escuela Regional · ${regionDivision}` : regionDivision) : 'Falta asignar la Regional'
      result.push({ key: role, role: label, division, missing: !regionDivision, kind: isEscuela ? 'escuela' : 'regional' })
    } else if (def?.scope === 'escuela') {
      result.push({ key: role, role: label, division: def.scopeLabel, missing: false, kind: 'escuela' })
    } else {
      result.push({ key: role, role: label, division: def?.scopeLabel ?? 'Todo el sistema', missing: false, kind: 'sistema' })
    }
  }

  const [coordinatorDef, memberDef] = DEPARTMENT_ROLE_DEFINITIONS
  for (const d of input.coordinated) {
    result.push({ key: `coord-${d.id}`, role: coordinatorDef.label, division: d.name, missing: false, kind: 'departamento' })
  }
  const coordinatedIds = new Set(input.coordinated.map((d) => d.id))
  for (const d of input.memberOf.filter((m) => !coordinatedIds.has(m.id))) {
    result.push({ key: `member-${d.id}`, role: memberDef.label, division: d.name, missing: false, kind: 'departamento' })
  }
  return result
}
