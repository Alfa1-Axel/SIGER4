import { ROLE_DEFINITIONS } from '../../types/roles'
import type { RoleKey } from '../../types/roles'

export const TABLE_LABELS: Record<string, string> = {
  stations: 'Cuarteles',
  profiles: 'Usuarios',
  user_roles: 'Roles de usuario',
  user_scopes: 'Alcances de usuario',
  courses: 'Escuela / Cursos',
  course_stations: 'Cuarteles participantes de un curso',
  vehicles: 'Vehículos',
  personnel: 'Personal / Dotación',
  documents: 'Documentos',
  document_versions: 'Versiones de documentos',
  subsedes: 'Subsedes',
  regions: 'Regionales',
  notifications: 'Notificaciones',
  attendance_summaries: 'Asistencias',
  intervention_summaries: 'Intervenciones',
  reports: 'Reportes',
}

export function translateTable(tableName: string): string {
  return TABLE_LABELS[tableName] ?? tableName
}

export const ACTION_LABELS: Record<string, string> = {
  insert: 'Creación',
  update: 'Modificación',
  delete: 'Eliminación',
  reporte_generado: 'Reporte generado',
  analisis_ia_reporte: 'Análisis con IA',
  solicitud_reporte: 'Solicitud de reporte',
}

export function translateAction(action: string): string {
  return ACTION_LABELS[action] ?? action
}

// Etiquetas de campo, compartidas entre todas las tablas auditadas: son los
// mismos nombres de columna (station_id, title, status, etc.) reutilizados en
// varias tablas con el mismo significado institucional.
export const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  region_id: 'Regional',
  subsede_id: 'Subsede',
  station_id: 'Cuartel',
  profile_id: 'Usuario',
  actor_profile_id: 'Usuario',
  instructor_profile_id: 'Instructor',
  uploaded_by_profile_id: 'Subido por',
  document_id: 'Documento',
  course_id: 'Curso',
  auth_user_id: 'Cuenta de acceso',
  name: 'Nombre',
  full_name: 'Nombre completo',
  first_name: 'Nombre',
  last_name: 'Apellido',
  national_id: 'DNI',
  role_function: 'Cargo / función',
  department: 'Departamento',
  join_date: 'Fecha de ingreso',
  code: 'Código',
  title: 'Título',
  category: 'Categoría',
  description: 'Descripción',
  status: 'Estado',
  phone: 'Teléfono',
  email: 'Email',
  address: 'Dirección',
  zone: 'Zona',
  social_media: 'Redes sociales',
  response_time_minutes: 'Tiempo de respuesta (min)',
  personnel_count: 'Cantidad de personal',
  vehicles_count: 'Cantidad de vehículos',
  founded_year: 'Año de fundación',
  cover_image_url: 'Imagen de portada',
  logo_url: 'Logo',
  avatar_url: 'Foto de perfil',
  rank: 'Jerarquía',
  position: 'Cargo',
  seniority_start_date: 'Antigüedad desde',
  is_active: 'Activo',
  is_read: 'Leído',
  role: 'Rol',
  scope_type: 'Alcance',
  type: 'Tipo',
  body: 'Contenido',
  period_start: 'Inicio del período',
  period_end: 'Fin del período',
  attendance_rate: 'Tasa de asistencia',
  total_members: 'Total de miembros',
  present_average: 'Presentes (promedio)',
  total_count: 'Cantidad total',
  time_of_day: 'Franja horaria',
  work_hours: 'Horas de trabajo',
  start_date: 'Fecha de inicio',
  end_date: 'Fecha de fin',
  progress_percent: 'Progreso (%)',
  enrolled_count: 'Inscriptos',
  attendees_count: 'Asistentes',
  hours: 'Horas',
  days: 'Días',
  speakers: 'Disertantes',
  internal_code: 'Código interno',
  vehicle_type: 'Tipo de vehículo',
  plate: 'Patente',
  water_capacity_liters: 'Capacidad de agua (L)',
  crew_capacity: 'Capacidad de dotación',
  observations: 'Observaciones',
  last_service_at: 'Último service',
  storage_path: 'Archivo',
  note: 'Nota',
  reason: 'Motivo',
  created_at: 'Creado el',
  updated_at: 'Actualizado el',
}

export function translateField(field: string): string {
  return FIELD_LABELS[field] ?? field
}

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_DEFINITIONS.map((r) => [r.key, r.label]))

const STATUS_LABELS: Record<string, string> = {
  operativo: 'Operativo',
  no_operativo: 'No operativo',
  mantenimiento: 'En mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
  planificado: 'Planificado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  activo: 'Activo',
  licencia: 'Licencia',
  baja: 'Baja',
  reserva: 'Reserva',
  aspirante: 'Aspirante',
}

const SCOPE_TYPE_LABELS: Record<string, string> = {
  system: 'Sistema',
  region: 'Regional',
  subsede: 'Subsede',
  station: 'Cuartel',
  escuela: 'Escuela',
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  curso_nuevo: 'Curso nuevo',
  circular_nueva: 'Circular nueva',
  asistencia_pendiente: 'Asistencia pendiente',
  estadisticas_nuevas: 'Estadísticas nuevas',
  cambio_estado: 'Cambio de estado',
  actividad_proxima: 'Actividad próxima',
  documento_actualizado: 'Documento actualizado',
  reporte_generado: 'Reporte generado',
}

const BOOLEAN_LABELS: Record<string, string> = { true: 'Sí', false: 'No' }

// Traduce el VALOR de un campo cuando es un enum/rol/booleano conocido. Los
// UUID de FK (region_id, station_id, etc.) se resuelven aparte, por nombre de
// entidad, via el diccionario que arma buildEntityLookup().
export function translateValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'role' && typeof value === 'string') return ROLE_LABELS[value as RoleKey] ?? value
  if (field === 'status' && typeof value === 'string') return STATUS_LABELS[value] ?? value
  if (field === 'scope_type' && typeof value === 'string') return SCOPE_TYPE_LABELS[value] ?? value
  if (field === 'type' && typeof value === 'string') return NOTIFICATION_TYPE_LABELS[value] ?? value
  if (typeof value === 'boolean') return BOOLEAN_LABELS[String(value)]
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export interface EntityLookup {
  (uuid: string): string | null
}

// Campos que son foreign keys a una entidad con nombre propio: cuando el
// lookup encuentra el uuid, se muestra el nombre en vez del uuid crudo.
const NAME_RESOLVABLE_FIELDS = new Set([
  'region_id',
  'subsede_id',
  'station_id',
  'profile_id',
  'actor_profile_id',
  'instructor_profile_id',
  'uploaded_by_profile_id',
  'document_id',
  'course_id',
])

export function resolveDisplayValue(field: string, value: unknown, lookup: EntityLookup): string {
  if (NAME_RESOLVABLE_FIELDS.has(field) && typeof value === 'string' && value) {
    const resolved = lookup(value)
    if (resolved) return resolved
  }
  return translateValue(field, value)
}

const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at'])

export interface FieldDiff {
  field: string
  label: string
  before: string
  after: string
  changed: boolean
}

// Compara old_value/new_value campo por campo. Para un insert, oldRow es null
// y todos los campos figuran como "nuevos" (before "—"); para un delete,
// newRow es null. Los campos técnicos (id, timestamps) se ocultan porque no
// aportan a una lectura institucional del cambio.
export function buildFieldDiff(
  oldRow: Record<string, unknown> | null,
  newRow: Record<string, unknown> | null,
  lookup: EntityLookup,
): FieldDiff[] {
  const fields = new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])
  const diffs: FieldDiff[] = []

  for (const field of fields) {
    if (HIDDEN_FIELDS.has(field)) continue
    const beforeRaw = oldRow ? oldRow[field] : undefined
    const afterRaw = newRow ? newRow[field] : undefined
    const before = oldRow ? resolveDisplayValue(field, beforeRaw, lookup) : '—'
    const after = newRow ? resolveDisplayValue(field, afterRaw, lookup) : '—'
    const changed = JSON.stringify(beforeRaw) !== JSON.stringify(afterRaw)

    if (!oldRow || !newRow || changed) {
      diffs.push({ field, label: translateField(field), before, after, changed: !oldRow || !newRow || changed })
    }
  }

  return diffs.sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

// Frase simple para la vista principal, ej. "Juan Pérez modificó Cuarteles
// (Villa del Rosario)". Cuando el registro no tiene nombre propio resoluble,
// cae a una frase generica por tabla/accion.
export function buildEventSummary(
  actorName: string | null,
  action: string,
  tableName: string,
  entityName: string | null,
): string {
  const who = actorName ?? 'El sistema'
  const tableLabel = translateTable(tableName)
  const verb = action === 'insert' ? 'creó' : action === 'delete' ? 'eliminó' : action === 'update' ? 'modificó' : null

  if (verb) {
    return entityName ? `${who} ${verb} ${tableLabel.toLowerCase()}: ${entityName}` : `${who} ${verb} un registro de ${tableLabel.toLowerCase()}`
  }

  return `${who} generó un evento de "${translateAction(action)}" en ${tableLabel.toLowerCase()}`
}
