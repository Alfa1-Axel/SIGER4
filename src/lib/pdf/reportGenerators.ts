import { ReportBuilder, renderBarChartToDataUrl } from './reportBuilder'
import { shortSubsedeName, stationSummaryLine } from './reportText'
import { truncateDecimals } from '../format'
import {
  fetchAttendanceReportData,
  fetchCoursesReportData,
  fetchDepartmentsReportData,
  fetchInterventionReportData,
  fetchRegionalConsolidatedData,
  fetchStationReportData,
  fetchVehiclesReportData,
  type DepartmentWithMembers,
  type ReportFilters,
} from '../api/reports'
import { DEPARTMENT_ACTIVITY_TYPE_LABEL } from '../../pages/DepartamentoDetallePage'
import { fetchStations } from '../api/stations'
import type { DepartmentActivityType } from '../../types/database'

export type ReportKey =
  | 'asistencias'
  | 'intervenciones'
  | 'cursos'
  | 'vehiculos'
  | 'cuartel_general'
  | 'regional_consolidado'
  | 'departamentos_general'
  | 'departamento_especifico'

export interface ReportRunContext {
  filters: ReportFilters
  scopeLabel: string
  periodLabel: string
  generatedByLabel: string
  profileId?: string | null
  // Solo usado por 'departamento_especifico' — el resto de los reportes se
  // filtra por región/subsede/cuartel via ReportFilters, pero Departamentos no
  // tiene relación con esos campos (un departamento regional no pertenece a un
  // único cuartel/subsede, ver 0042_departments_module.sql).
  departmentId?: string | null
}

// Nunca redondea: 89.94 se muestra "89.9%", no "90%" ni "89%".
function pct(value: number): string {
  return `${truncateDecimals(value, 1)}%`
}

export async function generateAttendanceReport(ctx: ReportRunContext) {
  const rows = await fetchAttendanceReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Asistencias',
    subtitle: 'Resumen de asistencia por cuartel y período',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const average = rows.length ? rows.reduce((sum, r) => sum + r.attendance_rate, 0) / rows.length : 0
  builder.addKpiRow([
    { label: 'Registros', value: String(rows.length) },
    { label: 'Asistencia promedio', value: rows.length ? pct(average) : '—' },
    { label: 'Cuarteles con datos', value: String(new Set(rows.map((r) => r.station_id)).size) },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [
          `Se registraron ${rows.length} resúmenes de asistencia en el período seleccionado.`,
          `La tasa de asistencia promedio fue de ${pct(average)}.`,
        ]
      : ['No hay resúmenes de asistencia cargados para el período y alcance seleccionados.'],
  )

  if (rows.length) {
    const chart = renderBarChartToDataUrl(
      rows.map((r) => r.station?.name ?? '—'),
      rows.map((r) => truncateDecimals(r.attendance_rate, 1)),
      'Tasa de asistencia (%) por cuartel',
      '%',
    )
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Cuartel', 'Subsede', 'Período', 'Asistencia', 'Miembros', 'Presentes prom.'],
    rows.map((r) => [
      r.station?.name ?? '—',
      shortSubsedeName(r.station?.subsede?.name) ?? '—',
      `${r.period_start} a ${r.period_end}`,
      pct(r.attendance_rate),
      r.total_members,
      r.present_average,
    ]),
    'Detalle',
    [55, 40, 45, 'auto', 'auto', 'auto'],
  )

  return builder.finalize()
}

export async function generateInterventionsReport(ctx: ReportRunContext) {
  const rows = await fetchInterventionReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Intervenciones',
    subtitle: 'Intervenciones por categoría, cuartel y período',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const total = rows.reduce((sum, r) => sum + r.total_count, 0)
  const byCategory = new Map<string, number>()
  for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.total_count)
  const predominantCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const totalWorkHours = rows.reduce((sum, r) => sum + r.work_hours, 0)

  builder.addKpiRow([
    { label: 'Total intervenciones', value: String(total) },
    { label: 'Tipo predominante', value: predominantCategory ?? '—' },
    { label: 'Cuarteles con datos', value: String(new Set(rows.map((r) => r.station_id)).size) },
    { label: 'Horas de trabajo', value: totalWorkHours ? String(totalWorkHours) : '—' },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [`Se registraron ${total} intervenciones en el período seleccionado, distribuidas en ${byCategory.size} categorías.`]
      : ['No hay intervenciones cargadas para el período y alcance seleccionados.'],
  )

  if (byCategory.size) {
    const chart = renderBarChartToDataUrl(
      Array.from(byCategory.keys()),
      Array.from(byCategory.values()),
      'Intervenciones por categoría',
    )
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Cuartel', 'Subsede', 'Tipo', 'Período', 'Horario', 'Cantidad', 'Personal', 'Móviles', 'Horas'],
    rows.map((r) => [
      r.station?.name ?? '—',
      shortSubsedeName(r.station?.subsede?.name) ?? '—',
      r.category,
      `${r.period_start} a ${r.period_end}`,
      r.time_of_day ?? '—',
      r.total_count,
      r.personnel_count,
      r.vehicles_count,
      r.work_hours,
    ]),
    'Detalle',
    [50, 35, 40, 40, 25, 'auto', 'auto', 'auto', 'auto'],
  )

  return builder.finalize()
}

export async function generateCoursesReport(ctx: ReportRunContext) {
  const rows = await fetchCoursesReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Cursos y Escuela',
    subtitle: 'Capacitaciones regionales',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
    theme: 'escuela',
  }).init()

  const active = rows.filter((c) => c.status === 'en_curso').length
  const finished = rows.filter((c) => c.status === 'finalizado').length

  builder.addKpiRow([
    { label: 'Cursos', value: String(rows.length) },
    { label: 'En curso', value: String(active) },
    { label: 'Finalizados', value: String(finished) },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [`Se cargaron ${rows.length} cursos en el período, de los cuales ${active} están en curso y ${finished} finalizados.`]
      : ['No hay cursos cargados para el período y alcance seleccionados.'],
  )

  builder.addTable(
    ['Título', 'Categoría', 'Estado', 'Inicio', 'Fin', 'Inscriptos'],
    rows.map((c) => [c.title, c.category, c.status, c.start_date ?? '—', c.end_date ?? '—', c.enrolled_count]),
    'Detalle',
    [70, 45, 35, 30, 30, 'auto'],
  )

  return builder.finalize()
}

export async function generateVehiclesReport(ctx: ReportRunContext) {
  const rows = await fetchVehiclesReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Vehículos',
    subtitle: 'Flota registrada',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const operational = rows.filter((v) => v.status === 'operativo').length
  const maintenance = rows.filter((v) => v.status === 'mantenimiento').length
  const outOfService = rows.filter((v) => v.status === 'fuera_de_servicio').length

  builder.addKpiRow([
    { label: 'Vehículos', value: String(rows.length) },
    { label: 'Operativos', value: String(operational) },
    { label: 'En mantenimiento', value: String(maintenance) },
    { label: 'Fuera de servicio', value: String(outOfService) },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [`La flota relevada tiene ${rows.length} vehículos: ${operational} operativos, ${maintenance} en mantenimiento y ${outOfService} fuera de servicio.`]
      : ['No hay vehículos cargados para el alcance seleccionado.'],
  )

  builder.addTable(
    ['Cuartel', 'Subsede', 'Código', 'Tipo', 'Estado', 'Patente'],
    rows.map((v) => [
      v.station?.name ?? '—',
      shortSubsedeName(v.station?.subsede?.name) ?? '—',
      v.internal_code,
      v.vehicle_type,
      v.status,
      v.plate ?? '—',
    ]),
    'Detalle',
    [55, 40, 30, 40, 35, 'auto'],
  )

  return builder.finalize()
}

export async function generateStationGeneralReport(ctx: ReportRunContext) {
  if (!ctx.filters.stationId) throw new Error('Seleccioná un cuartel para este reporte.')
  const data = await fetchStationReportData(ctx.filters.stationId, ctx.filters)
  if (!data) throw new Error('No se encontró el cuartel seleccionado.')

  const builder = await new ReportBuilder({
    title: `Reporte General — ${data.station.name}`,
    subtitle: 'Asistencia, intervenciones y flota del cuartel',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
    stationLogoUrl: data.station.logo_url,
  }).init()

  const avgAttendance = data.attendance.length
    ? data.attendance.reduce((sum, r) => sum + r.attendance_rate, 0) / data.attendance.length
    : 0
  const totalInterventions = data.interventions.reduce((sum, r) => sum + r.total_count, 0)

  builder.addKpiRow([
    { label: 'Asistencia promedio', value: data.attendance.length ? pct(avgAttendance) : '—' },
    { label: 'Intervenciones', value: String(totalInterventions) },
    { label: 'Vehículos', value: String(data.vehicles.length) },
  ])

  builder.addExecutiveSummary([
    stationSummaryLine(data.station),
    data.attendance.length
      ? `Asistencia promedio del período: ${pct(avgAttendance)}.`
      : 'Sin resúmenes de asistencia cargados en el período.',
    totalInterventions
      ? `Total de intervenciones registradas: ${totalInterventions}.`
      : 'Sin intervenciones registradas en el período.',
  ])

  builder.addTable(
    ['Período', 'Asistencia', 'Miembros', 'Presentes prom.'],
    data.attendance.map((r) => [`${r.period_start} a ${r.period_end}`, pct(r.attendance_rate), r.total_members, r.present_average]),
    'Asistencia',
    [60, 'auto', 'auto', 'auto'],
  )

  builder.addTable(
    ['Categoría', 'Período', 'Cantidad'],
    data.interventions.map((r) => [r.category, `${r.period_start} a ${r.period_end}`, r.total_count]),
    'Intervenciones',
    [60, 60, 'auto'],
  )

  builder.addTable(
    ['Código', 'Tipo', 'Estado', 'Patente'],
    data.vehicles.map((v) => [v.internal_code, v.vehicle_type, v.status, v.plate ?? '—']),
    'Vehículos',
  )

  return builder.finalize()
}

export async function generateRegionalConsolidatedReport(ctx: ReportRunContext) {
  const data = await fetchRegionalConsolidatedData(ctx.filters)

  const builder = await new ReportBuilder({
    title: 'Reporte Regional Consolidado',
    subtitle: 'Vista integral de la Regional 4',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const avgAttendance = data.attendance.length
    ? data.attendance.reduce((sum, r) => sum + r.attendance_rate, 0) / data.attendance.length
    : 0
  const totalInterventions = data.interventions.reduce((sum, r) => sum + r.total_count, 0)

  builder.addKpiRow([
    { label: 'Cuarteles', value: String(data.stations.length) },
    { label: 'Asistencia promedio', value: data.attendance.length ? pct(avgAttendance) : '—' },
    { label: 'Intervenciones', value: String(totalInterventions) },
    { label: 'Cursos', value: String(data.courses.length) },
    { label: 'Vehículos', value: String(data.vehicles.length) },
  ])

  builder.addExecutiveSummary([
    `La regional cuenta con ${data.stations.length} cuarteles dentro del alcance seleccionado.`,
    data.attendance.length
      ? `La asistencia promedio del período fue de ${pct(avgAttendance)}.`
      : 'Sin resúmenes de asistencia cargados en el período.',
    totalInterventions
      ? `Se registraron ${totalInterventions} intervenciones en el período.`
      : 'Sin intervenciones registradas en el período.',
    `Hay ${data.courses.length} cursos y ${data.vehicles.length} vehículos relevados.`,
  ])

  if (data.attendance.length) {
    const byStation = new Map<string, number[]>()
    for (const row of data.attendance) {
      const name = row.station?.name ?? '—'
      const list = byStation.get(name) ?? []
      list.push(row.attendance_rate)
      byStation.set(name, list)
    }
    const labels = Array.from(byStation.keys())
    const values = labels.map((name) => {
      const list = byStation.get(name) ?? []
      return truncateDecimals(list.reduce((sum, v) => sum + v, 0) / list.length, 1)
    })
    const chart = renderBarChartToDataUrl(labels, values, 'Asistencia promedio (%) por cuartel', '%')
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Cuartel', 'Subsede', 'Estado', 'Vehículos'],
    data.stations.map((s) => [s.name, shortSubsedeName(s.subsede?.name) ?? '—', s.status, s.vehicles_count]),
    'Cuarteles',
    [65, 50, 45, 'auto'],
  )

  return builder.finalize()
}

const MONTH_LABEL_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Últimos 6 meses (incluido el actual) con actividad acumulada — mismo
// criterio que el gráfico "Actividades por mes" de DepartamentoDetallePage.
function activityByMonth(departments: DepartmentWithMembers[]): { label: string; activities: number; hours: number }[] {
  const now = new Date()
  const months: { key: string; label: string; activities: number; hours: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ key, label: `${MONTH_LABEL_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, activities: 0, hours: 0 })
  }
  const byKey = new Map(months.map((m) => [m.key, m]))
  for (const department of departments) {
    for (const r of department.reports) {
      const bucket = byKey.get(r.activity_date.slice(0, 7))
      if (bucket) {
        bucket.activities += 1
        bucket.hours += Number(r.hours_worked)
      }
    }
  }
  return months.map(({ label, activities, hours }) => ({ label, activities, hours }))
}

function activityByType(departments: DepartmentWithMembers[]): { label: string; count: number }[] {
  const counts = new Map<DepartmentActivityType, number>()
  for (const department of departments) {
    for (const r of department.reports) counts.set(r.activity_type, (counts.get(r.activity_type) ?? 0) + 1)
  }
  return (Object.keys(DEPARTMENT_ACTIVITY_TYPE_LABEL) as DepartmentActivityType[])
    .map((type) => ({ label: DEPARTMENT_ACTIVITY_TYPE_LABEL[type], count: counts.get(type) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
}

export async function generateDepartmentsGeneralReport(ctx: ReportRunContext) {
  const departments = await fetchDepartmentsReportData()
  const builder = await new ReportBuilder({
    title: 'Departamentos Regionales — General',
    subtitle: 'Resumen consolidado de todos los departamentos regionales',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const activeDepartments = departments.filter((d) => d.is_active)
  const totalMembers = departments.reduce((sum, d) => sum + d.members.length + d.manualMembers.length, 0)
  const totalActivities = departments.reduce((sum, d) => sum + d.reports.length, 0)
  const totalHours = departments.reduce((sum, d) => sum + d.reports.reduce((s, r) => s + Number(r.hours_worked), 0), 0)
  const totalAttendees = departments.reduce((sum, d) => sum + d.reports.reduce((s, r) => s + r.attendees_count, 0), 0)

  builder.addKpiRow([
    { label: 'Departamentos', value: String(departments.length) },
    { label: 'Activos', value: String(activeDepartments.length) },
    { label: 'Integrantes', value: String(totalMembers) },
    { label: 'Actividades', value: String(totalActivities) },
    { label: 'Horas acumuladas', value: truncateDecimals(totalHours, 1).toLocaleString('es-AR') },
    { label: 'Asistentes acumulados', value: String(totalAttendees) },
  ])

  builder.addExecutiveSummary([
    `Hay ${departments.length} departamentos regionales cargados, de los cuales ${activeDepartments.length} están activos.`,
    `Entre todos suman ${totalMembers} integrantes (con usuario del sistema o manuales).`,
    totalActivities
      ? `Se registraron ${totalActivities} actividades en total, con ${truncateDecimals(totalHours, 1)} horas y ${totalAttendees} asistentes acumulados.`
      : 'Todavía no hay informes de actividad cargados en ningún departamento.',
  ])

  const byType = activityByType(departments)
  if (byType.length) {
    const chart = renderBarChartToDataUrl(
      byType.map((r) => r.label),
      byType.map((r) => r.count),
      'Actividades por tipo',
    )
    if (chart) builder.addBarChartImage(chart)
  }

  const byMonth = activityByMonth(departments)
  const monthChart = renderBarChartToDataUrl(
    byMonth.map((m) => m.label),
    byMonth.map((m) => m.activities),
    'Actividades por mes (últimos 6 meses)',
  )
  if (monthChart) builder.addBarChartImage(monthChart)

  const ranked = [...departments].sort((a, b) => b.reports.length - a.reports.length)
  builder.addTable(
    ['Departamento', 'Estado', 'Integrantes', 'Actividades', 'Horas', 'Asistentes'],
    ranked.map((d) => [
      d.name,
      d.is_active ? 'Activo' : 'Inactivo',
      d.members.length + d.manualMembers.length,
      d.reports.length,
      truncateDecimals(d.reports.reduce((s, r) => s + Number(r.hours_worked), 0), 1),
      d.reports.reduce((s, r) => s + r.attendees_count, 0),
    ]),
    'Departamentos — más actividad primero',
    [70, 30, 'auto', 'auto', 'auto', 'auto'],
  )

  return builder.finalize()
}

export async function generateDepartmentSpecificReport(ctx: ReportRunContext) {
  if (!ctx.departmentId) throw new Error('Seleccioná un departamento para este reporte.')
  const [[department], stations] = await Promise.all([
    fetchDepartmentsReportData(ctx.departmentId),
    fetchStations(),
  ])
  if (!department) throw new Error('No se encontró el departamento seleccionado.')
  const stationName = (stationId: string | null) => (stationId ? stations.find((s) => s.id === stationId)?.name ?? '—' : '—')

  const builder = await new ReportBuilder({
    title: `Departamento Regional — ${department.name}`,
    subtitle: department.is_active ? 'Departamento activo' : 'Departamento inactivo',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const totalHours = department.reports.reduce((s, r) => s + Number(r.hours_worked), 0)
  const totalAttendees = department.reports.reduce((s, r) => s + r.attendees_count, 0)
  const coordinator = department.members.find((m) => m.profile_id === department.coordinator_profile_id)?.profile

  builder.addKpiRow([
    { label: 'Integrantes', value: String(department.members.length + department.manualMembers.length) },
    { label: 'Actividades', value: String(department.reports.length) },
    { label: 'Horas acumuladas', value: truncateDecimals(totalHours, 1).toLocaleString('es-AR') },
    { label: 'Asistentes acumulados', value: String(totalAttendees) },
  ])

  builder.addExecutiveSummary([
    `Coordinador: ${coordinator?.full_name ?? 'Sin asignar'}.`,
    `${department.members.length} integrantes con usuario del sistema y ${department.manualMembers.length} integrantes manuales (sin usuario).`,
    department.reports.length
      ? `Se registraron ${department.reports.length} actividades, con ${truncateDecimals(totalHours, 1)} horas y ${totalAttendees} asistentes acumulados.`
      : 'Todavía no hay informes de actividad cargados en este departamento.',
  ])

  const byMonth = activityByMonth([department])
  const monthChart = renderBarChartToDataUrl(
    byMonth.map((m) => m.label),
    byMonth.map((m) => m.activities),
    'Actividades por mes (últimos 6 meses)',
  )
  if (monthChart) builder.addBarChartImage(monthChart)

  const byType = activityByType([department])
  if (byType.length) {
    const chart = renderBarChartToDataUrl(
      byType.map((r) => r.label),
      byType.map((r) => r.count),
      'Actividades por tipo',
    )
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Nombre', 'Cuartel'],
    department.members.map((m) => [m.profile?.full_name ?? '—', stationName(m.profile?.station_id ?? null)]),
    'Integrantes con usuario',
  )

  builder.addTable(
    ['Nombre', 'Cargo / función', 'Cuartel', 'Estado'],
    department.manualMembers.map((m) => [
      `${m.first_name} ${m.last_name}`,
      m.role_function ?? '—',
      stationName(m.station_id),
      m.is_active ? 'Activo' : 'Inactivo',
    ]),
    'Integrantes manuales (sin usuario)',
  )

  const stationCounts = new Map<string, number>()
  for (const r of department.reports) {
    const label = r.station_id ? stationName(r.station_id) : null
    if (!label || label === '—') continue
    stationCounts.set(label, (stationCounts.get(label) ?? 0) + 1)
  }
  if (stationCounts.size) {
    builder.addTable(
      ['Cuartel', 'Actividades'],
      [...stationCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => [label, count]),
      'Cuarteles involucrados en las actividades',
    )
  }

  builder.addTable(
    ['Título', 'Tipo', 'Fecha', 'Asistentes', 'Horas'],
    department.reports.map((r) => [
      r.title,
      DEPARTMENT_ACTIVITY_TYPE_LABEL[r.activity_type],
      r.activity_date,
      r.attendees_count,
      truncateDecimals(Number(r.hours_worked), 1),
    ]),
    'Informes de actividad',
    [70, 40, 30, 'auto', 'auto'],
  )

  return builder.finalize()
}

export const REPORT_GENERATORS: Record<ReportKey, (ctx: ReportRunContext) => Promise<import('jspdf').jsPDF>> = {
  asistencias: generateAttendanceReport,
  intervenciones: generateInterventionsReport,
  cursos: generateCoursesReport,
  vehiculos: generateVehiclesReport,
  cuartel_general: generateStationGeneralReport,
  regional_consolidado: generateRegionalConsolidatedReport,
  departamentos_general: generateDepartmentsGeneralReport,
  departamento_especifico: generateDepartmentSpecificReport,
}
