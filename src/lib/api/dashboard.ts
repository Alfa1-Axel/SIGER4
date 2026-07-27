import { supabase } from '../supabaseClient'
import type { AuditLog, Notification } from '../../types/database'

export interface DashboardSummary {
  stationsCount: number
  averageAttendanceRate: number | null
  interventionsThisPeriod: number
  coursesActive: number
  vehiclesRegistered: number
  recentNotifications: Notification[]
  recentActivity: AuditLog[]
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const [
    stationsRes,
    attendanceRes,
    interventionsRes,
    coursesRes,
    vehiclesRes,
    notificationsRes,
    activityRes,
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
  ])

  const attendanceRates = (attendanceRes.data ?? []) as { attendance_rate: number }[]
  const averageAttendanceRate = attendanceRates.length
    ? attendanceRates.reduce((sum, row) => sum + row.attendance_rate, 0) / attendanceRates.length
    : null

  const interventions = (interventionsRes.data ?? []) as { total_count: number }[]
  const interventionsThisPeriod = interventions.reduce((sum, row) => sum + row.total_count, 0)

  return {
    stationsCount: stationsRes.count ?? 0,
    averageAttendanceRate,
    interventionsThisPeriod,
    coursesActive: coursesRes.count ?? 0,
    vehiclesRegistered: vehiclesRes.count ?? 0,
    recentNotifications: (notificationsRes.data ?? []) as Notification[],
    recentActivity: (activityRes.data ?? []) as AuditLog[],
  }
}
