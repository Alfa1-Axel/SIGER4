import { ADMIN_ROLES, getRoleDefinition, roleDivisionNeed } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { UserScope } from '../types/database'

// Un rol con la división donde aplica, listo para mostrar: "Jefe de Cuerpo
// Activo · Cuartel Villa del Rosario", "Coordinador de Departamento · Fuego".
export interface RoleAssignment {
  key: string
  // Rol al que corresponde (de ahí sale su explicación).
  roleKey: RoleKey
  role: string
  division: string
  // El rol pide una división (cuartel, Regional o departamento) que la
  // persona no tiene, o figura en un departamento sin su rol: no ve los
  // datos que le corresponden hasta que se corrija.
  missing: boolean
  kind: 'sistema' | 'regional' | 'escuela' | 'cuartel' | 'departamento' | 'retirado'
  // Qué puede hacer con este rol, en pocas frases (Mi perfil → "Tu rol en
  // SIGER4"). Si falta la división, dice qué falta y a quién consultar.
  summary: string
}

export interface RoleAssignmentInput {
  roles: RoleKey[]
  profileStationId: string | null
  profileRegionId: string | null
  scopes: Pick<UserScope, 'scope_type' | 'region_id' | 'subsede_id' | 'station_id'>[]
  // Departamentos donde figura como coordinador o como miembro
  // (departments.coordinator_profile_id y department_members).
  coordinated: { id: string; name: string }[]
  memberOf: { id: string; name: string }[]
  stationName: (id: string) => string | null
  regionName: (id: string) => string | null
  subsedeName: (id: string) => string | null
}

function uniq(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))]
}

const label = (role: RoleKey) => getRoleDefinition(role)?.label ?? role
const summary = (role: RoleKey) => getRoleDefinition(role)?.selfSummary ?? ''

const ASK = 'Consultá a Informática y Estadística.'
const MISSING_SUMMARY = {
  departamento: `Todavía no tenés un departamento asignado, por eso no ves sus datos. ${ASK}`,
  sinRol: `Figurás en este departamento, pero te falta el rol que da acceso. ${ASK}`,
  cuartel: `Todavía no tenés un cuartel asignado, por eso no ves sus datos. ${ASK}`,
  regional: `Todavía no tenés una Regional asignada, por eso no ves sus datos. ${ASK}`,
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
  const isAdmin = input.roles.some((r) => ADMIN_ROLES.includes(r))

  const result: RoleAssignment[] = []
  for (const role of input.roles) {
    const def = getRoleDefinition(role)
    if (def && !def.assignable) {
      result.push({ key: role, roleKey: role, role: label(role), division: 'Rol retirado: se puede quitar', missing: false, kind: 'retirado', summary: summary(role) })
      continue
    }
    const need = roleDivisionNeed(role)
    if (need === 'department') {
      const departments = role === 'coordinador_departamento' ? input.coordinated : input.memberOf
      if (departments.length === 0) {
        result.push({ key: role, roleKey: role, role: label(role), division: 'Falta asignar el departamento', missing: true, kind: 'departamento', summary: MISSING_SUMMARY.departamento })
      }
      for (const d of departments) {
        result.push({ key: `${role}-${d.id}`, roleKey: role, role: label(role), division: d.name, missing: false, kind: 'departamento', summary: summary(role) })
      }
    } else if (need === 'station') {
      result.push({
        key: role,
        roleKey: role,
        role: label(role),
        division: stationDivision || 'Falta asignar el cuartel',
        missing: !stationDivision,
        kind: 'cuartel',
        summary: stationDivision ? summary(role) : MISSING_SUMMARY.cuartel,
      })
    } else if (need === 'region') {
      const isEscuela = def?.scope === 'escuela'
      const division = regionDivision ? (isEscuela ? `Escuela Regional · ${regionDivision}` : regionDivision) : 'Falta asignar la Regional'
      result.push({
        key: role,
        roleKey: role,
        role: label(role),
        division,
        missing: !regionDivision,
        kind: isEscuela ? 'escuela' : 'regional',
        summary: regionDivision ? summary(role) : MISSING_SUMMARY.regional,
      })
    } else if (def?.scope === 'escuela') {
      result.push({ key: role, roleKey: role, role: label(role), division: def.scopeLabel, missing: false, kind: 'escuela', summary: summary(role) })
    } else {
      result.push({ key: role, roleKey: role, role: label(role), division: def?.scopeLabel ?? 'Todo el sistema', missing: false, kind: 'sistema', summary: summary(role) })
    }
  }

  // Figura en un departamento sin el rol que corresponde: la base no le da
  // acceso (0106). Informática no necesita el rol.
  if (!isAdmin) {
    if (!input.roles.includes('coordinador_departamento')) {
      for (const d of input.coordinated) {
        result.push({
          key: `sin-rol-coord-${d.id}`,
          roleKey: 'coordinador_departamento',
          role: 'Coordinador de Departamento',
          division: `${d.name}: falta el rol, no tiene acceso`,
          missing: true,
          kind: 'departamento',
          summary: MISSING_SUMMARY.sinRol,
        })
      }
    }
    if (!input.roles.includes('miembro_departamento')) {
      for (const d of input.memberOf) {
        result.push({
          key: `sin-rol-miembro-${d.id}`,
          roleKey: 'miembro_departamento',
          role: 'Miembro de Departamento',
          division: `${d.name}: falta el rol, no tiene acceso`,
          missing: true,
          kind: 'departamento',
          summary: MISSING_SUMMARY.sinRol,
        })
      }
    }
  }
  return result
}

// Un rol propio listo para "Tu rol en SIGER4": el rol, dónde aplica y qué puede
// hacer. Los roles de varios departamentos (o cuarteles) se agrupan en un solo
// renglón, con la explicación una sola vez.
export interface OwnRole {
  key: string
  role: string
  divisions: string[]
  summary: string
  missing: boolean
}

export function groupOwnRoles(assignments: RoleAssignment[]): OwnRole[] {
  const groups = new Map<string, OwnRole>()
  for (const a of assignments) {
    const id = `${a.roleKey}:${a.missing ? 'falta' : 'ok'}`
    const current = groups.get(id)
    if (current) {
      if (!current.divisions.includes(a.division)) current.divisions.push(a.division)
      continue
    }
    groups.set(id, { key: id, role: a.role, divisions: [a.division], summary: a.summary, missing: a.missing })
  }
  return [...groups.values()]
}
