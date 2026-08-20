import { VEHICLE_TYPE_OPTIONS } from '../../pages/VehiculoFormPage'
import type { ImportModule } from '../../types/database'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  // Fila ya mapeada (columna de archivo -> campo destino) y con los valores
  // convertidos al tipo esperado (número, fecha ISO, etc.) -- lista para
  // insertar si valid=true.
  mapped: Record<string, unknown>
}

const PERSONNEL_STATUS_VALUES = ['activo', 'licencia', 'baja', 'reserva', 'aspirante', 'renuncia', 'pase']
const VEHICLE_STATUS_VALUES = ['operativo', 'mantenimiento', 'fuera_de_servicio', 'vendido', 'transferido', 'baja']
const INVENTORY_STATUS_VALUES = ['disponible', 'no_disponible', 'mantenimiento', 'baja']
const INVENTORY_CATEGORY_VALUES = ['herramienta_manual', 'mecanica', 'equipo', 'elementos_practica', 'otros']

// Nunca redondea un porcentaje -- mismo criterio que truncateDecimals()
// (src/lib/format.ts) usado en toda la app para no falsear datos de
// asistencia por redondeo.
function parsePercent(raw: string): number | null {
  const cleaned = raw.replace('%', '').replace(',', '.').trim()
  const value = Number(cleaned)
  return Number.isFinite(value) ? Math.trunc(value * 10) / 10 : null
}

function parseInteger(raw: string): number | null {
  const value = Number(raw.trim())
  return Number.isInteger(value) ? value : null
}

// Acepta AAAA-MM-DD (formato nativo del sistema) o DD/MM/AAAA (formato más
// común al exportar de Excel en configuración regional es-AR).
function parseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

interface RowValidationContext {
  stationsByName: Map<string, string> // nombre normalizado -> id
  stationsByCode: Map<string, string> // código normalizado -> id
}

// Valida y convierte una fila ya mapeada (columna de archivo -> campo
// destino) según las reglas del módulo. Nunca inventa datos: si un campo
// obligatorio falta o no matchea un valor permitido, la fila entera queda
// inválida con el motivo exacto -- no se rellena con un valor por defecto.
export function validateMappedRow(
  moduleKey: ImportModule,
  rawRow: Record<string, string>,
  mapping: Record<string, string>,
  ctx: RowValidationContext,
): ValidationResult {
  const errors: string[] = []
  const mapped: Record<string, unknown> = {}

  // Invierte el mapeo (campo destino -> valor crudo de la columna que se le asignó).
  const valueByField: Record<string, string> = {}
  for (const [column, field] of Object.entries(mapping)) {
    valueByField[field] = (rawRow[column] ?? '').trim()
  }

  function resolveStation(raw: string): string | null {
    const normalized = raw.trim().toLowerCase()
    if (!normalized) return null
    return ctx.stationsByCode.get(normalized) ?? ctx.stationsByName.get(normalized) ?? null
  }

  if (moduleKey === 'personal') {
    if (!valueByField.first_name) errors.push('Falta el nombre.')
    if (!valueByField.last_name) errors.push('Falta el apellido.')
    const stationId = resolveStation(valueByField.station_id ?? '')
    if (!valueByField.station_id) errors.push('Falta el cuartel.')
    else if (!stationId) errors.push(`No se encontró el cuartel "${valueByField.station_id}".`)

    mapped.first_name = valueByField.first_name
    mapped.last_name = valueByField.last_name
    mapped.station_id = stationId
    mapped.national_id = valueByField.national_id || null
    mapped.rank = valueByField.rank || null
    mapped.role_function = valueByField.role_function || null
    mapped.department = valueByField.department || null
    mapped.phone = valueByField.phone || null
    mapped.email = valueByField.email || null
    mapped.observations = valueByField.observations || null
    mapped.status = 'activo'

    if (valueByField.join_date) {
      const joinDate = parseDate(valueByField.join_date)
      if (!joinDate) errors.push(`Fecha de ingreso inválida: "${valueByField.join_date}" (usar AAAA-MM-DD o DD/MM/AAAA).`)
      mapped.join_date = joinDate
    }
  }

  if (moduleKey === 'vehiculos') {
    if (!valueByField.internal_code) errors.push('Falta el código interno / móvil.')
    const stationId = resolveStation(valueByField.station_id ?? '')
    if (!valueByField.station_id) errors.push('Falta el cuartel.')
    else if (!stationId) errors.push(`No se encontró el cuartel "${valueByField.station_id}".`)

    const vehicleType = valueByField.vehicle_type?.trim()
    if (!vehicleType) errors.push('Falta el tipo de vehículo.')
    else if (!VEHICLE_TYPE_OPTIONS.includes(vehicleType)) {
      errors.push(
        `Tipo de vehículo "${vehicleType}" no coincide con ninguna opción institucional (revisar mayúsculas/redacción exacta, ej. "${VEHICLE_TYPE_OPTIONS[0]}").`,
      )
    }

    mapped.internal_code = valueByField.internal_code
    mapped.station_id = stationId
    mapped.vehicle_type = vehicleType
    mapped.plate = valueByField.plate || null
    mapped.observations = valueByField.observations || null
    mapped.status = 'operativo'

    if (valueByField.water_capacity_liters) {
      const liters = parseInteger(valueByField.water_capacity_liters)
      if (liters === null) errors.push(`Capacidad de agua inválida: "${valueByField.water_capacity_liters}".`)
      mapped.water_capacity_liters = liters
    }
    if (valueByField.crew_capacity) {
      const crew = parseInteger(valueByField.crew_capacity)
      if (crew === null) errors.push(`Capacidad de dotación inválida: "${valueByField.crew_capacity}".`)
      mapped.crew_capacity = crew
    }
  }

  if (moduleKey === 'asistencias') {
    const stationId = resolveStation(valueByField.station_id ?? '')
    if (!valueByField.station_id) errors.push('Falta el cuartel.')
    else if (!stationId) errors.push(`No se encontró el cuartel "${valueByField.station_id}".`)
    mapped.station_id = stationId

    const periodStart = parseDate(valueByField.period_start ?? '')
    if (!valueByField.period_start) errors.push('Falta el inicio del período.')
    else if (!periodStart) errors.push(`Inicio de período inválido: "${valueByField.period_start}".`)
    mapped.period_start = periodStart

    const periodEnd = parseDate(valueByField.period_end ?? '')
    if (!valueByField.period_end) errors.push('Falta el fin del período.')
    else if (!periodEnd) errors.push(`Fin de período inválido: "${valueByField.period_end}".`)
    mapped.period_end = periodEnd

    const attendanceRate = parsePercent(valueByField.attendance_rate ?? '')
    if (!valueByField.attendance_rate) errors.push('Falta el porcentaje de asistencia.')
    else if (attendanceRate === null || attendanceRate < 0 || attendanceRate > 100) {
      errors.push(`Porcentaje de asistencia inválido: "${valueByField.attendance_rate}" (debe estar entre 0 y 100).`)
    }
    mapped.attendance_rate = attendanceRate

    const totalMembers = parseInteger(valueByField.total_members ?? '')
    if (!valueByField.total_members) errors.push('Falta el total de miembros.')
    else if (totalMembers === null || totalMembers < 0) errors.push(`Total de miembros inválido: "${valueByField.total_members}".`)
    mapped.total_members = totalMembers

    const presentAverage = parseInteger(valueByField.present_average ?? '')
    if (!valueByField.present_average) errors.push('Falta el promedio de presentes.')
    else if (presentAverage === null || presentAverage < 0) errors.push(`Promedio de presentes inválido: "${valueByField.present_average}".`)
    mapped.present_average = presentAverage
  }

  if (moduleKey === 'inventario') {
    if (!valueByField.name) errors.push('Falta el nombre del ítem.')

    const categoryRaw = valueByField.category?.trim().toLowerCase().replace(/\s+/g, '_')
    if (!valueByField.category) errors.push('Falta la categoría.')
    else if (!INVENTORY_CATEGORY_VALUES.includes(categoryRaw)) {
      errors.push(`Categoría "${valueByField.category}" no reconocida (valores permitidos: ${INVENTORY_CATEGORY_VALUES.join(', ')}).`)
    }

    mapped.name = valueByField.name
    mapped.category = INVENTORY_CATEGORY_VALUES.includes(categoryRaw) ? categoryRaw : null
    mapped.responsible_name = valueByField.responsible_name || null
    mapped.contact_info = valueByField.contact_info || null
    mapped.observations = valueByField.observations || null
    mapped.status = 'disponible'

    if (valueByField.station_id) {
      const stationId = resolveStation(valueByField.station_id)
      if (!stationId) errors.push(`No se encontró el cuartel "${valueByField.station_id}".`)
      mapped.station_id = stationId
    } else {
      mapped.station_id = null
    }
  }

  return { valid: errors.length === 0, errors, mapped }
}

export { PERSONNEL_STATUS_VALUES, VEHICLE_STATUS_VALUES, INVENTORY_STATUS_VALUES, INVENTORY_CATEGORY_VALUES }
