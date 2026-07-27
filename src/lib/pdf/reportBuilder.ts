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
    this.doc = new jsPDF({ unit: 'mm', format: 'a4' })
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

  addTable(head: string[], body: (string | number)[][], title?: string) {
    if (title) this.addSectionTitle(title)
    if (body.length === 0) {
      this.addEmptyState('No hay datos cargados para este período y alcance.')
      return
    }
    autoTable(this.doc, {
      startY: this.cursorY,
      head: [head],
      body,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: { fontSize: 8, textColor: SECONDARY_COLOR },
      headStyles: { fillColor: [211, 47, 47], textColor: '#FFFFFF' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.cursorY = (this.doc as any).lastAutoTable.finalY + 8
  }

  addBarChartImage(dataUrl: string, heightMm = 60) {
    this.ensureSpace(heightMm + 4)
    const width = this.pageWidth - PAGE_MARGIN * 2
    this.doc.addImage(dataUrl, 'PNG', PAGE_MARGIN, this.cursorY, width, heightMm)
    this.cursorY += heightMm + 6
  }

  addEmptyState(message: string) {
    this.ensureSpace(14)
    this.doc.setFont('helvetica', 'italic')
    this.doc.setFontSize(10)
    this.doc.setTextColor(MUTED_COLOR)
    this.doc.text(message, PAGE_MARGIN, this.cursorY)
    this.cursorY += 10
  }

  addAiPlaceholder() {
    this.ensureSpace(24)
    this.doc.setDrawColor(203, 213, 225)
    this.doc.setFillColor(248, 250, 252)
    this.doc.roundedRect(PAGE_MARGIN, this.cursorY, this.pageWidth - PAGE_MARGIN * 2, 20, 2, 2, 'FD')
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(SECONDARY_COLOR)
    this.doc.text('Análisis con Inteligencia Artificial', PAGE_MARGIN + 4, this.cursorY + 7)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(8)
    this.doc.setTextColor(MUTED_COLOR)
    const text = this.doc.splitTextToSize(
      'Espacio reservado para el análisis automático de tendencias y anomalías (próxima fase). Este reporte contiene únicamente datos reales.',
      this.pageWidth - PAGE_MARGIN * 2 - 8,
    )
    this.doc.text(text, PAGE_MARGIN + 4, this.cursorY + 13)
    this.cursorY += 24
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

// Renderiza un gráfico de barras simple a un canvas oculto y devuelve su dataURL,
// para incrustarlo en el PDF (jsPDF no soporta SVG/recharts directamente).
export function renderBarChartToDataUrl(labels: string[], values: number[], label: string): string | null {
  if (labels.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 360
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const maxValue = Math.max(...values, 1)
  const chartLeft = 50
  const chartRight = canvas.width - 20
  const chartTop = 30
  const chartBottom = canvas.height - 50
  const chartWidth = chartRight - chartLeft
  const chartHeight = chartBottom - chartTop
  const barGap = 12
  const barWidth = Math.max(6, chartWidth / labels.length - barGap)

  ctx.strokeStyle = '#E2E8F0'
  ctx.beginPath()
  ctx.moveTo(chartLeft, chartTop)
  ctx.lineTo(chartLeft, chartBottom)
  ctx.lineTo(chartRight, chartBottom)
  ctx.stroke()

  ctx.fillStyle = '#0F172A'
  ctx.font = '16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(label, canvas.width / 2, 18)

  labels.forEach((labelText, index) => {
    const value = values[index] ?? 0
    const barHeight = (value / maxValue) * chartHeight
    const x = chartLeft + index * (barWidth + barGap) + barGap / 2
    const y = chartBottom - barHeight

    ctx.fillStyle = '#D32F2F'
    ctx.fillRect(x, y, barWidth, barHeight)

    ctx.fillStyle = '#334155'
    ctx.font = '11px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(String(value), x + barWidth / 2, y - 4)

    ctx.save()
    ctx.translate(x + barWidth / 2, chartBottom + 14)
    ctx.rotate(labels.length > 8 ? -Math.PI / 4 : 0)
    ctx.textAlign = labels.length > 8 ? 'right' : 'center'
    ctx.fillText(labelText.slice(0, 14), 0, 0)
    ctx.restore()
  })

  return canvas.toDataURL('image/png')
}
