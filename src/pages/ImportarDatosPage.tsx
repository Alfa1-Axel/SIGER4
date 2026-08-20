import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../hooks/useAuth'
import { fetchStations } from '../lib/api/stations'
import { describeSupabaseError } from '../lib/api/errors'
import { parseImportFile } from '../lib/import/parseFile'
import type { ParsedSheet } from '../lib/import/parseFile'
import { autoMapColumns, IMPORT_FIELD_DEFS } from '../lib/import/columnMapping'
import { buildImportPreview, runImport } from '../lib/import/runImport'
import type { ImportPreview, ImportRunResult } from '../lib/import/runImport'
import type { ImportModule, Station } from '../types/database'

const MODULE_OPTIONS: { key: ImportModule; label: string; description: string }[] = [
  { key: 'personal', label: 'Personal', description: 'Altas de personal/dotación por cuartel.' },
  { key: 'vehiculos', label: 'Vehículos', description: 'Altas de vehículos/móviles por cuartel.' },
  { key: 'asistencias', label: 'Asistencias', description: 'Resúmenes de asistencia por cuartel y período.' },
  { key: 'inventario', label: 'Inventario', description: 'Ítems del Inventario Regional.' },
]

type Step = 'elegir_modulo' | 'subir_archivo' | 'revisar_mapeo' | 'vista_previa' | 'resultado'

// Plantillas mínimas: solo encabezados (sin librería de generación de xlsx
// para esto -- un CSV con los encabezados esperados alcanza como punto de
// partida y evita otra dependencia). Se generan con los mismos labels que
// IMPORT_FIELD_DEFS, así siempre están sincronizadas con lo que el
// mapeo automático realmente reconoce.
function downloadTemplate(moduleKey: ImportModule) {
  const fields = IMPORT_FIELD_DEFS[moduleKey]
  const headers = fields.map((f) => f.label).join(',')
  const blob = new Blob([`${headers}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `plantilla_${moduleKey}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function ImportarDatosPage() {
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('elegir_modulo')
  const [moduleKey, setModuleKey] = useState<ImportModule | null>(null)
  const [fileName, setFileName] = useState('')
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [stations, setStations] = useState<Station[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportRunResult | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStep('elegir_modulo')
    setModuleKey(null)
    setFileName('')
    setSheet(null)
    setMapping({})
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !moduleKey) return
    setError(null)
    setLoading(true)
    try {
      const parsed = await parseImportFile(file)
      if (parsed.rows.length === 0) throw new Error('El archivo no tiene filas de datos (solo encabezado, o está vacío).')
      const stationsData = await fetchStations()
      setStations(stationsData)
      setSheet(parsed)
      setFileName(file.name)
      setMapping(autoMapColumns(parsed.headers, moduleKey))
      setStep('revisar_mapeo')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos leer el archivo.'))
    } finally {
      setLoading(false)
    }
  }

  function handleBuildPreview() {
    if (!sheet || !moduleKey) return
    const stationRefs = stations.map((s) => ({ id: s.id, name: s.name, code: s.code, region_id: s.region_id }))
    const built = buildImportPreview(moduleKey, sheet, mapping, stationRefs)
    setPreview(built)
    setStep('vista_previa')
  }

  async function handleConfirmImport() {
    if (!preview || !moduleKey || !profile) return
    setLoading(true)
    setError(null)
    try {
      const runResult = await runImport(moduleKey, fileName, preview, mapping, profile.id, profile.region_id)
      setResult(runResult)
      setStep('resultado')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos completar la importación.'))
    } finally {
      setLoading(false)
    }
  }

  const fields = moduleKey ? IMPORT_FIELD_DEFS[moduleKey] : []
  const unmappedRequiredFields = fields.filter((f) => f.required && !Object.values(mapping).includes(f.key))

  return (
    <AppShell title="Importar datos">
      <h1 className="page-title">Importar datos</h1>
      <p className="page-subtitle">
        Cargá Personal, Vehículos, Asistencias o Inventario desde un archivo Excel/CSV. El archivo nunca
        se guarda ni queda como dato final — solo se usa para completar los formularios reales, con vista
        previa y confirmación antes de crear cualquier registro.
      </p>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {step === 'elegir_modulo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MODULE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="card-solid"
              style={{ textAlign: 'left', cursor: 'pointer', border: 'none' }}
              onClick={() => {
                setModuleKey(option.key)
                setStep('subir_archivo')
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{option.label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{option.description}</div>
            </button>
          ))}
        </div>
      )}

      {step === 'subir_archivo' && moduleKey && (
        <div className="card-solid">
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Módulo: <strong>{MODULE_OPTIONS.find((m) => m.key === moduleKey)?.label}</strong>
          </p>
          <button type="button" className="btn btn-outlined" style={{ marginBottom: 16 }} onClick={() => downloadTemplate(moduleKey)}>
            Descargar plantilla de ejemplo (.csv)
          </button>
          <div className="field">
            <label htmlFor="importFile">Archivo (.xlsx o .csv)</label>
            <input ref={fileInputRef} id="importFile" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void handleFileSelected(e)} />
          </div>
          {loading && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Leyendo archivo…</p>}
          <button type="button" className="btn btn-outlined" style={{ marginTop: 12 }} onClick={reset}>
            Elegir otro módulo
          </button>
        </div>
      )}

      {step === 'revisar_mapeo' && sheet && moduleKey && (
        <div className="card-solid">
          <p style={{ fontSize: 13, marginBottom: 4 }}>
            <strong>{fileName}</strong> — {sheet.rows.length} filas detectadas.
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Revisá que cada columna del archivo esté asignada al campo correcto. El mapeo automático es
            solo un punto de partida — corregilo acá si hizo falta.
          </p>

          {sheet.headers.map((header) => (
            <div className="field" key={header}>
              <label htmlFor={`map-${header}`}>Columna: "{header}"</label>
              <select
                id={`map-${header}`}
                value={mapping[header] ?? ''}
                onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
              >
                <option value="">No importar esta columna</option>
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                    {field.required ? ' (obligatorio)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {unmappedRequiredFields.length > 0 && (
            <p className="field-error" style={{ marginTop: 8 }}>
              Faltan mapear campos obligatorios: {unmappedRequiredFields.map((f) => f.label).join(', ')}.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" disabled={unmappedRequiredFields.length > 0} onClick={handleBuildPreview}>
              Ver vista previa
            </button>
            <button type="button" className="btn btn-outlined" onClick={reset}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'vista_previa' && preview && (
        <>
          <div className="card-solid" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <span>
                <strong>{preview.validCount}</strong> filas listas para importar
              </span>
              <span style={{ color: preview.invalidCount > 0 ? 'var(--color-warning)' : undefined }}>
                <strong>{preview.invalidCount}</strong> filas con error (se van a omitir)
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 16, maxHeight: 420, overflowY: 'auto' }}>
            {preview.rows.map((row, i) => (
              <div
                key={row.rowNumber}
                style={{
                  padding: '10px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Fila {row.rowNumber}</span>
                  <span className={`badge ${row.valid ? 'badge-success' : 'badge-danger'}`}>
                    {row.valid ? 'OK' : 'Error'}
                  </span>
                </div>
                {!row.valid && (
                  <div style={{ color: 'var(--color-danger)', marginTop: 4, overflowWrap: 'anywhere' }}>
                    {row.errors.join(' ')}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || preview.validCount === 0}
              onClick={() => void handleConfirmImport()}
            >
              {loading ? 'Importando…' : `Confirmar importación de ${preview.validCount} filas`}
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => setStep('revisar_mapeo')}>
              Volver a mapeo
            </button>
            <button type="button" className="btn btn-outlined" onClick={reset}>
              Cancelar
            </button>
          </div>
        </>
      )}

      {step === 'resultado' && result && (
        <div className="card-solid">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="clipboardList" size={20} />
            <h2 style={{ margin: 0, fontSize: 16 }}>Importación completada</h2>
          </div>
          <div className="card-grid" style={{ marginBottom: 16 }}>
            <div className="kpi-card">
              <div className="kpi-value">{result.createdCount}</div>
              <div className="kpi-label">Creados</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{result.skippedCount}</div>
              <div className="kpi-label">Omitidos</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{result.errorCount}</div>
              <div className="kpi-label">Errores al insertar</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={reset}>
              Importar otro archivo
            </button>
            {moduleKey && (
              <Link
                to={
                  moduleKey === 'personal' || moduleKey === 'vehiculos' || moduleKey === 'asistencias'
                    ? '/cuarteles'
                    : '/inventario'
                }
                className="btn btn-outlined"
              >
                Ver {moduleKey === 'inventario' ? 'Inventario' : 'Cuarteles'}
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
