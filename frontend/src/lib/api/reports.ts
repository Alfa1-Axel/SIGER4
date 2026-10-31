import { supabase } from '../supabaseClient'
import type {
  AttendanceSummary,
  CalendarEvent,
  Course,
  Department,
  DepartmentActivityReport,
  DepartmentManualMember,
  DepartmentMember,
  DepartmentReportWithFiles,
  InterventionSummary,
  InventoryItem,
  InventoryLoanRequest,
  Profile,
  Station,
  StationCompliance,
  Subsede,
  Vehicle,
} from '../../types/database'
import { fetchStaffingAsOf } from './stationStaffing'
import type { StaffingSnapshot } from './stationStaffing'
import { fetchStationCompliance } from './compliance'
import { fetchDepartmentReports } from './departmentReports'

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

// Fin del día (hora local) de una fecha AAAA-MM-DD, para filtrar por fecha y hora.
function dayEnd(day: string): string {
  return new Date(day + 'T23:59:59.999').toISOString()
}
function dayStart(day: string): string {
  return new Date(day + 'T00:00:00').toISOString()
}

export interface StationLoanRow {
  id: string
  itemName: string
  status: InventoryLoanRequest['status']
  requestedAt: string
  expectedReturnAt: string | null
}

export interface StationReportData {
  station: StationWithSubsede
  attendance: AttendanceSummary[]
  interventions: InterventionSummary[]
  vehicles: Vehicle[]
  // Efectivos del cuartel: los vigentes al fin del período (o los actuales si
  // no se eligió fin); null si todavía no tenía efectivos cargados a esa fecha.
  staffing: StaffingSnapshot | null
  // Estado de las cargas (semáforo) y, de ahí, lo que falta; null si no se pudo leer.
  compliance: StationCompliance | null
  // Elementos del Inventario Regional que están en el cuartel y los préstamos
  // que pidió en el período.
  inventoryItems: Pick<InventoryItem, 'id' | 'name' | 'category' | 'status'>[]
  loans: StationLoanRow[]
}

async function fetchStationInventory(stationId: string, filters: ReportFilters) {
  const itemsRes = await supabase.from('inventory_items').select('id, name, category, status').eq('station_id', stationId).order('name', { ascending: true })
  if (itemsRes.error) throw itemsRes.error
  let loansQuery = supabase.from('inventory_loan_requests').select('*').eq('requesting_station_id', stationId)
  if (filters.periodStart) loansQuery = loansQuery.gte('created_at', dayStart(filters.periodStart))
  if (filters.periodEnd) loansQuery = loansQuery.lte('created_at', dayEnd(filters.periodEnd))
  const loansRes = await loansQuery.order('created_at', { ascending: false }).limit(40)
  if (loansRes.error) throw loansRes.error
  const loans = (loansRes.data ?? []) as InventoryLoanRequest[]
  const ids = [...new Set(loans.map((l) => l.inventory_item_id))]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const namesRes = await supabase.from('inventory_items').select('id, name').in('id', ids)
    for (const row of (namesRes.data ?? []) as { id: string; name: string }[]) names.set(row.id, row.name)
  }
  return {
    inventoryItems: (itemsRes.data ?? []) as StationReportData['inventoryItems'],
    loans: loans.map((l) => ({
      id: l.id,
      itemName: names.get(l.inventory_item_id) ?? 'Elemento',
      status: l.status,
      requestedAt: l.created_at,
      expectedReturnAt: l.expected_return_at,
    })),
  }
}

export async function fetchStationReportData(stationId: string, filters: ReportFilters): Promise<StationReportData | null> {
  const [stationRes, attendanceRes, interventionsRes, vehiclesRes, staffingMap, compliance, inventory] = await Promise.all([
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
    // Lo que no se pueda leer no frena el reporte: sale sin esa parte.
    fetchStaffingAsOf([stationId], filters.periodEnd ?? null).catch(() => new Map<string, StaffingSnapshot>()),
    fetchStationCompliance()
      .then((rows) => rows.find((r) => r.station_id === stationId) ?? null)
      .catch(() => null),
    fetchStationInventory(stationId, filters).catch(() => ({ inventoryItems: [] as StationReportData['inventoryItems'], loans: [] as StationLoanRow[] })),
  ])

  if (stationRes.error || !stationRes.data) return null
  return {
    station: stationRes.data as unknown as StationWithSubsede,
    attendance: (attendanceRes.data ?? []) as AttendanceSummary[],
    interventions: (interventionsRes.data ?? []) as InterventionSummary[],
    vehicles: (vehiclesRes.data ?? []) as Vehicle[],
    staffing: staffingMap.get(stationId) ?? null,
    compliance,
    inventoryItems: inventory.inventoryItems,
    loans: inventory.loans,
  }
}

export interface RegionalConsolidatedData {
  stations: StationWithSubsede[]
  attendance: AttendanceReportRow[]
  interventions: InterventionReportRow[]
  courses: Course[]
  vehicles: VehicleReportRow[]
  // Efectivos de cada cuartel que los tenía cargados: los vigentes al fin del
  // período (o los actuales si no se eligió fin).
  staffing: Map<string, StaffingSnapshot>
  // Estado de las cargas de cada cuartel (semáforo).
  compliance: StationCompliance[]
}

export async function fetchRegionalConsolidatedData(filters: ReportFilters): Promise<RegionalConsolidatedData> {
  let stationsQuery = supabase.from('stations').select(STATION_WITH_SUBSEDE_SELECT)
  if (filters.stationId) stationsQuery = stationsQuery.eq('id', filters.stationId)
  else if (filters.subsedeId) stationsQuery = stationsQuery.eq('subsede_id', filters.subsedeId)
  else if (filters.regionId) stationsQuery = stationsQuery.eq('region_id', filters.regionId)

  const [stationsRes, attendance, interventions, courses, vehicles, allCompliance] = await Promise.all([
    stationsQuery.order('name', { ascending: true }),
    fetchAttendanceReportData(filters),
    fetchInterventionReportData(filters),
    fetchCoursesReportData(filters),
    fetchVehiclesReportData(filters),
    fetchStationCompliance().catch(() => [] as StationCompliance[]),
  ])

  const stations = (stationsRes.data ?? []) as unknown as StationWithSubsede[]
  const ids = new Set(stations.map((s) => s.id))
  const staffing = await fetchStaffingAsOf([...ids], filters.periodEnd ?? null).catch(() => new Map<string, StaffingSnapshot>())

  return {
    stations,
    attendance,
    interventions,
    courses,
    vehicles,
    staffing,
    compliance: allCompliance.filter((c) => ids.has(c.station_id)),
  }
}

export interface DepartmentReportExtras {
  // Informes y actas del departamento con sus archivos (los ven quienes pueden
  // leerlos: coordinador, integrantes e Informática).
  reports: DepartmentReportWithFiles[]
  events: CalendarEvent[]
}

export async function fetchDepartmentReportExtras(departmentId: string, filters: ReportFilters): Promise<DepartmentReportExtras> {
  const reports = await fetchDepartmentReports(departmentId).catch(() => [] as DepartmentReportWithFiles[])
  let eventsQuery = supabase.from('calendar_events').select('*').eq('department_id', departmentId).neq('status', 'cancelado')
  if (filters.periodStart) eventsQuery = eventsQuery.gte('starts_at', dayStart(filters.periodStart))
  if (filters.periodEnd) eventsQuery = eventsQuery.lte('starts_at', dayEnd(filters.periodEnd))
  const eventsRes = await eventsQuery.order('starts_at', { ascending: false }).limit(60)
  return {
    reports: reports.filter(
      (r) => (!filters.periodStart || r.report_date >= filters.periodStart) && (!filters.periodEnd || r.report_date <= filters.periodEnd),
    ),
    events: eventsRes.error ? [] : ((eventsRes.data ?? []) as CalendarEvent[]),
  }
}

export interface DepartmentWithMembers extends Department {
  members: (DepartmentMember & { profile: Profile | null })[]
  manualMembers: DepartmentManualMember[]
  reports: DepartmentActivityReport[]
}

// Desde 0103, departments/department_members/department_manual_members/
// department_activity_reports se leen por división (can_view_department()):
// Informática, Secretario Regional y Director de Escuela ven todos; el
// coordinador y los integrantes, solo los suyos. ReportesPage.tsx decide qué
// reportes ofrecer; la base decide qué datos entran.
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
