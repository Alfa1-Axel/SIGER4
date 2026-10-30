import type {
  MapPointSheet,
  MapPointSheetPayload,
  MapPointSubtype,
  MapReferencePointType,
  MapSupplyStatus,
  MapVerificationResult,
} from '../types/database'

// Rótulos y reglas de presentación de las fichas del Mapa Regional. Nada de
// acá decide permisos ni estados: eso lo calcula la base (0114/0115).

export const POINT_TYPE_LABEL: Record<MapReferencePointType, string> = {
  ruta: 'Ruta',
  parque_industrial: 'Parque industrial',
  rio: 'Río',
  zona_riesgo: 'Zona de riesgo',
  punto_estrategico: 'Punto estratégico',
  otro: 'Otro',
  lugar_relevante: 'Lugar relevante',
  abastecimiento: 'Abastecimiento',
}

export const SUBTYPE_LABEL: Record<MapPointSubtype, string> = {
  industria: 'Industria',
  escuela: 'Escuela',
  deposito: 'Depósito',
  local: 'Local',
  hidrante: 'Hidrante',
  reserva: 'Reserva de agua',
  cisterna: 'Cisterna',
  otro: 'Otro',
}

// Qué clases admite cada tipo (el mismo criterio que map_reference_points_subtype_check).
export const SUBTYPES_BY_TYPE: Partial<Record<MapReferencePointType, MapPointSubtype[]>> = {
  lugar_relevante: ['industria', 'escuela', 'deposito', 'local', 'otro'],
  abastecimiento: ['hidrante', 'reserva', 'cisterna', 'otro'],
}

export function pointKindLabel(type: MapReferencePointType, subtype?: MapPointSubtype | string | null): string {
  const base = POINT_TYPE_LABEL[type] ?? type
  const sub = subtype ? SUBTYPE_LABEL[subtype as MapPointSubtype] ?? subtype : null
  return sub ? `${base} · ${sub}` : base
}

// Estados de un punto de abastecimiento. Las etiquetas hablan de lo que se
// REGISTRÓ, no de si el punto sirve hoy; ninguna implica disponibilidad.
export const SUPPLY_STATUS_LABEL: Record<MapSupplyStatus, string> = {
  pendiente_verificar: 'Relevado, pendiente de verificar',
  ultima_sin_problemas: 'Última verificación sin problemas informados',
  problema_informado: 'Problema informado',
  pendiente_revision: 'Pendiente de nueva revisión',
}

export const SUPPLY_STATUS_HELP: Record<MapSupplyStatus, string> = {
  pendiente_verificar: 'Todavía no hay una verificación registrada, o la última no se pudo hacer.',
  ultima_sin_problemas: 'Quien verificó no informó problemas en esa fecha. No dice cómo está hoy.',
  problema_informado: 'La última verificación informó un problema y su seguimiento sigue pendiente.',
  pendiente_revision: 'Corresponde volver a verificar: venció el plazo cargado en la ficha o el problema ya se resolvió.',
}

// Sin verde ni rojo de "semáforo": un color no puede sugerir que hay agua.
export const SUPPLY_STATUS_BADGE: Record<MapSupplyStatus, string> = {
  pendiente_verificar: 'badge-neutral',
  ultima_sin_problemas: 'badge-info',
  problema_informado: 'badge-warning',
  pendiente_revision: 'badge-neutral',
}

export const VERIFICATION_RESULT_LABEL: Record<MapVerificationResult, string> = {
  sin_problemas_informados: 'Sin problemas informados',
  problema_informado: 'Problema informado',
  no_se_pudo_verificar: 'No se pudo verificar',
}

export const SHEET_FIELD_LABEL: Record<keyof MapPointSheetPayload, string> = {
  address: 'Dirección o referencia',
  locality: 'Localidad',
  responsible_entity: 'Entidad responsable',
  institutional_contact: 'Contacto institucional',
  access_notes: 'Accesos',
  observations: 'Observaciones',
  documented_risks: 'Riesgos documentados',
  characteristics: 'Características conocidas',
  review_every_days: 'Revisar cada (días)',
  surveyed_on: 'Fecha del relevamiento',
  surveyed_by_name: 'Relevado por',
}

export const NO_INFO = 'Sin información'

export function showOrNoInfo(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NO_INFO
  const text = String(value).trim()
  return text ? text : NO_INFO
}

export function formatDateAr(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// "hace 3 meses": antigüedad de un dato. No usa semáforos ni vence nada: solo informa la edad.
export function ageLabel(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (days < 1) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
  const years = Math.floor(months / 12)
  return years === 1 ? 'hace 1 año' : `hace ${years} años`
}

// Estado de revisión de la ficha: lo que la base sabe de cuándo la validó alguien con permiso.
export function sheetReviewLabel(sheet: Pick<MapPointSheet, 'last_reviewed_at'> | null): string {
  if (!sheet) return 'Sin ficha cargada'
  if (!sheet.last_reviewed_at) return 'Información sin validar'
  return `Información validada ${ageLabel(sheet.last_reviewed_at)} (${formatDateAr(sheet.last_reviewed_at)})`
}

// Qué campos cambiaron entre dos versiones de la ficha (para el historial y las propuestas).
export function changedSheetFields(before: MapPointSheetPayload | null, after: MapPointSheetPayload): (keyof MapPointSheetPayload)[] {
  const fields = Object.keys(SHEET_FIELD_LABEL) as (keyof MapPointSheetPayload)[]
  return fields.filter((field) => {
    if (!(field in after)) return false
    const a = JSON.stringify(before?.[field] ?? null)
    const b = JSON.stringify(after[field] ?? null)
    return a !== b
  })
}
