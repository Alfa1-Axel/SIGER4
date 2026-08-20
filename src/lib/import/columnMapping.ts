// Mapeo automático de columnas del archivo -> campos de la tabla destino.
// Reconoce nombres equivalentes (sinónimos institucionales reales, no solo
// una traducción literal) normalizando antes de comparar: minúsculas, sin
// tildes, espacios/guiones colapsados a uno solo. El resultado SIEMPRE se
// muestra al usuario para revisión manual antes de importar -- esto nunca
// mapea "a ciegas" en producción, solo propone un punto de partida.

export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca tildes (á -> a, é -> e, etc.)
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, ' ')
}

export interface ImportFieldDef {
  key: string
  label: string
  required: boolean
  // Alias reconocidos (ya en formato normalizado por normalizeHeader, o se
  // normalizan igual al comparar) -- el nombre del campo real también cuenta
  // como alias implícito.
  aliases: string[]
}

// Definiciones por módulo. Los aliases cubren las variantes pedidas
// explícitamente (móvil/código/número, cuartel/station/sede, subsede,
// teléfono/celular, dominio/patente, tipo/categoría, observaciones/obs,
// período/mes) más variantes obvias adicionales del mismo estilo.
export const IMPORT_FIELD_DEFS: Record<string, ImportFieldDef[]> = {
  personal: [
    { key: 'first_name', label: 'Nombre', required: true, aliases: ['nombre', 'nombres'] },
    { key: 'last_name', label: 'Apellido', required: true, aliases: ['apellido', 'apellidos'] },
    { key: 'station_id', label: 'Cuartel', required: true, aliases: ['cuartel', 'station', 'sede', 'cuartel/sede'] },
    { key: 'national_id', label: 'DNI', required: false, aliases: ['dni', 'documento', 'numero de documento'] },
    { key: 'rank', label: 'Jerarquía', required: false, aliases: ['jerarquia', 'grado', 'rango'] },
    { key: 'role_function', label: 'Cargo / función', required: false, aliases: ['cargo', 'funcion', 'rol'] },
    { key: 'department', label: 'Departamento', required: false, aliases: ['departamento', 'area', 'área'] },
    { key: 'join_date', label: 'Fecha de ingreso', required: false, aliases: ['fecha de ingreso', 'ingreso', 'fecha ingreso'] },
    { key: 'phone', label: 'Teléfono', required: false, aliases: ['telefono', 'celular', 'contacto'] },
    { key: 'email', label: 'Email', required: false, aliases: ['email', 'correo', 'mail'] },
    { key: 'observations', label: 'Observaciones', required: false, aliases: ['observaciones', 'obs', 'notas'] },
  ],
  vehiculos: [
    { key: 'internal_code', label: 'Código interno / Móvil', required: true, aliases: ['movil', 'codigo', 'numero', 'nro', 'codigo interno'] },
    { key: 'station_id', label: 'Cuartel', required: true, aliases: ['cuartel', 'station', 'sede'] },
    { key: 'vehicle_type', label: 'Tipo', required: true, aliases: ['tipo', 'categoria', 'tipo de vehiculo'] },
    { key: 'plate', label: 'Patente / Dominio', required: false, aliases: ['patente', 'dominio'] },
    { key: 'water_capacity_liters', label: 'Capacidad de agua (l)', required: false, aliases: ['capacidad', 'litros', 'capacidad de agua'] },
    { key: 'crew_capacity', label: 'Capacidad de dotación', required: false, aliases: ['dotacion', 'capacidad de dotacion', 'tripulacion'] },
    { key: 'observations', label: 'Observaciones', required: false, aliases: ['observaciones', 'obs', 'notas'] },
  ],
  asistencias: [
    { key: 'station_id', label: 'Cuartel', required: true, aliases: ['cuartel', 'station', 'sede'] },
    { key: 'period_start', label: 'Inicio de período', required: true, aliases: ['periodo', 'período', 'mes', 'inicio', 'periodo inicio', 'desde'] },
    { key: 'period_end', label: 'Fin de período', required: true, aliases: ['fin', 'periodo fin', 'hasta'] },
    { key: 'attendance_rate', label: 'Asistencia (%)', required: true, aliases: ['asistencia', 'porcentaje', 'asistencia %', '% asistencia'] },
    { key: 'total_members', label: 'Total miembros', required: true, aliases: ['miembros', 'total miembros', 'total'] },
    { key: 'present_average', label: 'Presentes promedio', required: true, aliases: ['presentes', 'presentes promedio', 'promedio'] },
  ],
  inventario: [
    { key: 'name', label: 'Nombre', required: true, aliases: ['nombre', 'elemento', 'item'] },
    { key: 'category', label: 'Categoría', required: true, aliases: ['categoria', 'tipo'] },
    { key: 'station_id', label: 'Cuartel', required: false, aliases: ['cuartel', 'station', 'sede'] },
    { key: 'responsible_name', label: 'Responsable', required: false, aliases: ['responsable', 'a cargo'] },
    { key: 'contact_info', label: 'Contacto', required: false, aliases: ['contacto', 'telefono', 'email'] },
    { key: 'observations', label: 'Observaciones', required: false, aliases: ['observaciones', 'obs', 'notas'] },
  ],
}

// Para cada columna del archivo, busca el campo destino cuyo alias
// normalizado coincida exacto, o -- si no hay coincidencia exacta -- cuyo
// alias esté contenido en el nombre de columna (o viceversa), para tolerar
// variantes como "Nº Móvil" -> "movil". Nunca asigna el mismo campo destino
// a dos columnas distintas (la primera coincidencia gana).
export function autoMapColumns(headers: string[], moduleKey: string): Record<string, string> {
  const fields = IMPORT_FIELD_DEFS[moduleKey] ?? []
  const mapping: Record<string, string> = {}
  const usedFields = new Set<string>()

  for (const header of headers) {
    const normalized = normalizeHeader(header)
    let matchedField: string | null = null

    for (const field of fields) {
      if (usedFields.has(field.key)) continue
      const allAliases = [field.key, field.label, ...field.aliases].map(normalizeHeader)
      if (allAliases.includes(normalized)) {
        matchedField = field.key
        break
      }
    }

    if (!matchedField) {
      for (const field of fields) {
        if (usedFields.has(field.key)) continue
        const allAliases = [field.key, field.label, ...field.aliases].map(normalizeHeader)
        if (allAliases.some((alias) => alias.length > 2 && (normalized.includes(alias) || alias.includes(normalized)))) {
          matchedField = field.key
          break
        }
      }
    }

    if (matchedField) {
      mapping[header] = matchedField
      usedFields.add(matchedField)
    }
  }

  return mapping
}
