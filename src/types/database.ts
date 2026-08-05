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
}

export interface AttendanceSummary {
  id: string
  station_id: string
  period_start: string
  period_end: string
  attendance_rate: number
  total_members: number
  present_average: number
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
