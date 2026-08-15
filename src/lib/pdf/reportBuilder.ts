import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { detectImageFormatForPdf, loadImageAsDataUrl } from './assets'

const PAGE_MARGIN = 14
const PRIMARY_COLOR = '#D32F2F'
const SECONDARY_COLOR = '#0F172A'
const MUTED_COLOR = '#6B7280'

// Qué par de logos institucionales corresponde según el tema del reporte --
// mismo criterio que ya rige en el resto de la app: logo-informatica.png es
// "la marca del sistema en general" (aparece solo, sin Escuela, en el header
// global de toda la app — AppHeader.tsx) y logo-escuela.png es específico
// del módulo Escuela (aparece solo, sin Informática, en Sidebar.tsx y
// EscuelaPage.tsx). En Login/Ajustes ambos aparecen JUNTOS como crédito
// institucional dual, que es el mismo criterio que se traslada acá: los dos
// logos institucionales siempre están presentes en el encabezado del PDF,
// pero cuál va a la posición principal (izquierda) depende de si el reporte
// es temáticamente de Escuela o no.
export type ReportTheme = 'default' | 'escuela'

export interface ReportContext {
  title: string
  subtitle?: string
  scopeLabel: string
  periodLabel: string
  generatedByLabel: string
  generatedAt: Date
  // 'escuela' SOLO para el Reporte de Cursos y Escuela (el único reporte
  // cuyo tema es la Escuela Regional de Bomberos) -- ahí el logo de Escuela
  // va a la izquierda (posición principal) e Informática a la derecha.
  // Cualquier otro reporte (asistencias, intervenciones, vehículos, cuartel,
  // regional, departamentos) usa 'default': Informática a la izquierda,
  // Escuela a la derecha -- mismo par de logos, orden invertido.
  theme?: ReportTheme
  // Logo del cuartel reportado (stations.logo_url), SOLO para reportes de un
  // cuartel específico (ej. Reporte General de cuartel). Reemplaza al logo
  // institucional que le toque a la posición derecha (Escuela en tema
  // 'default', que es el único caso en que se usa hoy) cuando existe y se
  // puede cargar; si el cuartel no tiene logo cargado, o la carga/el formato
  // fallan, se usa el mismo fallback institucional de siempre -- nunca se
  // deja el reporte sin logo a la derecha. Reportes sin cuartel específico
  // (regional, subsede, departamentos, escuela) no pasan este campo y siguen
  // usando el par de logos institucionales fijo, sin cambios.
  stationLogoUrl?: string | null
}

async function loadPdfImage(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  const dataUrl = await loadImageAsDataUrl(url)
  const format = detectImageFormatForPdf(dataUrl)
  return format ? { dataUrl, format } : null
}

const LOGO_ESCUELA_URL = '/logos/logo-escuela.png'
const LOGO_INFORMATICA_URL = '/logos/logo-informatica.png'

export class ReportBuilder {
  doc: jsPDF
  private cursorY = PAGE_MARGIN
  private pageWidth: number
  private pageHeight: number

  constructor(private context: ReportContext) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    this.pageWidth = this.doc.internal.pageSize.getWidth()
    this.pageHeight = this.doc.internal.pageSize.getHeight()
  }

  async init(): Promise<this> {
    const isEscuela = this.context.theme === 'escuela'
    const leftLogoUrl = isEscuela ? LOGO_ESCUELA_URL : LOGO_INFORMATICA_URL
    const institutionalRightLogoUrl = isEscuela ? LOGO_INFORMATICA_URL : LOGO_ESCUELA_URL

    const [logoIzquierda, logoDerecha] = await Promise.all([
      loadPdfImage(leftLogoUrl).catch(() => null),
      this.loadRightLogo(institutionalRightLogoUrl),
    ])
    this.drawHeader(logoIzquierda, logoDerecha)
    return this
  }

  // Logo de la derecha: el del cuartel reportado si existe y se puede cargar
  // (formato soportado por jsPDF -- ver detectImageFormatForPdf), o el
  // institucional que corresponda según el tema como fallback en cualquier
  // otro caso -- cuartel sin logo, URL rota, formato no soportado (ej.
  // WEBP), o reporte sin cuartel específico.
  private async loadRightLogo(institutionalUrl: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
    if (this.context.stationLogoUrl) {
      const stationLogo = await loadPdfImage(this.context.stationLogoUrl).catch(() => null)
      if (stationLogo) return stationLogo
    }
    return loadPdfImage(institutionalUrl).catch(() => null)
  }

  private drawHeader(
    logoIzquierda: { dataUrl: string; format: 'PNG' | 'JPEG' } | null,
    logoDerecha: { dataUrl: string; format: 'PNG' | 'JPEG' } | null,
  ) {
    const { title, subtitle, scopeLabel, periodLabel, generatedByLabel, generatedAt } = this.context

    if (logoIzquierda) this.doc.addImage(logoIzquierda.dataUrl, logoIzquierda.format, PAGE_MARGIN, this.cursorY, 18, 18)
    if (logoDerecha) this.doc.addImage(logoDerecha.dataUrl, logoDerecha.format, this.pageWidth - PAGE_MARGIN - 18, this.cursorY, 18, 18)

    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(14)
    this.doc.setTextColor(SECONDARY_COLOR)
    this.doc.text(title, this.pageWidth / 2, this.cursorY + 7, { align: 'center' })

    if (subtitle) {
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(10)
      this.doc.setTextColor(MUTED_COLOR)
      this.doc.text(subtitle, this.pageWidth / 2, this.cursorY + 13, { align: 'center' })
    }

    this.doc.setFontSize(9)
    this.doc.setTextColor(MUTED_COLOR)
    this.doc.text(`Regional 4 — SIGER4 · ${scopeLabel}`, this.pageWidth / 2, this.cursorY + 18, { align: 'center' })

    this.cursorY += 24
    this.doc.setDrawColor(PRIMARY_COLOR)
    this.doc.setLineWidth(0.6)
    this.doc.line(PAGE_MARGIN, this.cursorY, this.pageWidth - PAGE_MARGIN, this.cursorY)
    this.cursorY += 6

    this.doc.setFontSize(9)
    this.doc.setTextColor(MUTED_COLOR)
    this.doc.text(`Período: ${periodLabel}`, PAGE_MARGIN, this.cursorY)
    this.doc.text(
      `Generado: ${generatedAt.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })} por ${generatedByLabel}`,
      this.pageWidth - PAGE_MARGIN,
      this.cursorY,
      { align: 'right' },
    )
    this.cursorY += 8
  }

  private ensureSpace(neededHeight: number) {
    if (this.cursorY + neededHeight > this.pageHeight - 22) {
      this.doc.addPage()
      this.cursorY = PAGE_MARGIN
    }
  }

  addSectionTitle(text: string) {
    this.ensureSpace(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(12)
    this.doc.setTextColor(PRIMARY_COLOR)
    this.doc.text(text, PAGE_MARGIN, this.cursorY)
    this.cursorY += 6
  }

  addExecutiveSummary(lines: string[]) {
    if (lines.length === 0) return
    this.addSectionTitle('Resumen ejecutivo')
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(10)
    this.doc.setTextColor(SECONDARY_COLOR)
    for (const line of lines) {
      const wrapped = this.doc.splitTextToSize(`• ${line}`, this.pageWidth - PAGE_MARGIN * 2)
      this.ensureSpace(wrapped.length * 5 + 2)
      this.doc.text(wrapped, PAGE_MARGIN, this.cursorY)
      this.cursorY += wrapped.length * 5 + 2
    }
    this.cursorY += 2
  }

  addKpiRow(kpis: { label: string; value: string }[]) {
    if (kpis.length === 0) return
    this.ensureSpace(20)
    const boxWidth = (this.pageWidth - PAGE_MARGIN * 2 - (kpis.length - 1) * 4) / kpis.length
    kpis.forEach((kpi, index) => {
      const x = PAGE_MARGIN + index * (boxWidth + 4)
      this.doc.setFillColor(248, 250, 252)
      this.doc.setDrawColor(226, 232, 240)
      this.doc.roundedRect(x, this.cursorY, boxWidth, 18, 2, 2, 'FD')
      this.doc.setFont('helvetica', 'bold')
      this.doc.setFontSize(13)
      this.doc.setTextColor(PRIMARY_COLOR)
      this.doc.text(kpi.value, x + boxWidth / 2, this.cursorY + 9, { align: 'center' })
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(8)
      this.doc.setTextColor(MUTED_COLOR)
      this.doc.text(kpi.label, x + boxWidth / 2, this.cursorY + 15, { align: 'center' })
    })
    this.cursorY += 24
  }

  // columnWidths es opcional: valores en mm para las columnas que necesitan
  // ancho fijo (ej. nombres de cuartel/subsede, para que nunca se corten); las
  // columnas sin ancho fijo se reparten el espacio restante ("auto").
  addTable(head: string[], body: (string | number)[][], title?: string, columnWidths?: (number | 'auto')[]) {
    if (title) this.addSectionTitle(title)
    if (body.length === 0) {
      this.addEmptyState('No hay datos cargados para este período y alcance.')
      return
    }

    const columnStyles: Record<number, { cellWidth: number | 'auto' | 'wrap' }> = {}
    if (columnWidths) {
      columnWidths.forEach((width, index) => {
        columnStyles[index] = { cellWidth: width === 'auto' ? 'auto' : width }
      })
    }

    autoTable(this.doc, {
      startY: this.cursorY,
      head: [head],
      body,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: { fontSize: 9, textColor: SECONDARY_COLOR, cellPadding: 2.2, overflow: 'linebreak' },
      headStyles: { fillColor: [211, 47, 47], textColor: '#FFFFFF', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.cursorY = (this.doc as any).lastAutoTable.finalY + 8
  }

  // maxHeightMm limita la altura para que gráficos con muchas filas no
  // desborden la página; se respeta la relación de aspecto real de la imagen
  // (los gráficos de barras horizontales crecen en alto según la cantidad de
  // ítems, no tienen una proporción fija).
  addBarChartImage(dataUrl: string, maxHeightMm = 110) {
    const props = this.doc.getImageProperties(dataUrl)
    const width = this.pageWidth - PAGE_MARGIN * 2
    const height = Math.min((props.height / props.width) * width, maxHeightMm)
    const finalWidth = height === maxHeightMm ? (props.width / props.height) * height : width

    this.ensureSpace(height + 4)
    const x = PAGE_MARGIN + (width - finalWidth) / 2
    this.doc.addImage(dataUrl, 'PNG', x, this.cursorY, finalWidth, height)
    this.cursorY += height + 6
  }

  addEmptyState(message: string) {
    this.ensureSpace(14)
    this.doc.setFont('helvetica', 'italic')
    this.doc.setFontSize(10)
    this.doc.setTextColor(MUTED_COLOR)
    this.doc.text(message, PAGE_MARGIN, this.cursorY)
    this.cursorY += 10
  }

  finalize(): jsPDF {
    const pageCount = this.doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i += 1) {
      this.doc.setPage(i)
      this.doc.setDrawColor(226, 232, 240)
      this.doc.setLineWidth(0.3)
      this.doc.line(PAGE_MARGIN, this.pageHeight - 16, this.pageWidth - PAGE_MARGIN, this.pageHeight - 16)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(7.5)
      this.doc.setTextColor(MUTED_COLOR)
      this.doc.text('Datos extraídos de SIGER4', this.pageWidth / 2, this.pageHeight - 11, {
        align: 'center',
      })
      this.doc.text(`Página ${i} de ${pageCount}`, this.pageWidth - PAGE_MARGIN, this.pageHeight - 11, { align: 'right' })
    }
    return this.doc
  }
}

const MAX_CHART_ITEMS = 12

// Cuando hay más de MAX_CHART_ITEMS barras, un gráfico único se vuelve
// ilegible (etiquetas encimadas). En vez de recortar nombres, se prioriza
// comparación clara: se ordena por valor y se muestran el top y el bottom del
// ranking (con nota de cuántos quedaron afuera) — el detalle completo siempre
// queda disponible en la tabla que acompaña al gráfico.
function selectChartItems(labels: string[], values: number[]): { labels: string[]; values: number[]; omitted: number } {
  if (labels.length <= MAX_CHART_ITEMS) return { labels, values, omitted: 0 }

  const indices = labels.map((_, i) => i).sort((a, b) => values[b] - values[a])
  const halfSize = Math.floor(MAX_CHART_ITEMS / 2)
  const topIndices = indices.slice(0, halfSize)
  const bottomIndices = indices.slice(-halfSize)
  const picked = Array.from(new Set([...topIndices, ...bottomIndices]))

  return {
    labels: picked.map((i) => labels[i]),
    values: picked.map((i) => values[i]),
    omitted: labels.length - picked.length,
  }
}

// Renderiza un gráfico de barras horizontales a un canvas oculto y devuelve su
// dataURL para incrustarlo en el PDF (jsPDF no soporta SVG/recharts
// directamente). Horizontal porque permite mostrar el nombre completo de cada
// cuartel/categoría sin rotarlo ni recortarlo, que es lo que hacía ilegibles
// los gráficos anteriores al comparar muchos cuarteles.
export function renderBarChartToDataUrl(labels: string[], values: number[], label: string, unit = ''): string | null {
  if (labels.length === 0) return null

  const { labels: chartLabels, values: chartValues, omitted } = selectChartItems(labels, values)

  const rowHeight = 34
  const topPadding = 50
  const bottomPadding = omitted > 0 ? 46 : 20
  const canvasWidth = 1400
  const canvasHeight = topPadding + chartLabels.length * rowHeight + bottomPadding

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(label, canvasWidth / 2, 28)

  const labelColumnWidth = 340
  const valueColumnWidth = 90
  const chartLeft = labelColumnWidth
  const chartRight = canvasWidth - valueColumnWidth
  const chartWidth = chartRight - chartLeft
  const maxValue = Math.max(...chartValues, 1)

  chartLabels.forEach((labelText, index) => {
    const value = chartValues[index] ?? 0
    const y = topPadding + index * rowHeight
    const barHeight = rowHeight * 0.55
    const barWidth = Math.max(2, (value / maxValue) * chartWidth)

    ctx.fillStyle = '#334155'
    ctx.font = '15px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(labelText, chartLeft - 14, y + barHeight / 2 + 5, labelColumnWidth - 14)

    ctx.fillStyle = '#F1F5F9'
    ctx.fillRect(chartLeft, y, chartWidth, barHeight)

    ctx.fillStyle = '#D32F2F'
    ctx.fillRect(chartLeft, y, barWidth, barHeight)

    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 14px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(`${value}${unit}`, chartLeft + barWidth + 10, y + barHeight / 2 + 5)
  })

  if (omitted > 0) {
    ctx.fillStyle = '#6B7280'
    ctx.font = 'italic 14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(
      `Se muestran los ${chartLabels.length} valores más altos y más bajos · ${omitted} más en la tabla de detalle`,
      canvasWidth / 2,
      canvasHeight - 16,
    )
  }

  return canvas.toDataURL('image/png')
}
