// Alta de Miembros de Departamento por el Coordinador de su departamento.
//
// Regla (v1.17.0): un Coordinador de Departamento puede dar de alta usuarios nuevos, pero SOLO con el rol
// Miembro de Departamento y SOLO en los departamentos que él coordina (activos). Nada de cuarteles, de
// otros roles ni de otra Regional. Esta es la validación del lado servidor que usa admin-create-user;
// es una función pura (sin red ni Deno) para poder probarla aparte. La base repite lo esencial
// (record_delegated_member_creation(), migración 0120) y la RLS de department_members impide sumar a un
// departamento que no se coordina, así que ninguna de las tres capas depende de las otras.

export const DELEGATED_ROLE = 'miembro_departamento'
export const COORDINATOR_ROLE = 'coordinador_departamento'
export const DELEGATED_DAILY_LIMIT = 30
export const DELEGATED_MAX_DEPARTMENTS = 10

export interface CoordinatedDepartment {
  id: string
  name: string
  is_active: boolean
}

export interface DelegatedBody {
  roles?: unknown
  department_ids?: unknown
  region_id?: unknown
  station_id?: unknown
  scope?: {
    scope_type?: unknown
    region_id?: unknown
    subsede_id?: unknown
    station_id?: unknown
  } | null
}

export type DelegatedCheck =
  | { ok: true; departmentIds: string[]; departmentNames: string[]; regionId: string }
  | { ok: false; status: number; error: string }

function deny(status: number, error: string): DelegatedCheck {
  return { ok: false, status, error }
}

const isBlank = (value: unknown) => value === undefined || value === null || value === ''

// actorRoles: roles reales del que invoca (resueltos en el servidor, nunca los que mande el pedido).
// coordinated: departamentos cuyo coordinador es el que invoca (departments.coordinator_profile_id).
// actorRegionId: Regional del perfil del que invoca (la cuenta nueva queda en la misma).
export function checkDelegatedMemberRequest(input: {
  actorIsActive: boolean
  actorRoles: readonly string[]
  actorRegionId: string | null
  coordinated: readonly CoordinatedDepartment[]
  body: DelegatedBody
}): DelegatedCheck {
  const { actorIsActive, actorRoles, actorRegionId, coordinated, body } = input

  if (!actorIsActive || !actorRoles.includes(COORDINATOR_ROLE)) {
    return deny(403, 'Los roles Coordinador y Miembro de Departamento los asigna solo Informática o, para su departamento, el coordinador.')
  }

  // Rol: exactamente Miembro de Departamento.
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles.map(String))] : []
  if (roles.length !== 1 || roles[0] !== DELEGATED_ROLE) {
    return deny(403, 'Como Coordinador de Departamento solo podés crear usuarios con el rol Miembro de Departamento.')
  }

  // Sin cuartel, con la Regional del coordinador: el pedido no puede traer otra cosa.
  if (!isBlank(body.station_id) || !isBlank(body.scope?.station_id) || !isBlank(body.scope?.subsede_id)) {
    return deny(403, 'Un Miembro de Departamento no se asigna a un cuartel ni a una subsede.')
  }
  if (!isBlank(body.scope?.scope_type) && body.scope?.scope_type !== 'region') {
    return deny(403, 'El alcance de un Miembro de Departamento es la Regional.')
  }
  if (!actorRegionId) {
    return deny(403, 'Tu perfil no tiene una Regional asignada. Pedile a Informática y Estadística que la complete.')
  }
  for (const sent of [body.region_id, body.scope?.region_id]) {
    if (!isBlank(sent) && sent !== actorRegionId) {
      return deny(403, 'La Regional del nuevo usuario debe ser la tuya.')
    }
  }

  // Departamentos: al menos uno, sin repetidos, todos coordinados por quien invoca y activos.
  const rawIds = body.department_ids
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return deny(400, 'Elegí el departamento del nuevo miembro.')
  }
  if (rawIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    return deny(400, 'La lista de departamentos no es válida.')
  }
  const ids = rawIds as string[]
  if (new Set(ids).size !== ids.length) {
    return deny(400, 'La lista de departamentos tiene repetidos.')
  }
  if (ids.length > DELEGATED_MAX_DEPARTMENTS) {
    return deny(400, 'Elegiste demasiados departamentos.')
  }
  const byId = new Map(coordinated.map((d) => [d.id, d]))
  const names: string[] = []
  for (const id of ids) {
    const department = byId.get(id)
    if (!department) {
      return deny(403, 'Solo podés dar de alta miembros de los departamentos que coordinás.')
    }
    if (!department.is_active) {
      return deny(403, `El departamento "${department.name}" está inactivo.`)
    }
    names.push(department.name)
  }

  return { ok: true, departmentIds: ids, departmentNames: names, regionId: actorRegionId }
}
