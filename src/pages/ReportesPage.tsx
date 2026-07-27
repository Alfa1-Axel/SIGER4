import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { AiDisclaimer } from '../components/ui/AiDisclaimer'
import { recordAuditEvent } from '../lib/api/audit'
import { createNotification } from '../lib/api/notifications'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { REPORT_GENERATORS, type ReportKey } from '../lib/pdf/reportGenerators'
import type { Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

const REPORT_TYPES: { key: ReportKey; label: string; needsStation?: boolean }[] = [
  { key: 'asistencias', label: 'Reporte de Asistencias' },
  { key: 'intervenciones', label: 'Reporte de Intervenciones' },
  { key: 'cursos', label: 'Reporte de Cursos / Escuela' },
  { key: 'vehiculos', label: 'Reporte de Vehículos' },
  { key: 'cuartel_general', label: 'Reporte General por Cuartel', needsStation: true },
  { key: 'regional_consolidado', label: 'Reporte Regional Consolidado' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function ReportesPage() {
  const { profile } = useAuth()
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])

  const [reportKey, setReportKey] = useState<ReportKey>('asistencias')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedKey, setConfirmedKey] = useState<ReportKey | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()]).then(([regionsData, subsedesData, stationsData]) => {
      if (!active) return
      setRegions(regionsData)
      setSubsedes(subsedesData)
      setStations(stationsData)
    })
    return () => {
      active = false
    }
  }, [])

  const reportDef = REPORT_TYPES.find((r) => r.key === reportKey)!

  function scopeLabelFor(): string {
    if (stationId) return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel seleccionado'
    if (subsedeId) return subsedes.find((s) => s.id === subsedeId)?.name ?? 'Subsede seleccionada'
    if (regionId) return regions.find((r) => r.id === regionId)?.name ?? 'Región seleccionada'
    return 'Todo el alcance disponible'
  }

  function periodLabelFor(): string {
    if (periodStart && periodEnd) return `${periodStart} a ${periodEnd}`
    if (periodStart) return `Desde ${periodStart}`
    if (periodEnd) return `Hasta ${periodEnd}`
    return 'Todo el histórico disponible'
  }

  async function handleGenerate() {
    setError(null)
    setConfirmedKey(null)

    if (reportDef.needsStation && !stationId) {
      setError('Seleccioná un cuartel para este reporte.')
      return
    }

    setGenerating(true)
    try {
      const generator = REPORT_GENERATORS[reportKey]
      const doc = await generator({
        filters: {
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          regionId: regionId || null,
          subsedeId: subsedeId || null,
          stationId: stationId || null,
        },
        scopeLabel: scopeLabelFor(),
        periodLabel: periodLabelFor(),
        generatedByLabel: profile?.full_name ?? 'Usuario SIGER4',
        profileId: profile?.id ?? null,
      })

      const fileName = `siger4-${slugify(reportDef.label)}-${new Date().toISOString().slice(0, 10)}.pdf`
      doc.save(fileName)

      await recordAuditEvent({
        action: 'reporte_generado',
        tableName: 'reports',
        reason: `${reportDef.label} · ${scopeLabelFor()} · ${periodLabelFor()}`,
      })

      if (profile?.id) {
        await createNotification({
          type: 'reporte_generado',
          title: `Reporte generado: ${reportDef.label}`,
          body: `${scopeLabelFor()} · ${periodLabelFor()}`,
          profile_id: profile.id,
        }).catch(() => undefined)
      }

      setConfirmedKey(reportKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el reporte.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <AppShell title="Reportes">
      <h1 className="page-title">Reportes e Indicadores</h1>
      <p className="page-subtitle">Generá reportes institucionales en PDF con datos reales cargados en el sistema.</p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="reportType">Tipo de reporte</label>
          <select id="reportType" value={reportKey} onChange={(e) => setReportKey(e.target.value as ReportKey)}>
            {REPORT_TYPES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="periodStart">Desde</label>
            <input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="periodEnd">Hasta</label>
            <input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="regionFilter">Regional</label>
            <select
              id="regionFilter"
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value)
                setSubsedeId('')
                setStationId('')
              }}
            >
              <option value="">Todas</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="subsedeFilter">Subsede</label>
            <select
              id="subsedeFilter"
              value={subsedeId}
              onChange={(e) => {
                setSubsedeId(e.target.value)
                setStationId('')
              }}
            >
              <option value="">Todas</option>
              {subsedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="stationFilter">
              Cuartel {reportDef.needsStation && <span style={{ color: 'var(--color-primary)' }}>*</span>}
            </label>
            <select id="stationFilter" value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">{reportDef.needsStation ? 'Seleccionar cuartel' : 'Todos'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="button" className="btn btn-primary btn-block" disabled={generating} onClick={handleGenerate}>
          {generating ? 'Generando PDF…' : 'Generar y descargar PDF'}
        </button>

        {confirmedKey === reportKey && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
            Reporte generado y descargado. La solicitud quedó registrada en auditoría.
          </p>
        )}
      </div>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        {REPORT_TYPES.map((report) => (
          <button
            key={report.key}
            type="button"
            className="card-solid"
            style={{ textAlign: 'left', cursor: 'pointer', border: reportKey === report.key ? '2px solid var(--color-primary)' : undefined }}
            onClick={() => setReportKey(report.key)}
          >
            <Icon name="chart" size={20} />
            <h3 style={{ margin: '8px 0 0', fontSize: 14 }}>{report.label}</h3>
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="magic" size={18} />
          <h2 className="section-title">Asistente Institucional de Análisis</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Este módulo utiliza inteligencia artificial para asistir en la interpretación de reportes
          institucionales. Puede resumir datos, detectar tendencias, destacar puntos relevantes, señalar
          posibles alertas y redactar conclusiones iniciales. El análisis se genera automáticamente al crear
          un reporte, siempre que la función de IA esté configurada correctamente.
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Si la función de IA no está disponible, el reporte se genera igualmente sin análisis automático.
        </p>
        <AiDisclaimer />
      </div>
    </AppShell>
  )
}
