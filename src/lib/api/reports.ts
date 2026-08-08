import { supabase } from '../supabaseClient'
import type {
  AttendanceSummary,
  Course,
  Department,
  DepartmentActivityReport,
  DepartmentManualMember,
  DepartmentMember,
  InterventionSummary,
  Profile,
  Station,
  Subsede,
  Vehicle,
} from '../../types/database'

const STATION_WITH_SUBSEDE_SELECT = '*, subsede:subsedes(*)'

export interface StationWithSubsede extends Station {
  subsede: Subsede | null
}

export interface ReportFilters {
  periodStart?: string | null
  periodEnd?: string | null
  regionId?: string | null
  subsedeId?: string | null
  stationId?: string | null
}

// RLS ya limita lo que cada usuario puede ver según su alcance (región/subsede/
// cuartel); estos filtros son adicionales, elegidos por el usuario dentro de lo
// que ya le devuelve el backend.
async function stationIdsForScope(filters: ReportFilters): Promise<string[] | null> {
  if (filters.stationId) return [filters.stationId]
  if (!filters.subsedeId && !filters.regionId) return null

  let query = supabase.from('stations').select('id')
  if (filters.subsedeId) query = query.eq('subsede_id', filters.subsedeId)
  else if (filters.regionId) query = query.eq('region_id', filters.regionId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => (row as { id: string }).id)
}

export interface AttendanceReportRow extends AttendanceSummary {
  station: StationWithSubsede | null
}

export async function fetchAttendanceReportData(filters: ReportFilters): Promise<AttendanceReportRow[]> {
  const stationIds = await stationIdsForScope(filters)
  let query = supabase.from('attendance_summaries').select(`*, station:stations(${STATION_WITH_SUBSEDE_SELECT})`)
  if (stationIds) query = query.in('station_id', stationIds)
  if (filters.periodStart) query = query.gte('period_start', filters.periodStart)
  if (filters.periodEnd) query = query.lte('period_end', filters.periodEnd)

  const { data, error } = await query.order('period_start', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as AttendanceReportRow[]
}

export interface InterventionReportRow extends InterventionSummary {
  station: StationWithSubsede | null
}

export async function fetchInterventionReportData(filters: ReportFilters): Promise<InterventionReportRow[]> {
  const stationIds = await stationIdsForScope(filters)
  let query = supabase.from('intervention_summaries').select(`*, station:stations(${STATION_WITH_SUBSEDE_SELECT})`)
  if (stationIds) query = query.in('station_id', stationIds)
  if (filters.periodStart) query = query.gte('period_start', filters.periodStart)
  if (filters.periodEnd) query = query.lte('period_end', filters.periodEnd)

  const { data, error } = await query.order('period_start', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as InterventionReportRow[]
}

export async function fetchCoursesReportData(filters: ReportFilters): Promise<Course[]> {
  let query = supabase.from('courses').select('*')
  if (filters.regionId) query = query.eq('region_id', filters.regionId)
  if (filters.periodStart) query = query.gte('start_date', filters.periodStart)
  if (filters.periodEnd) query = query.lte('end_date', filters.periodEnd)

  const { data, error } = await query.order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Course[]
}

export interface VehicleReportRow extends Vehicle {
  station: StationWithSubsede | null
}

export async function fetchVehiclesReportData(filters: ReportFilters): Promise<VehicleReportRow[]> {
  const stationIds = await stationIdsForScope(filters)
  let query = supabase.from('vehicles').select(`*, station:stations(${STATION_WITH_SUBSEDE_SELECT})`)
  if (stationIds) query = query.in('station_id', stationIds)

  const { data, error } = await query.order('internal_code', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as VehicleReportRow[]
}

export interface StationReportData {
  station: StationWithSubsede
  attendance: AttendanceSummary[]
  interventions: InterventionSummary[]
  vehicles: Vehicle[]
}

export async function fetchStationReportData(stationId: string, filters: ReportFilters): Promise<StationReportData | null> {
  const [stationRes, attendanceRes, interventionsRes, vehiclesRes] = await Promise.all([
    supabase.from('stations').select(STATION_WITH_SUBSEDE_SELECT).eq('id', stationId).single(),
    (() => {
      let q = supabase.from('attendance_summaries').select('*').eq('station_id', stationId)
      if (filters.periodStart) q = q.gte('period_start', filters.periodStart)
      if (filters.periodEnd) q = q.lte('period_end', filters.periodEnd)
      return q.order('period_start', { ascending: true })
    })(),
    (() => {
      let q = supabase.from('intervention_summaries').select('*').eq('station_id', stationId)
      if (filters.periodStart) q = q.gte('period_start', filters.periodStart)
      if (filters.periodEnd) q = q.lte('period_end', filters.periodEnd)
      return q.order('period_start', { ascending: true })
    })(),
    supabase.from('vehicles').select('*').eq('station_id', stationId).order('internal_code', { ascending: true }),
  ])

  if (stationRes.error || !stationRes.data) return null
  return {
    station: stationRes.data as unknown as StationWithSubsede,
    attendance: (attendanceRes.data ?? []) as AttendanceSummary[],
    interventions: (interventionsRes.data ?? []) as InterventionSummary[],
    vehicles: (vehiclesRes.data ?? []) as Vehicle[],
  }
}

export interface RegionalConsolidatedData {
  stations: StationWithSubsede[]
  attendance: AttendanceReportRow[]
  interventions: InterventionReportRow[]
  courses: Course[]
  vehicles: VehicleReportRow[]
}

export async function fetchRegionalConsolidatedData(filters: ReportFilters): Promise<RegionalConsolidatedData> {
  let stationsQuery = supabase.from('stations').select(STATION_WITH_SUBSEDE_SELECT)
  if (filters.stationId) stationsQuery = stationsQuery.eq('id', filters.stationId)
  else if (filters.subsedeId) stationsQuery = stationsQuery.eq('subsede_id', filters.subsedeId)
  else if (filters.regionId) stationsQuery = stationsQuery.eq('region_id', filters.regionId)

  const [stationsRes, attendance, interventions, courses, vehicles] = await Promise.all([
    stationsQuery.order('name', { ascending: true }),
    fetchAttendanceReportData(filters),
    fetchInterventionReportData(filters),
    fetchCoursesReportData(filters),
    fetchVehiclesReportData(filters),
  ])

  return {
    stations: (stationsRes.data ?? []) as unknown as StationWithSubsede[],
    attendance,
    interventions,
    courses,
    vehicles,
  }
}

export interface DepartmentWithMembers extends Department {
  members: (DepartmentMember & { profile: Profile | null })[]
  manualMembers: DepartmentManualMember[]
  reports: DepartmentActivityReport[]
}

// departments/department_members/department_manual_members/department_activity_reports
// tienen lectura abierta a cualquier autenticado (auth.role() = 'authenticated',
// sin scope territorial) — el control de quién puede generar este reporte vive
// en ReportesPage.tsx (ReportsRoute + lógica de rol/coordinador), no en RLS.
export async function fetchDepartmentsReportData(departmentId?: string | null): Promise<DepartmentWithMembers[]> {
  let departmentsQuery = supabase.from('departments').select('*').order('name', { ascending: true })
  if (departmentId) departmentsQuery = departmentsQuery.eq('id', departmentId)

  const [departmentsRes, membersRes, manualMembersRes, reportsRes] = await Promise.all([
    departmentsQuery,
    supabase.from('department_members').select('*, profile:profiles(*)'),
    supabase.from('department_manual_members').select('*'),
    supabase.from('department_activity_reports').select('*').order('activity_date', { ascending: false }),
  ])

  if (departmentsRes.error) throw departmentsRes.error
  if (membersRes.error) throw membersRes.error
  if (manualMembersRes.error) throw manualMembersRes.error
  if (reportsRes.error) throw reportsRes.error

  const departments = (departmentsRes.data ?? []) as Department[]
  const members = (membersRes.data ?? []) as unknown as (DepartmentMember & { profile: Profile | null })[]
  const manualMembers = (manualMembersRes.data ?? []) as DepartmentManualMember[]
  const reports = (reportsRes.data ?? []) as DepartmentActivityReport[]

  return departments.map((department) => ({
    ...department,
    members: members.filter((m) => m.department_id === department.id),
    manualMembers: manualMembers.filter((m) => m.department_id === department.id),
    reports: reports.filter((r) => r.department_id === department.id),
  }))
}
