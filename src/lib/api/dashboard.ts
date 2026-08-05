import { supabase } from '../supabaseClient'
import type { AuditLog, CalendarEvent, ComplianceStatus, Notification } from '../../types/database'

export interface DashboardSummary {
  stationsCount: number
  averageAttendanceRate: number | null
  interventionsThisPeriod: number
  coursesActive: number
  vehiclesRegistered: number
  recentNotifications: Notification[]
  recentActivity: AuditLog[]
  upcomingEvents: CalendarEvent[]
  todayEvents: CalendarEvent[]
  upcomingDeadlines: CalendarEvent[]
  complianceCounts: Record<ComplianceStatus, number>
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    stationsRes,
    attendanceRes,
    interventionsRes,
    coursesRes,
    vehiclesRes,
    notificationsRes,
    activityRes,
    upcomingEventsRes,
    todayEventsRes,
    upcomingDeadlinesRes,
    complianceRes,
  ] = await Promise.all([
    supabase.from('stations').select('id', { count: 'exact', head: true }),
    supabase.from('attendance_summaries').select('attendance_rate'),
    supabase
      .from('intervention_summaries')
      .select('total_count'),
    supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'en_curso'),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }),
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('calendar_events')
      .select('*')
      .neq('status', 'cancelado')
      .gte('starts_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
    supabase
      .from('calendar_events')
      .select('*')
      .neq('status', 'cancelado')
      .gte('starts_at', todayStart)
      .lt('starts_at', todayEnd)
      .order('starts_at', { ascending: true }),
    supabase
      .from('calendar_events')
      .select('*')
      .eq('event_type', 'vencimiento')
      .neq('status', 'cancelado')
      .gte('starts_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
    supabase.from('station_compliance').select('compliance_status'),
  ])

  const attendanceRates = (attendanceRes.data ?? []) as { attendance_rate: number }[]
  const averageAttendanceRate = attendanceRates.length
    ? attendanceRates.reduce((sum, row) => sum + row.attendance_rate, 0) / attendanceRates.length
    : null

  const interventions = (interventionsRes.data ?? []) as { total_count: number }[]
  const interventionsThisPeriod = interventions.reduce((sum, row) => sum + row.total_count, 0)

  const complianceRows = (complianceRes.data ?? []) as { compliance_status: ComplianceStatus }[]
  const complianceCounts: Record<ComplianceStatus, number> = { verde: 0, amarillo: 0, rojo: 0 }
  for (const row of complianceRows) complianceCounts[row.compliance_status] += 1

  return {
    stationsCount: stationsRes.count ?? 0,
    averageAttendanceRate,
    interventionsThisPeriod,
    coursesActive: coursesRes.count ?? 0,
    vehiclesRegistered: vehiclesRes.count ?? 0,
    recentNotifications: (notificationsRes.data ?? []) as Notification[],
    recentActivity: (activityRes.data ?? []) as AuditLog[],
    upcomingEvents: (upcomingEventsRes.data ?? []) as CalendarEvent[],
    todayEvents: (todayEventsRes.data ?? []) as CalendarEvent[],
    upcomingDeadlines: (upcomingDeadlinesRes.data ?? []) as CalendarEvent[],
    complianceCounts,
  }
}
