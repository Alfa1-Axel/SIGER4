import { ReportBuilder, renderBarChartToDataUrl } from './reportBuilder'
import { shortSubsedeName, stationSummaryLine } from './reportText'
import type { ReportSection } from './reportSections'
import { formatBytes, truncateDecimals } from '../format'
import { STAFFING_CATEGORIES, STAFFING_TOTAL_NOTE } from '../staffing'
import {
  fetchAttendanceReportData,
  fetchCoursesReportData,
  fetchDepartmentReportExtras,
  fetchDepartmentsReportData,
  fetchInterventionReportData,
  fetchRegionalConsolidatedData,
  fetchStationReportData,
  fetchVehiclesReportData,
  type DepartmentWithMembers,
  type ReportFilters,
} from '../api/reports'
import { COMPLIANCE_STATUS_LABEL, complianceReasons } from '../api/compliance'
import { DEPARTMENT_REPORT_TYPE_LABEL } from '../api/departmentReports'
import { DEPARTMENT_ACTIVITY_TYPE_LABEL } from '../../pages/DepartamentoDetallePage'
import { EVENT_TYPE_LABEL } from '../../pages/CalendarioPage'
import { INVENTORY_CATEGORY_LABEL, INVENTORY_STATUS_LABEL } from '../../pages/InventarioPage'
import { LOAN_REQUEST_STATUS_LABEL } from '../../pages/SolicitudesPrestamoPage'
import { fetchStations } from '../api/stations'
import type { AttendanceSummary, DepartmentActivityType, DepartmentReportFileKind } from '../../types/database'

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
  // Lo que se eligió para armar el reporte, para imprimirlo bajo el
  // encabezado ("Cuartel: Luque", "Incluye: Efectivos, Asistencia"…).
  filtersApplied?: string[]
  // Secciones a incluir en los reportes que las dejan elegir (reportSections.ts).
  // Sin esto, van todas.
  sections?: ReportSection[]
  profileId?: string | null
  // Solo usado por 'departamento_especifico' — el resto de los reportes se
  // filtra por región/subsede/cuartel via ReportFilters, pero Departamentos no
  // tiene relación con esos campos (un departamento regional no pertenece a un
  // único cuartel/subsede, ver 0042_departments_module.sql).
  departmentId?: string | null
}

const has = (ctx: ReportRunContext, section: ReportSection) => !ctx.sections || ctx.sections.includes(section)

// Nunca redondea: 89.94 se muestra "89.9%", no "90%" ni "89%".
function pct(value: number): string {
  return `${truncateDecimals(value, 1)}%`
}

// Fecha como se lee en el Cuerpo: 05/10/2026.
function dmy(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : value
}

function period(start: string, end: string): string {
  return `${dmy(start)} al ${dmy(end)}`
}

// "fuera_de_servicio" → "Fuera de servicio".
function nice(value: string | null | undefined): string {
  if (!value) return '—'
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function shorten(text: string | null | undefined, max = 70): string {
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// Variación de la asistencia respecto del resumen anterior del mismo cuartel
// dentro de lo que trae el reporte; el primero de cada cuartel no tiene con qué
// compararse.
function variationText(delta: number | null): string {
  if (delta == null) return '—'
  const magnitude = Math.abs(truncateDecimals(delta, 1)).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (delta > 0) return `+${magnitude} pts`
  if (delta < 0) return `−${magnitude} pts`
  return '0,0 pts'
}

function attendanceVariations(rows: Pick<AttendanceSummary, 'station_id' | 'period_start' | 'attendance_rate'>[]): Map<object, number | null> {
  const result = new Map<object, number | null>()
  const lastByStation = new Map<string, number>()
  for (const row of [...rows].sort((a, b) => a.period_start.localeCompare(b.period_start))) {
    const previous = lastByStation.get(row.station_id)
    result.set(row, previous == null ? null : row.attendance_rate - previous)
    lastByStation.set(row.station_id, row.attendance_rate)
  }
  return result
}

const REFERENCE_NOTE =
  'Efectivos de referencia: los que tenía el cuartel al cargar el resumen; no cambian si después cambian sus efectivos. "—" indica que todavía no tenía efectivos cargados.'

export async function generateAttendanceReport(ctx: ReportRunContext) {
  const rows = await fetchAttendanceReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Asistencia',
    subtitle: 'Resumen de asistencia por cuartel y período',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const average = rows.length ? rows.reduce((sum, r) => sum + r.attendance_rate, 0) / rows.length : 0
  const withEffectives = rows.filter((r) => r.total_members != null).length
  builder.addKpiRow([
    { label: 'Resúmenes cargados', value: String(rows.length) },
    { label: 'Asistencia promedio', value: rows.length ? pct(average) : '—' },
    { label: 'Cuarteles con datos', value: String(new Set(rows.map((r) => r.station_id)).size) },
    { label: 'Con efectivos de referencia', value: rows.length ? `${withEffectives} de ${rows.length}` : '—' },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [
          `Se cargaron ${rows.length} resúmenes de asistencia en el período seleccionado.`,
          `La tasa de asistencia promedio fue de ${pct(average)}.`,
          'La asistencia se carga como tasa del período: no hay registro diario por persona, por eso no se informa promedio de presentes.',
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

  // "Presentes prom." solo existe en resúmenes anteriores a 0104 (se cargaba
  // a mano): la columna aparece únicamente si alguno lo tiene.
  const withLegacyAverage = rows.some((r) => r.present_average != null)
  const variations = attendanceVariations(rows)
  builder.addTable(
    ['Cuartel', 'Subsede', 'Período', 'Asistencia', 'Variación', 'Efectivos de referencia', 'Observaciones', ...(withLegacyAverage ? ['Presentes prom.'] : [])],
    rows.map((r) => [
      r.station?.name ?? '—',
      shortSubsedeName(r.station?.subsede?.name) ?? '—',
      period(r.period_start, r.period_end),
      pct(r.attendance_rate),
      variationText(variations.get(r) ?? null),
      r.total_members ?? '—',
      shorten(r.observations),
      ...(withLegacyAverage ? [r.present_average ?? '—'] : []),
    ]),
    'Detalle por cuartel y período',
    [48, 30, 44, 22, 24, 26, 'auto', ...(withLegacyAverage ? ['auto' as const] : [])],
  )
  if (rows.length) builder.addNote(`Variación: diferencia de la tasa respecto del resumen anterior del mismo cuartel que figura en este reporte. ${REFERENCE_NOTE}`)

  return builder.finalize()
}

export async function generateInterventionsReport(ctx: ReportRunContext) {
  const rows = await fetchInterventionReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Intervenciones',
    subtitle: 'Intervenciones por categoría, cuartel y período',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
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
    ['Cuartel', 'Subsede', 'Tipo', 'Período', 'Horario', 'Cantidad', 'Personal interviniente', 'Móviles', 'Horas'],
    rows.map((r) => [
      r.station?.name ?? '—',
      shortSubsedeName(r.station?.subsede?.name) ?? '—',
      r.category,
      period(r.period_start, r.period_end),
      nice(r.time_of_day),
      r.total_count,
      r.personnel_count,
      r.vehicles_count,
      r.work_hours,
    ]),
    'Detalle',
    [48, 30, 38, 44, 20, 'auto', 'auto', 'auto', 'auto'],
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
    filtersLabel: ctx.filtersApplied,
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
    rows.map((c) => [c.title, c.category, nice(c.status), dmy(c.start_date), dmy(c.end_date), c.enrolled_count]),
    'Detalle',
    [70, 45, 35, 30, 30, 'auto'],
  )

  return builder.finalize()
}

export async function generateVehiclesReport(ctx: ReportRunContext) {
  const rows = await fetchVehiclesReportData(ctx.filters)
  const builder = await new ReportBuilder({
    title: 'Reporte de Móviles',
    subtitle: 'Móviles registrados',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const operational = rows.filter((v) => v.status === 'operativo').length
  const maintenance = rows.filter((v) => v.status === 'mantenimiento').length
  const outOfService = rows.filter((v) => v.status === 'fuera_de_servicio').length

  builder.addKpiRow([
    { label: 'Móviles', value: String(rows.length) },
    { label: 'Operativos', value: String(operational) },
    { label: 'En mantenimiento', value: String(maintenance) },
    { label: 'Fuera de servicio', value: String(outOfService) },
  ])

  builder.addExecutiveSummary(
    rows.length
      ? [`Los cuarteles relevados tienen ${rows.length} móviles: ${operational} operativos, ${maintenance} en mantenimiento y ${outOfService} fuera de servicio.`]
      : ['No hay móviles cargados para el alcance seleccionado.'],
  )

  builder.addTable(
    ['Cuartel', 'Subsede', 'Código', 'Tipo', 'Estado', 'Patente'],
    rows.map((v) => [
      v.station?.name ?? '—',
      shortSubsedeName(v.station?.subsede?.name) ?? '—',
      v.internal_code,
      v.vehicle_type,
      nice(v.status),
      v.plate ?? '—',
    ]),
    'Detalle',
    [55, 40, 30, 40, 35, 'auto'],
  )

  return builder.finalize()
}

// Estado de las cargas de un cuartel, tal como lo resume el semáforo.
function complianceRows(c: NonNullable<Awaited<ReturnType<typeof fetchStationReportData>>>['compliance']): (string | number)[][] {
  if (!c) return []
  const flag = (ok: boolean) => (ok ? 'Al día' : 'Falta')
  return [
    ['Contacto institucional', flag(c.has_contact_info)],
    ['Efectivos del cuartel', flag(c.has_personnel)],
    ['Móviles', flag(c.has_vehicles)],
    ['Resumen de asistencia reciente (45 días)', flag(c.attendance_recent)],
    ['Resumen de intervenciones reciente (45 días)', flag(c.interventions_recent)],
    ['Documentos institucionales', flag(c.has_documents)],
  ]
}

export async function generateStationGeneralReport(ctx: ReportRunContext) {
  if (!ctx.filters.stationId) throw new Error('Seleccioná un cuartel para este reporte.')
  const data = await fetchStationReportData(ctx.filters.stationId, ctx.filters)
  if (!data) throw new Error('No encontramos el cuartel seleccionado.')

  const builder = await new ReportBuilder({
    title: `Reporte de Cuartel — ${data.station.name}`,
    subtitle: 'Efectivos, asistencia, intervenciones y móviles del cuartel',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
    stationLogoUrl: data.station.logo_url,
  }).init()

  const avgAttendance = data.attendance.length
    ? data.attendance.reduce((sum, r) => sum + r.attendance_rate, 0) / data.attendance.length
    : 0
  const totalInterventions = data.interventions.reduce((sum, r) => sum + r.total_count, 0)
  const missing = data.compliance ? complianceReasons(data.compliance).filter((r) => r !== 'Datos actualizados') : []
  const asOf = ctx.filters.periodEnd ? dmy(ctx.filters.periodEnd) : null

  builder.addKpiRow([
    { label: asOf ? `Efectivos al ${asOf}` : 'Efectivos', value: data.staffing ? String(data.staffing.total) : '—' },
    { label: 'Asistencia promedio', value: data.attendance.length ? pct(avgAttendance) : '—' },
    { label: 'Intervenciones', value: String(totalInterventions) },
    { label: 'Móviles', value: String(data.vehicles.length) },
    { label: 'Estado de cargas', value: data.compliance ? COMPLIANCE_STATUS_LABEL[data.compliance.compliance_status] : '—' },
  ])

  builder.addExecutiveSummary([
    stationSummaryLine(data.station),
    data.staffing
      ? `Efectivos${asOf ? ` al ${asOf}` : ''}: ${data.staffing.total}, año ${data.staffing.reference_year}, cargados el ${dmy(data.staffing.recorded_at)}.`
      : asOf
        ? `El cuartel todavía no tenía efectivos cargados al ${asOf}.`
        : 'El cuartel todavía no cargó sus efectivos por categoría.',
    data.attendance.length ? `Asistencia promedio del período: ${pct(avgAttendance)}.` : 'Sin resúmenes de asistencia cargados en el período.',
    totalInterventions ? `Total de intervenciones registradas: ${totalInterventions}.` : 'Sin intervenciones registradas en el período.',
    missing.length ? `Cargas pendientes: ${missing.join('; ').toLowerCase()}.` : data.compliance ? 'Las cargas del cuartel están al día.' : 'No pudimos leer el estado de cargas del cuartel.',
  ])

  builder.addTable(
    ['Dato', 'Detalle'],
    [
      ['Cuartel', `${data.station.name} (${data.station.code})`],
      ['Subsede', shortSubsedeName(data.station.subsede?.name) ?? '—'],
      ['Estado', nice(data.station.status)],
      ['Dirección', data.station.address || '—'],
      ['Año de fundación', data.station.founded_year ?? '—'],
    ],
    'Datos del cuartel',
    [60, 'auto'],
  )

  if (has(ctx, 'efectivos')) {
    const staffing = data.staffing
    if (staffing) {
      builder.addTable(
        ['Categoría', 'Cantidad'],
        [...STAFFING_CATEGORIES.map((c) => [c.label, staffing[c.key]]), ['Total de efectivos', staffing.total]],
        `Efectivos${asOf ? ` al ${asOf}` : ''} · año ${staffing.reference_year}`,
        [120, 'auto'],
      )
      builder.addNote(`${STAFFING_TOTAL_NOTE} Cargados el ${dmy(staffing.recorded_at)}${staffing.recorded_by_name ? ` por ${staffing.recorded_by_name}` : ''}.`)
    } else {
      builder.addSectionTitle('Efectivos')
      builder.addEmptyState(asOf ? `Sin efectivos cargados al ${asOf}.` : 'El cuartel todavía no cargó sus efectivos por categoría.')
    }
  }

  if (has(ctx, 'asistencia')) {
    const stationLegacyAverage = data.attendance.some((r) => r.present_average != null)
    const variations = attendanceVariations(data.attendance)
    builder.addTable(
      ['Período', 'Asistencia', 'Variación', 'Efectivos de referencia', 'Observaciones', 'Cargado el', ...(stationLegacyAverage ? ['Presentes prom.'] : [])],
      data.attendance.map((r) => [
        period(r.period_start, r.period_end),
        pct(r.attendance_rate),
        variationText(variations.get(r) ?? null),
        r.total_members ?? '—',
        shorten(r.observations),
        dmy(r.created_at),
        ...(stationLegacyAverage ? [r.present_average ?? '—'] : []),
      ]),
      'Asistencia',
      [50, 24, 26, 32, 'auto', 26, ...(stationLegacyAverage ? ['auto' as const] : [])],
    )
    if (data.attendance.length) builder.addNote(REFERENCE_NOTE)
  }

  if (has(ctx, 'intervenciones')) {
    builder.addTable(
      ['Categoría', 'Período', 'Cantidad', 'Personal interviniente', 'Móviles', 'Horas', 'Cargado el'],
      data.interventions.map((r) => [r.category, period(r.period_start, r.period_end), r.total_count, r.personnel_count, r.vehicles_count, r.work_hours, dmy(r.created_at)]),
      'Intervenciones',
      [50, 50, 'auto', 'auto', 'auto', 'auto', 26],
    )
  }

  if (has(ctx, 'moviles')) {
    builder.addTable(
      ['Código', 'Tipo', 'Estado', 'Patente'],
      data.vehicles.map((v) => [v.internal_code, v.vehicle_type, nice(v.status), v.plate ?? '—']),
      'Móviles',
    )
  }

  if (has(ctx, 'inventario')) {
    builder.addTable(
      ['Elemento', 'Categoría', 'Estado'],
      data.inventoryItems.map((i) => [i.name, INVENTORY_CATEGORY_LABEL[i.category] ?? nice(i.category), INVENTORY_STATUS_LABEL[i.status] ?? nice(i.status)]),
      'Inventario Regional: elementos que están en el cuartel',
      [90, 60, 'auto'],
    )
    builder.addTable(
      ['Elemento', 'Estado de la solicitud', 'Pedido el', 'Devolución prevista'],
      data.loans.map((l) => [l.itemName, LOAN_REQUEST_STATUS_LABEL[l.status] ?? nice(l.status), dmy(l.requestedAt), dmy(l.expectedReturnAt)]),
      'Préstamos que pidió el cuartel',
      [90, 60, 40, 'auto'],
    )
  }

  if (has(ctx, 'pendientes')) {
    const rows = complianceRows(data.compliance)
    if (rows.length) {
      builder.addTable(['Carga', 'Estado'], rows, 'Estado de cargas', [120, 'auto'])
      builder.addNote(
        data.compliance
          ? `Estado general: ${COMPLIANCE_STATUS_LABEL[data.compliance.compliance_status]}.${missing.length ? ` Falta: ${missing.join('; ').toLowerCase()}.` : ''}`
          : '',
      )
    } else {
      builder.addSectionTitle('Estado de cargas')
      builder.addEmptyState('No pudimos leer el estado de cargas del cuartel.')
    }
  }

  return builder.finalize()
}

// Encabezados cortos de las categorías para la tabla que compara cuarteles.
const SHORT_CATEGORY_LABEL: Record<string, string> = {
  aspirantes_menores: 'Asp. menores',
  aspirantes_mayores: 'Asp. mayores',
  bomberos_nivel_1: 'Nivel 1',
  bomberos_nivel_2: 'Nivel 2',
  bomberos_nivel_3: 'Nivel 3',
  bomberos_nivel_4: 'Nivel 4',
  personal_reserva: 'Reserva',
  cuerpo_auxiliar: 'C. auxiliar',
}

export async function generateRegionalConsolidatedReport(ctx: ReportRunContext) {
  const data = await fetchRegionalConsolidatedData(ctx.filters)

  const builder = await new ReportBuilder({
    title: 'Reporte Regional',
    subtitle: 'Comparativo de los cuarteles de la Regional 4',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const avgAttendance = data.attendance.length
    ? data.attendance.reduce((sum, r) => sum + r.attendance_rate, 0) / data.attendance.length
    : 0
  const totalInterventions = data.interventions.reduce((sum, r) => sum + r.total_count, 0)
  const asOf = ctx.filters.periodEnd ? dmy(ctx.filters.periodEnd) : null
  const totalEffectives = [...data.staffing.values()].reduce((sum, s) => sum + s.total, 0)
  const pendingStations = data.compliance.filter((c) => c.compliance_status !== 'verde')
  const complianceOf = new Map(data.compliance.map((c) => [c.station_id, c]))

  builder.addKpiRow([
    { label: 'Cuarteles', value: String(data.stations.length) },
    { label: asOf ? `Efectivos al ${asOf}` : 'Efectivos', value: data.staffing.size > 0 ? String(totalEffectives) : '—' },
    { label: 'Asistencia promedio', value: data.attendance.length ? pct(avgAttendance) : '—' },
    { label: 'Intervenciones', value: String(totalInterventions) },
    { label: 'Móviles', value: String(data.vehicles.length) },
    { label: 'Con cargas pendientes', value: data.compliance.length ? String(pendingStations.length) : '—' },
  ])

  builder.addExecutiveSummary([
    `La Regional cuenta con ${data.stations.length} cuarteles dentro del alcance seleccionado.`,
    data.staffing.size > 0
      ? `Los efectivos${asOf ? ` al ${asOf}` : ''} suman ${totalEffectives}; ${data.staffing.size} de ${data.stations.length} cuarteles los tenían cargados por categoría.`
      : `Todavía no hay efectivos cargados${asOf ? ` al ${asOf}` : ''} en los cuarteles del alcance seleccionado.`,
    data.attendance.length ? `La asistencia promedio del período fue de ${pct(avgAttendance)}.` : 'Sin resúmenes de asistencia cargados en el período.',
    totalInterventions ? `Se registraron ${totalInterventions} intervenciones en el período.` : 'Sin intervenciones registradas en el período.',
    data.compliance.length
      ? pendingStations.length
        ? `${pendingStations.length} de ${data.compliance.length} cuarteles tienen cargas pendientes.`
        : 'Todos los cuarteles tienen sus cargas al día.'
      : 'No pudimos leer el estado de cargas de los cuarteles.',
    `Hay ${data.courses.length} cursos y ${data.vehicles.length} móviles relevados.`,
  ])

  if (has(ctx, 'asistencia') && data.attendance.length) {
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

  // Comparativo por cuartel: una fila por cuartel con lo principal de cada sección elegida.
  const head = ['Cuartel', 'Subsede']
  const widths: (number | 'auto')[] = [52, 32]
  if (has(ctx, 'efectivos')) {
    head.push('Efectivos')
    widths.push('auto')
  }
  if (has(ctx, 'asistencia')) {
    head.push('Asistencia prom.', 'Último resumen')
    widths.push('auto', 30)
  }
  if (has(ctx, 'intervenciones')) {
    head.push('Intervenciones')
    widths.push('auto')
  }
  if (has(ctx, 'moviles')) {
    head.push('Móviles')
    widths.push('auto')
  }
  if (has(ctx, 'pendientes')) {
    head.push('Cargas')
    widths.push(30)
  }
  builder.addTable(
    head,
    data.stations.map((s) => {
      const rates = data.attendance.filter((r) => r.station_id === s.id)
      const last = [...rates].sort((a, b) => b.period_end.localeCompare(a.period_end))[0]
      const interventions = data.interventions.filter((r) => r.station_id === s.id).reduce((sum, r) => sum + r.total_count, 0)
      const compliance = complianceOf.get(s.id)
      const row: (string | number)[] = [s.name, shortSubsedeName(s.subsede?.name) ?? '—']
      if (has(ctx, 'efectivos')) row.push(data.staffing.get(s.id)?.total ?? '—')
      if (has(ctx, 'asistencia')) {
        row.push(rates.length ? pct(rates.reduce((sum, r) => sum + r.attendance_rate, 0) / rates.length) : '—', last ? dmy(last.period_end) : '—')
      }
      if (has(ctx, 'intervenciones')) row.push(interventions)
      if (has(ctx, 'moviles')) row.push(data.vehicles.filter((v) => v.station_id === s.id).length)
      if (has(ctx, 'pendientes')) row.push(compliance ? COMPLIANCE_STATUS_LABEL[compliance.compliance_status] : '—')
      return row
    }),
    'Comparativo por cuartel',
    widths,
  )

  // Efectivos por categoría, cuartel por cuartel y en total.
  if (has(ctx, 'efectivos')) {
    const withData = data.stations.filter((s) => data.staffing.has(s.id))
    if (withData.length > 0) {
      const sumOf = (key: (typeof STAFFING_CATEGORIES)[number]['key']) => withData.reduce((sum, s) => sum + (data.staffing.get(s.id)?.[key] ?? 0), 0)
      builder.addTable(
        ['Cuartel', ...STAFFING_CATEGORIES.map((c) => SHORT_CATEGORY_LABEL[c.key]), 'Total'],
        [
          ...data.stations.map((s) => {
            const snapshot = data.staffing.get(s.id)
            return [s.name, ...STAFFING_CATEGORIES.map((c) => (snapshot ? snapshot[c.key] : '—')), snapshot ? snapshot.total : '—']
          }),
          ['Total de la Regional', ...STAFFING_CATEGORIES.map((c) => sumOf(c.key)), withData.reduce((sum, s) => sum + (data.staffing.get(s.id)?.total ?? 0), 0)],
        ],
        `Efectivos por categoría${asOf ? ` al ${asOf}` : ''}`,
        [52, 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
      )
      builder.addNote(`${STAFFING_TOTAL_NOTE} ${withData.length} de ${data.stations.length} cuarteles tenían efectivos cargados; los demás figuran con "—" y no suman.`)
    } else {
      builder.addSectionTitle('Efectivos por categoría')
      builder.addEmptyState(`Ningún cuartel del alcance tenía efectivos cargados${asOf ? ` al ${asOf}` : ''}.`)
    }
  }

  if (has(ctx, 'pendientes')) {
    builder.addTable(
      ['Cuartel', 'Estado', 'Qué falta'],
      pendingStations.map((c) => [c.station_name, COMPLIANCE_STATUS_LABEL[c.compliance_status], complianceReasons(c).join('; ')]),
      'Cuarteles con cargas pendientes',
      [60, 34, 'auto'],
    )
  }

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
    title: 'Departamentos Regionales — Resumen general',
    subtitle: 'Resumen consolidado de todos los departamentos regionales',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
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

const REPORT_FILE_KIND_LABEL: Record<DepartmentReportFileKind, string> = {
  documento: 'Documento',
  imagen: 'Imagen',
  video: 'Video',
}

export async function generateDepartmentSpecificReport(ctx: ReportRunContext) {
  if (!ctx.departmentId) throw new Error('Seleccioná un departamento para este reporte.')
  const [[department], stations, extras] = await Promise.all([
    fetchDepartmentsReportData(ctx.departmentId),
    fetchStations(),
    fetchDepartmentReportExtras(ctx.departmentId, ctx.filters),
  ])
  if (!department) throw new Error('No encontramos el departamento seleccionado.')
  const stationName = (stationId: string | null) => (stationId ? stations.find((s) => s.id === stationId)?.name ?? '—' : '—')

  const builder = await new ReportBuilder({
    title: `Reporte de Departamento — ${department.name}`,
    subtitle: department.is_active ? 'Departamento activo' : 'Departamento inactivo',
    scopeLabel: ctx.scopeLabel,
    periodLabel: ctx.periodLabel,
    filtersLabel: ctx.filtersApplied,
    generatedByLabel: ctx.generatedByLabel,
    generatedAt: new Date(),
  }).init()

  const totalHours = department.reports.reduce((s, r) => s + Number(r.hours_worked), 0)
  const totalAttendees = department.reports.reduce((s, r) => s + r.attendees_count, 0)
  const coordinator = department.members.find((m) => m.profile_id === department.coordinator_profile_id)?.profile
  const files = extras.reports.flatMap((r) => r.files.map((f) => ({ file: f, report: r })))

  builder.addKpiRow([
    { label: 'Integrantes', value: String(department.members.length + department.manualMembers.length) },
    { label: 'Informes y actas', value: String(extras.reports.length) },
    { label: 'Eventos', value: String(extras.events.length) },
    { label: 'Archivos', value: String(files.length) },
    { label: 'Actividades', value: String(department.reports.length) },
  ])

  builder.addExecutiveSummary([
    `Coordinador: ${coordinator?.full_name ?? 'Sin asignar'}.`,
    `${department.members.length} integrantes con usuario del sistema y ${department.manualMembers.length} integrantes manuales (sin usuario).`,
    extras.reports.length
      ? `Se cargaron ${extras.reports.length} informes y actas en el período, con ${files.length} archivos.`
      : 'No hay informes ni actas para mostrar en el período (los ven el coordinador, sus integrantes e Informática).',
    extras.events.length ? `Hay ${extras.events.length} eventos del departamento en el período.` : 'Sin eventos del departamento en el período.',
    department.reports.length
      ? `Se registraron ${department.reports.length} actividades, con ${truncateDecimals(totalHours, 1)} horas y ${totalAttendees} asistentes acumulados.`
      : 'Todavía no hay informes de actividad cargados en este departamento.',
  ])

  if (has(ctx, 'integrantes')) {
    builder.addTable(
      ['Nombre', 'Función', 'Cuartel'],
      [
        ...(coordinator ? [[coordinator.full_name, 'Coordinador', stationName(coordinator.station_id ?? null)]] : []),
        ...department.members
          .filter((m) => m.profile_id !== department.coordinator_profile_id)
          .map((m) => [m.profile?.full_name ?? '—', 'Miembro', stationName(m.profile?.station_id ?? null)]),
      ],
      'Coordinador e integrantes con usuario',
      [90, 50, 'auto'],
    )

    builder.addTable(
      ['Nombre', 'Cargo / función', 'Cuartel', 'Estado'],
      department.manualMembers.map((m) => [`${m.first_name} ${m.last_name}`, m.role_function ?? '—', stationName(m.station_id), m.is_active ? 'Activo' : 'Inactivo']),
      'Integrantes sin usuario',
    )
  }

  if (has(ctx, 'informes')) {
    builder.addTable(
      ['Fecha', 'Tipo', 'Título', 'Cargado por', 'Archivos'],
      extras.reports.map((r) => [dmy(r.report_date), DEPARTMENT_REPORT_TYPE_LABEL[r.report_type], r.title + (r.is_archived ? ' (archivado)' : ''), r.created_by_name ?? '—', r.files.length]),
      'Informes y actas',
      [28, 46, 'auto', 56, 22],
    )
  }

  if (has(ctx, 'eventos')) {
    builder.addTable(
      ['Fecha', 'Tipo', 'Evento', 'Estado'],
      extras.events.map((e) => [
        `${dmy(e.starts_at)}${e.all_day ? '' : ' ' + new Date(e.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
        EVENT_TYPE_LABEL[e.event_type] ?? nice(e.event_type),
        e.title,
        nice(e.status),
      ]),
      'Eventos del departamento',
      [40, 40, 'auto', 34],
    )
  }

  if (has(ctx, 'archivos')) {
    builder.addTable(
      ['Archivo', 'Tipo', 'Informe', 'Cargado el', 'Tamaño'],
      files.map(({ file, report }) => [file.file_name, REPORT_FILE_KIND_LABEL[file.file_kind] ?? nice(file.file_kind), report.title, dmy(file.created_at), formatBytes(file.file_size)]),
      'Archivos asociados',
      ['auto', 28, 70, 28, 24],
    )
  }

  if (has(ctx, 'actividad')) {
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
      department.reports.map((r) => [r.title, DEPARTMENT_ACTIVITY_TYPE_LABEL[r.activity_type], dmy(r.activity_date), r.attendees_count, truncateDecimals(Number(r.hours_worked), 1)]),
      'Informes de actividad',
      [70, 40, 30, 'auto', 'auto'],
    )
  }

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
