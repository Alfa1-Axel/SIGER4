import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { AiDisclaimer } from '../components/ui/AiDisclaimer'
import { recordAuditEvent } from '../lib/api/audit'

const REPORT_TYPES = [
  { key: 'estadisticas_regionales', label: 'Estadísticas Regionales' },
  { key: 'asistencia_cuartel', label: 'Asistencia por Cuartel' },
  { key: 'intervenciones', label: 'Intervenciones por Categoría' },
  { key: 'capacitaciones', label: 'Capacitaciones y Cursos' },
]

export function ReportesPage() {
  const [generating, setGenerating] = useState<string | null>(null)
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null)

  async function handleGenerate(reportKey: string, label: string) {
    setGenerating(reportKey)
    setConfirmedKey(null)
    try {
      await recordAuditEvent({
        action: 'solicitud_reporte',
        tableName: 'reports',
        reason: label,
      })
      // La generación real de PDF y el análisis con IA se implementan en la
      // siguiente fase (edge function + servicio de IA institucional). Por
      // ahora solo queda registrada la solicitud en la auditoría.
      setConfirmedKey(reportKey)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <AppShell title="Reportes">
      <h1 className="page-title">Reportes e Indicadores</h1>
      <p className="page-subtitle">Generá reportes institucionales en base a los datos cargados en el sistema.</p>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        {REPORT_TYPES.map((report) => (
          <div key={report.key} className="card-solid">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Icon name="chart" size={20} />
                <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{report.label}</h3>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={generating === report.key}
              onClick={() => handleGenerate(report.key, report.label)}
            >
              {generating === report.key ? 'Registrando solicitud…' : 'Solicitar reporte'}
            </button>
            {confirmedKey === report.key && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
                Solicitud registrada en auditoría. La generación real del PDF está en fase preparada:
                todavía no produce un archivo descargable.
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="magic" size={18} />
          <h2 className="section-title">Asistente Institucional de Análisis</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Próximamente este módulo podrá resumir reportes, detectar tendencias, comparar períodos, detectar
          anomalías y redactar conclusiones sobre los datos regionales.
        </p>
        <AiDisclaimer />
      </div>
    </AppShell>
  )
}
