import { ReportBuilder, renderBarChartToDataUrl } from './reportBuilder'
import { requestAiAnalysis } from '../api/aiAnalysis'
import { getCachedAnalysis, setCachedAnalysis } from '../api/aiAnalysisCache'
import { recordAuditEvent } from '../api/audit'
import {
  fetchAttendanceReportData,
  fetchCoursesReportData,
  fetchInterventionReportData,
  fetchRegionalConsolidatedData,
  fetchStationReportData,
  fetchVehiclesReportData,
  type ReportFilters,
} from '../api/reports'

export type ReportKey =
  | 'asistencias'
  | 'intervenciones'
  | 'cursos'
  | 'vehiculos'
  | 'cuartel_general'
  | 'regional_consolidado'

export interface ReportRunContext {
  filters: ReportFilters
  scopeLabel: string
  periodLabel: string
  generatedByLabel: string
  profileId?: string | null
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`
}

const MAX_RANKING_ITEMS = 5

// Resumen compacto para el payload que se manda a Gemini: en vez de una fila
// por cada registro (que en una regional grande puede ser un JSON enorme y
// consume cuota/tokens sin necesidad), se manda solo el ranking de los
// valores mas altos y mas bajos — alcanza para que la IA comente extremos y
// tendencias sin tener que leer la tabla completa (que igual ya esta en el
// PDF, visible para el lector humano).
function topBottomRanking(
  items: { label: string; value: number }[],
): { top: { label: string; value: number }[]; bottom: { label: string; value: number }[]; omitted: number } {
  if (items.length <= MAX_RANKING_ITEMS * 2) {
    return { top: items.slice().sort((a, b) => b.value - a.value), bottom: [], omitted: 0 }
  }
  const sorted = items.slice().sort((a, b) => b.value - a.value)
  return {
    top: sorted.slice(0, MAX_RANKING_ITEMS),
    bottom: sorted.slice(-MAX_RANKING_ITEMS),
    omitted: items.length - MAX_RANKING_ITEMS * 2,
  }
}

const NO_DATA_FALLBACK = 'No hay datos suficientes en este reporte para generar un análisis con IA.'

// Pide el análisis a la Edge Function (o usa el fallback si no está disponible)
// y lo agrega al PDF, dejando registro en auditoría del intento.
async function runAiAnalysis(
  builder: ReportBuilder,
  reportKey: ReportKey,
  reportLabel: string,
  ctx: ReportRunContext,
  summary: Record<string, unknown>,
  hasData: boolean,
) {
  if (!hasData) {
    builder.addAiAnalysisSection(null, NO_DATA_FALLBACK)
    return
  }

  const profileId = ctx.profileId ?? null
  const cached = getCachedAnalysis(reportKey, ctx.filters, profileId)
  const result =
    cached ??
    (await requestAiAnalysis({
      reportKey,
      reportLabel,
      scopeLabel: ctx.scopeLabel,
      periodLabel: ctx.periodLabel,
      summary,
    }))
  if (!cached) setCachedAnalysis(reportKey, ctx.filters, profileId, result)

  builder.addAiAnalysisSection(
    result.available && result.analysis ? result.analysis : null,
    result.reason ?? 'IA no disponible. El reporte se generará igualmente sin análisis automático.',
  )

  await recordAuditEvent({
    action: 'analisis_ia_reporte',
    tableName: 'reports',
    reason: `${reportLabel} · ${ctx.scopeLabel} · ${ctx.periodLabel} · ${result.available ? (cached ? 'reutilizado de cache' : 'generado') : 'no disponible'}`,
  }).catch(() => undefined)
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
      rows.map((r) => Math.round(r.attendance_rate)),
      'Tasa de asistencia (%) por cuartel',
      '%',
    )
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Cuartel', 'Subsede', 'Período', 'Asistencia', 'Miembros', 'Presentes prom.'],
    rows.map((r) => [
      r.station?.name ?? '—',
      r.station?.subsede?.name ?? '—',
      `${r.period_start} a ${r.period_end}`,
      pct(r.attendance_rate),
      r.total_members,
      r.present_average,
    ]),
    'Detalle',
    [55, 40, 45, 'auto', 'auto', 'auto'],
  )

  const attendanceRanking = topBottomRanking(rows.map((r) => ({ label: r.station?.name ?? '—', value: r.attendance_rate })))
  await runAiAnalysis(builder, 'asistencias', 'Reporte de Asistencias', ctx, {
    registros: rows.length,
    asistencia_promedio_pct: rows.length ? Number(average.toFixed(1)) : null,
    cuarteles_con_datos: new Set(rows.map((r) => r.station_id)).size,
    ranking_asistencia_mas_alta: attendanceRanking.top,
    ranking_asistencia_mas_baja: attendanceRanking.bottom,
    cuarteles_no_incluidos_en_ranking: attendanceRanking.omitted,
  }, rows.length > 0)

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
      r.station?.subsede?.name ?? '—',
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

  await runAiAnalysis(builder, 'intervenciones', 'Reporte de Intervenciones', ctx, {
    total_intervenciones: total,
    categorias: Array.from(byCategory.entries()).map(([categoria, cantidad]) => ({ categoria, cantidad })),
    tipo_predominante: predominantCategory,
    cuarteles_con_datos: new Set(rows.map((r) => r.station_id)).size,
    total_personal_involucrado: rows.reduce((sum, r) => sum + r.personnel_count, 0),
    total_moviles_involucrados: rows.reduce((sum, r) => sum + r.vehicles_count, 0),
    total_horas_trabajo: totalWorkHours,
  }, rows.length > 0)

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

  const coursesByCategory = new Map<string, number>()
  for (const row of rows) coursesByCategory.set(row.category, (coursesByCategory.get(row.category) ?? 0) + 1)
  const enrollmentRanking = topBottomRanking(rows.map((c) => ({ label: c.title, value: c.enrolled_count })))
  await runAiAnalysis(builder, 'cursos', 'Reporte de Cursos y Escuela', ctx, {
    cursos: rows.length,
    en_curso: active,
    finalizados: finished,
    categorias: Array.from(coursesByCategory.entries()).map(([categoria, cantidad]) => ({ categoria, cantidad })),
    ranking_inscriptos_mas_alto: enrollmentRanking.top,
    ranking_inscriptos_mas_bajo: enrollmentRanking.bottom,
    cursos_no_incluidos_en_ranking: enrollmentRanking.omitted,
  }, rows.length > 0)

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
      v.station?.subsede?.name ?? '—',
      v.internal_code,
      v.vehicle_type,
      v.status,
      v.plate ?? '—',
    ]),
    'Detalle',
    [55, 40, 30, 40, 35, 'auto'],
  )

  await runAiAnalysis(builder, 'vehiculos', 'Reporte de Vehículos', ctx, {
    total_vehiculos: rows.length,
    operativos: operational,
    en_mantenimiento: maintenance,
    fuera_de_servicio: outOfService,
  }, rows.length > 0)

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
    `Cuartel ${data.station.name} (${data.station.code}), subsede ${data.station.subsede?.name ?? '—'}, estado ${data.station.status}.`,
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

  await runAiAnalysis(builder, 'cuartel_general', `Reporte General — ${data.station.name}`, ctx, {
    cuartel: data.station.name,
    estado: data.station.status,
    asistencia_promedio_pct: data.attendance.length ? Number(avgAttendance.toFixed(1)) : null,
    total_intervenciones: totalInterventions,
    vehiculos: data.vehicles.length,
  }, data.attendance.length > 0 || totalInterventions > 0 || data.vehicles.length > 0)

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
      return Math.round(list.reduce((sum, v) => sum + v, 0) / list.length)
    })
    const chart = renderBarChartToDataUrl(labels, values, 'Asistencia promedio (%) por cuartel', '%')
    if (chart) builder.addBarChartImage(chart)
  }

  builder.addTable(
    ['Cuartel', 'Subsede', 'Estado', 'Vehículos'],
    data.stations.map((s) => [s.name, s.subsede?.name ?? '—', s.status, s.vehicles_count]),
    'Cuarteles',
    [65, 50, 45, 'auto'],
  )

  await runAiAnalysis(builder, 'regional_consolidado', 'Reporte Regional Consolidado', ctx, {
    cuarteles: data.stations.length,
    asistencia_promedio_pct: data.attendance.length ? Number(avgAttendance.toFixed(1)) : null,
    total_intervenciones: totalInterventions,
    cursos: data.courses.length,
    vehiculos: data.vehicles.length,
  }, data.stations.length > 0)

  return builder.finalize()
}

export const REPORT_GENERATORS: Record<ReportKey, (ctx: ReportRunContext) => Promise<import('jspdf').jsPDF>> = {
  asistencias: generateAttendanceReport,
  intervenciones: generateInterventionsReport,
  cursos: generateCoursesReport,
  vehiculos: generateVehiclesReport,
  cuartel_general: generateStationGeneralReport,
  regional_consolidado: generateRegionalConsolidatedReport,
}
