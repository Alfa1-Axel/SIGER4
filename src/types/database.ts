import type { RoleKey } from './roles'

export interface Region {
  id: string
  name: string
  code: string
  created_at: string
}

export interface Subsede {
  id: string
  region_id: string
  name: string
  code: string
  created_at: string
}

export type StationStatus = 'operativo' | 'no_operativo'

export interface Station {
  id: string
  region_id: string
  subsede_id: string | null
  name: string
  code: string
  address: string | null
  zone: string | null
  phone: string | null
  whatsapp_phone: string | null
  email: string | null
  social_media: Record<string, string> | null
  description: string | null
  status: StationStatus
  response_time_minutes: number | null
  personnel_count: number
  vehicles_count: number
  founded_year: number | null
  cover_image_url: string | null
  logo_url: string | null
  latitude: number | null
  longitude: number | null
  map_notes: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  avatar_url: string | null
  rank: string | null
  phone: string | null
  position: string | null
  seniority_start_date: string | null
  region_id: string | null
  station_id: string | null
  is_active: boolean
  must_change_password: boolean
  weekly_reminder_enabled: boolean
  weekly_admin_summary_enabled: boolean
  created_at: string
  updated_at: string
}

export interface UserRole {
  id: string
  profile_id: string
  role: RoleKey
  created_at: string
}

export type ScopeType = 'system' | 'region' | 'subsede' | 'station' | 'escuela'

export interface UserScope {
  id: string
  profile_id: string
  scope_type: ScopeType
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_profile_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  reason: string | null
  created_at: string
}

export type NotificationType =
  | 'curso_nuevo'
  | 'circular_nueva'
  | 'asistencia_pendiente'
  | 'estadisticas_nuevas'
  | 'cambio_estado'
  | 'actividad_proxima'
  | 'documento_actualizado'
  | 'reporte_generado'
  | 'prueba'
  | 'recordatorio_semanal'
  | 'prestamo_solicitado'
  | 'prestamo_aprobado'
  | 'prestamo_rechazado'
  | 'prestamo_devuelto'
  | 'alerta_admin'
  | 'prestamo_por_vencer'
  | 'prestamo_vencido'
  | 'actualizacion_sistema'
  | 'informe_departamento'
  // Avisos del sistema para un departamento (0105): te sumaron, ahora
  // coordinás, aval nuevo, actividad registrada.
  | 'aviso_departamento'

export interface Notification {
  id: string
  profile_id: string | null
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  type: NotificationType
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  // Solo para type='actualizacion_sistema': notificaciones de novedades que
  // generaban las versiones anteriores. Ya no se crean ni se muestran (ver
  // HIDDEN_NOTIFICATION_TYPE); la columna sigue en la base. Null en el resto.
  app_update_id: string | null
  // Departamento de origen (0106): solo informativo, para mostrar
  // "Departamento Fuego" y filtrar. Null en el resto.
  department_id: string | null
  // Ruta interna del elemento relacionado (0102). Null en los avisos que no
  // la cargan: la pantalla abre el módulo según el tipo.
  link_path: string | null
}

export interface AttendanceSummary {
  id: string
  station_id: string
  period_start: string
  period_end: string
  attendance_rate: number
  // Dotación activa del cuartel al cargar el resumen (la completa la base,
  // 0104). null si el cuartel no tenía personal cargado. En los resúmenes
  // anteriores es el valor que se cargaba a mano.
  total_members: number | null
  // Solo resúmenes anteriores a 0104 (se cargaba a mano). Ya no se pide.
  present_average: number | null
  observations: string | null
  created_at: string
}

export type InterventionTimeOfDay = 'diurno' | 'nocturno' | 'mixto'

export interface InterventionSummary {
  id: string
  station_id: string
  period_start: string
  period_end: string
  category: string
  total_count: number
  time_of_day: InterventionTimeOfDay | null
  observations: string | null
  personnel_count: number
  vehicles_count: number
  work_hours: number
  created_at: string
}

export type CourseStatus = 'planificado' | 'en_curso' | 'finalizado' | 'cancelado'

export interface Course {
  id: string
  region_id: string
  title: string
  category: string
  status: CourseStatus
  start_date: string | null
  end_date: string | null
  progress_percent: number
  enrolled_count: number
  attendees_count: number | null
  hours: number | null
  days: number | null
  speakers: string | null
  instructor_profile_id: string | null
  created_at: string
  updated_at: string
}

export type VehicleStatus = 'operativo' | 'mantenimiento' | 'fuera_de_servicio' | 'vendido' | 'transferido' | 'baja'

export interface Vehicle {
  id: string
  station_id: string
  internal_code: string
  vehicle_type: string
  status: VehicleStatus
  plate: string | null
  water_capacity_liters: number | null
  crew_capacity: number | null
  observations: string | null
  last_service_at: string | null
  created_at: string
  updated_at: string
}

export interface VehicleStatusHistory {
  id: string
  vehicle_id: string
  previous_status: VehicleStatus
  new_status: VehicleStatus
  reason: string
  changed_by_profile_id: string | null
  station_id: string | null
  created_at: string
}

export type PersonnelStatus = 'activo' | 'licencia' | 'baja' | 'reserva' | 'aspirante' | 'renuncia' | 'pase'

// Dotación actual del cuartel por categorías (0108). `total` lo calcula la base.
export interface StationStaffing {
  station_id: string
  aspirantes_menores: number
  aspirantes_mayores: number
  bomberos_nivel_1: number
  bomberos_nivel_2: number
  bomberos_nivel_3: number
  bomberos_nivel_4: number
  personal_reserva: number
  cuerpo_auxiliar: number
  total: number
  updated_by_profile_id: string | null
  updated_by_name: string | null
  created_at: string
  updated_at: string
}

export interface Personnel {
  id: string
  station_id: string
  first_name: string
  last_name: string
  national_id: string | null
  rank: string | null
  role_function: string | null
  status: PersonnelStatus
  department: string | null
  join_date: string | null
  phone: string | null
  email: string | null
  observations: string | null
  created_at: string
  updated_at: string
}

export interface PersonnelStatusHistory {
  id: string
  personnel_id: string
  previous_status: PersonnelStatus
  new_status: PersonnelStatus
  reason: string
  changed_by_profile_id: string | null
  station_id: string | null
  created_at: string
}

export interface DocumentRecord {
  id: string
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  profile_id: string | null
  title: string
  category: string
  description: string | null
  storage_path: string
  uploaded_by_profile_id: string | null
  folder_id: string | null
  deleted_at: string | null
  deleted_by_profile_id: string | null
  delete_reason: string | null
  purge_after: string | null
  restored_at: string | null
  restored_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export interface DocumentFolder {
  id: string
  name: string
  description: string | null
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  profile_id: string | null
  is_active: boolean
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export interface DocumentVersion {
  id: string
  document_id: string
  storage_path: string
  uploaded_by_profile_id: string | null
  note: string | null
  created_at: string
}

export type InventoryCategory = 'herramienta_manual' | 'mecanica' | 'equipo' | 'elementos_practica' | 'otros'
export type InventoryStatus = 'disponible' | 'no_disponible' | 'mantenimiento' | 'baja'

export interface InventoryItem {
  id: string
  name: string
  category: InventoryCategory
  category_other_label: string | null
  description: string | null
  status: InventoryStatus
  region_id: string
  subsede_id: string | null
  station_id: string | null
  responsible_profile_id: string | null
  responsible_name: string | null
  contact_info: string | null
  observations: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export interface InventoryItemHistory {
  id: string
  inventory_item_id: string
  previous_station_id: string | null
  new_station_id: string | null
  previous_responsible_name: string | null
  new_responsible_name: string | null
  previous_status: InventoryStatus | null
  new_status: InventoryStatus | null
  note: string | null
  changed_by_profile_id: string | null
  created_at: string
}

export type LoanRequestStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'retirada' | 'devuelta' | 'cancelada'

export interface InventoryLoanRequest {
  id: string
  inventory_item_id: string
  requesting_station_id: string
  requested_by_profile_id: string
  responsible_profile_id: string | null
  status: LoanRequestStatus
  request_reason: string | null
  requested_from: string
  expected_return_at: string | null
  approved_by_profile_id: string | null
  approved_at: string | null
  rejected_by_profile_id: string | null
  rejected_at: string | null
  rejection_reason: string | null
  delivered_at: string | null
  delivered_by_profile_id: string | null
  returned_at: string | null
  returned_by_profile_id: string | null
  delivery_condition: string | null
  return_condition: string | null
  notes: string | null
  reminder_sent_at: string | null
  overdue_notified_at: string | null
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  name: string
  description: string | null
  coordinator_profile_id: string | null
  contact_info: string | null
  is_active: boolean
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export interface DepartmentMember {
  id: string
  department_id: string
  profile_id: string
  created_at: string
}

export interface DepartmentManualMember {
  id: string
  department_id: string
  first_name: string
  last_name: string
  station_id: string | null
  role_function: string | null
  contact_info: string | null
  is_active: boolean
  observations: string | null
  linked_profile_id: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export type DepartmentActivityType = 'reunion' | 'capacitacion' | 'practica' | 'mantenimiento' | 'gestion' | 'informe' | 'otro'

export interface DepartmentActivityReport {
  id: string
  department_id: string
  title: string
  description: string | null
  activity_date: string
  activity_type: DepartmentActivityType
  station_id: string | null
  subsede_id: string | null
  attendees_count: number
  hours_worked: number
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

// Informes documentales de un departamento (0098): actas, informes y
// registros fotográficos, con texto y/o adjuntos. Distintos del registro de
// actividad para estadísticas (DepartmentActivityReport).
export type DepartmentReportType =
  | 'acta_reunion'
  | 'informe_operativo'
  | 'informe_administrativo'
  | 'registro_fotografico'
  | 'documentacion'
  | 'otro'

export type DepartmentReportFileKind = 'documento' | 'imagen' | 'video'

export interface DepartmentReportFile {
  id: string
  report_id: string
  department_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  file_kind: DepartmentReportFileKind
  uploaded_by_profile_id: string | null
  created_at: string
}

export interface DepartmentReport {
  id: string
  department_id: string
  report_type: DepartmentReportType
  title: string
  body: string | null
  observations: string | null
  report_date: string
  created_by_profile_id: string | null
  created_by_name: string | null
  is_archived: boolean
  archived_at: string | null
  archived_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export interface DepartmentReportWithFiles extends DepartmentReport {
  files: DepartmentReportFile[]
}

export type StationHistoryCategory =
  | 'institucional'
  | 'operativo'
  | 'personal'
  | 'vehiculos'
  | 'infraestructura'
  | 'capacitacion'
  | 'documentacion'
  | 'autoridad'
  | 'otro'

export interface StationHistoryEvent {
  id: string
  station_id: string
  title: string
  description: string | null
  event_date: string
  category: StationHistoryCategory
  is_highlighted: boolean
  attachments: unknown | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export type CalendarEventType =
  | 'regional'
  | 'cuartel'
  | 'escuela'
  | 'capacitacion'
  | 'vencimiento'
  | 'guardia'
  | 'reunion'
  | 'mantenimiento'
  | 'otro'

export type CalendarEventStatus = 'programado' | 'cancelado' | 'finalizado'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  event_type: CalendarEventType
  starts_at: string
  ends_at: string | null
  all_day: boolean
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  // Evento de un departamento (0103): sin Regional, subsede ni cuartel.
  department_id: string | null
  status: CalendarEventStatus
  notify_on_create: boolean
  notify_before_minutes: number | null
  reminder_sent_at: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

export type ComplianceStatus = 'verde' | 'amarillo' | 'rojo'

export interface StationCompliance {
  station_id: string
  station_name: string
  region_id: string
  subsede_id: string | null
  has_contact_info: boolean
  has_personnel: boolean
  has_vehicles: boolean
  attendance_recent: boolean
  interventions_recent: boolean
  has_documents: boolean
  has_history_events: boolean
  has_calendar_events: boolean
  last_relevant_update_at: string
  compliant_count: number
  compliant_total: number
  compliance_status: ComplianceStatus
}

export type MapReferencePointType = 'ruta' | 'parque_industrial' | 'rio' | 'zona_riesgo' | 'punto_estrategico' | 'otro'

export interface MapReferencePoint {
  id: string
  name: string
  type: MapReferencePointType
  description: string | null
  latitude: number
  longitude: number
  region_id: string | null
  subsede_id: string | null
  station_id: string | null
  is_active: boolean
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

// Departamento tal como lo ve Avales regionales: la fila de departments
// (sección Departamentos) más el nombre de su coordinador.
// list_visible_departments() (0103): departamentos que el usuario puede ver.
export type DepartmentRelation = 'coordinador' | 'integrante'

export interface VisibleDepartment {
  id: string
  name: string
  description: string | null
  contact_info: string | null
  is_active: boolean
  coordinator_profile_id: string | null
  coordinator_name: string | null
  member_count: number
  // null: lo ve por su rol regional (Informática, Secretario Regional,
  // Director de Escuela), sin integrarlo.
  my_relation: DepartmentRelation | null
}

// department_member_directory() (0103).
export interface DepartmentDirectoryEntry {
  member_id: string
  profile_id: string
  full_name: string
  rank: string | null
  email: string
  phone: string | null
  station_id: string | null
  station_name: string | null
  is_active: boolean
}

export interface AvalesDepartment {
  id: string
  name: string
  description: string | null
  is_active: boolean
  coordinator_profile_id: string | null
  coordinator_name: string | null
  // true si el usuario actual es el coordinador de este departamento.
  is_my_department: boolean
}

export interface SchoolAvalDocument {
  id: string
  department_id: string
  title: string
  description: string | null
  observations: string | null
  storage_bucket: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  uploaded_by_profile_id: string | null
  uploaded_by_name: string | null
  is_archived: boolean
  archived_at: string | null
  archived_by_profile_id: string | null
  created_at: string
  updated_at: string
}
