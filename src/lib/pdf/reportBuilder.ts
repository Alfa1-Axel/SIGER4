import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadImageAsDataUrl } from './assets'

const PAGE_MARGIN = 14
const PRIMARY_COLOR = '#D32F2F'
const SECONDARY_COLOR = '#0F172A'
const MUTED_COLOR = '#6B7280'

export interface ReportContext {
  title: string
  subtitle?: string
  scopeLabel: string
  periodLabel: string
  generatedByLabel: string
  generatedAt: Date
}

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
    const [logoEscuela, logoInformatica] = await Promise.all([
      loadImageAsDataUrl('/logos/logo-escuela.png').catch(() => null),
      loadImageAsDataUrl('/logos/logo-informatica.jpeg').catch(() => null),
    ])
    this.drawHeader(logoEscuela, logoInformatica)
    return this
  }

  private drawHeader(logoEscuela: string | null, logoInformatica: string | null) {
    const { title, subtitle, scopeLabel, periodLabel, generatedByLabel, generatedAt } = this.context

    if (logoEscuela) this.doc.addImage(logoEscuela, 'PNG', PAGE_MARGIN, this.cursorY, 18, 18)
    if (logoInformatica) this.doc.addImage(logoInformatica, 'JPEG', this.pageWidth - PAGE_MARGIN - 18, this.cursorY, 18, 18)

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

  // Cuando availableText viene con contenido, se asume que es el análisis real
  // devuelto por la Edge Function de IA; si no, se muestra fallbackText (motivo
  // de indisponibilidad) — en ambos casos se incluye la leyenda institucional
  // obligatoria sobre el origen del análisis.
  addAiAnalysisSection(availableText: string | null, fallbackText: string) {
    const bodyText = availableText ?? fallbackText
    const disclaimer =
      'El siguiente análisis fue generado automáticamente mediante Inteligencia Artificial y constituye una ' +
      'asistencia para la interpretación de los datos. La validación final corresponde a los responsables institucionales.'

    const contentWidth = this.pageWidth - PAGE_MARGIN * 2 - 8
    const bodyLines = this.doc.splitTextToSize(bodyText, contentWidth) as string[]
    const disclaimerLines = availableText ? (this.doc.splitTextToSize(disclaimer, contentWidth) as string[]) : []
    const boxHeight = 10 + bodyLines.length * 4.2 + (disclaimerLines.length ? disclaimerLines.length * 3.4 + 3 : 0) + 4

    this.ensureSpace(boxHeight)
    this.doc.setDrawColor(203, 213, 225)
    this.doc.setFillColor(248, 250, 252)
    this.doc.roundedRect(PAGE_MARGIN, this.cursorY, this.pageWidth - PAGE_MARGIN * 2, boxHeight, 2, 2, 'FD')

    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(SECONDARY_COLOR)
    this.doc.text('Análisis con Inteligencia Artificial', PAGE_MARGIN + 4, this.cursorY + 7)

    this.doc.setFont('helvetica', availableText ? 'normal' : 'italic')
    this.doc.setFontSize(8)
    this.doc.setTextColor(availableText ? SECONDARY_COLOR : MUTED_COLOR)
    this.doc.text(bodyLines, PAGE_MARGIN + 4, this.cursorY + 13)

    if (disclaimerLines.length) {
      this.doc.setFont('helvetica', 'italic')
      this.doc.setFontSize(7)
      this.doc.setTextColor(MUTED_COLOR)
      this.doc.text(disclaimerLines, PAGE_MARGIN + 4, this.cursorY + 13 + bodyLines.length * 4.2 + 3)
    }

    this.cursorY += boxHeight + 4
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
      this.doc.text('Sistema creado por Dpto. Informática y Estadística R4', this.pageWidth / 2, this.pageHeight - 11, {
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
