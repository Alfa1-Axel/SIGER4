import type { DocumentRecord, DocumentVisibility } from '../types/database'

// Reglas de Documentos que se ven en pantalla: cómo se llama cada visibilidad,
// de quién es un documento y quién puede cambiarlo. Son comodidad: lo que
// manda es la base (RLS de documents y de Storage, 0110).

export const DOCUMENT_VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  todos: 'Visible para todos',
  alcance: 'Visible solo para su alcance',
  restringido: 'Restringido',
}

export type DocumentScopeKind = 'region' | 'subsede' | 'station' | 'department' | 'profile'

export const DOCUMENT_SCOPE_LABEL: Record<DocumentScopeKind, string> = {
  region: 'Regional',
  subsede: 'Subsede',
  station: 'Cuartel',
  department: 'Departamento',
  profile: 'Usuario específico',
}

// A quién le llega un documento según su alcance (para explicar la visibilidad).
export function scopeAudience(kind: DocumentScopeKind, name?: string): string {
  switch (kind) {
    case 'region':
      return 'las personas de la Regional'
    case 'subsede':
      return name ? `las personas de la subsede ${name}` : 'las personas de esa subsede'
    case 'station':
      return name ? `las personas del cuartel ${name}` : 'las personas de ese cuartel'
    case 'department':
      return name ? `el coordinador y los integrantes de ${name}` : 'el coordinador y los integrantes de ese departamento'
    case 'profile':
      return 'esa persona'
  }
}

// Texto corto debajo de cada opción de visibilidad.
export function visibilityHelp(visibility: DocumentVisibility, kind: DocumentScopeKind, scopeName?: string): string {
  switch (visibility) {
    case 'todos':
      return 'Se publica en General: lo ve cualquier persona con usuario de SIGER4, aunque no sea del alcance elegido.'
    case 'alcance':
      return `Lo ven solo ${scopeAudience(kind, scopeName)}.`
    case 'restringido':
      return 'Lo ven solo quien lo carga y quienes administran los documentos de ese alcance.'
  }
}

export function documentScopeKind(doc: Pick<DocumentRecord, 'region_id' | 'subsede_id' | 'station_id' | 'profile_id' | 'department_id'>): DocumentScopeKind {
  if (doc.department_id) return 'department'
  if (doc.profile_id) return 'profile'
  if (doc.station_id) return 'station'
  if (doc.subsede_id) return 'subsede'
  return 'region'
}

export interface DocumentNames {
  stations: { id: string; name: string }[]
  subsedes: { id: string; name: string }[]
  departments: { id: string; name: string }[]
}

// "Cuartel Villa del Rosario", "Departamento Fuego", "Regional", "Para una persona"…
export function documentScopeLabel(doc: DocumentRecord, names: DocumentNames): string {
  switch (documentScopeKind(doc)) {
    case 'department':
      return `Departamento ${names.departments.find((d) => d.id === doc.department_id)?.name ?? ''}`.trim()
    case 'station':
      return `Cuartel ${names.stations.find((s) => s.id === doc.station_id)?.name ?? ''}`.trim()
    case 'subsede':
      return `Subsede ${names.subsedes.find((s) => s.id === doc.subsede_id)?.name ?? ''}`.trim()
    case 'profile':
      return 'Para una persona'
    default:
      return 'Regional'
  }
}

export interface DocumentAccessContext {
  isAdmin: boolean
  isRegional: boolean
  isStationRole: boolean
  profileId: string | null
  regionIds: string[]
  stationIds: string[]
  coordinatedDepartmentIds: string[]
  memberDepartmentIds: string[]
  // Región de una subsede y de un cuartel (para el Secretario Regional).
  regionOfSubsede: (id: string) => string | null
  regionOfStation: (id: string) => string | null
}

// Publicar para todos: solo Informática y el Secretario Regional (la base lo exige).
export function canPublishToAll(ctx: Pick<DocumentAccessContext, 'isAdmin' | 'isRegional'>): boolean {
  return ctx.isAdmin || ctx.isRegional
}

// Editar, enviar a la papelera y restaurar: espejo de las políticas de la base.
// Informática; el Secretario Regional dentro de su Regional; los roles de carga
// del cuartel dentro de su cuartel; y en un departamento, su coordinador o quien
// lo cargó (si sigue en el departamento).
export function canManageDocument(doc: DocumentRecord, ctx: DocumentAccessContext): boolean {
  if (ctx.isAdmin) return true
  if (doc.department_id) {
    if (ctx.coordinatedDepartmentIds.includes(doc.department_id)) return true
    const inDepartment = ctx.memberDepartmentIds.includes(doc.department_id)
    return inDepartment && Boolean(ctx.profileId) && doc.uploaded_by_profile_id === ctx.profileId
  }
  if (ctx.isRegional) {
    if (doc.region_id && ctx.regionIds.includes(doc.region_id)) return true
    if (doc.subsede_id) {
      const region = ctx.regionOfSubsede(doc.subsede_id)
      if (region && ctx.regionIds.includes(region)) return true
    }
    if (doc.station_id) {
      const region = ctx.regionOfStation(doc.station_id)
      if (region && ctx.regionIds.includes(region)) return true
    }
  }
  if (ctx.isStationRole && doc.station_id && ctx.stationIds.includes(doc.station_id)) return true
  return false
}
