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
  status: StationStatus
  response_time_minutes: number | null
  personnel_count: number
  vehicles_count: number
  founded_year: number | null
  cover_image_url: string | null
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
  region_id: string | null
  station_id: string | null
  is_active: boolean
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

export interface InterventionSummary {
  id: string
  station_id: string
  period_start: string
  period_end: string
  category: string
  total_count: number
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

export type VehicleStatus = 'operativo' | 'mantenimiento' | 'fuera_de_servicio'

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

export interface DocumentRecord {
  id: string
  region_id: string | null
  station_id: string | null
  title: string
  category: string
  storage_path: string
  uploaded_by_profile_id: string | null
  created_at: string
  updated_at: string
}
