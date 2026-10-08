import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { NumberStepper } from './ui/NumberStepper'
import { fetchStationStaffing, fetchStationStaffingHistory, saveStationStaffing } from '../lib/api/stationStaffing'
import { describeSupabaseError } from '../lib/api/errors'
import { EMPTY_STAFFING, MAX_STAFFING_COUNT, STAFFING_GROUPS, STAFFING_TOTAL_NOTE, sameStaffing, staffingCountsOf, staffingYearOptions, sumStaffing } from '../lib/staffing'
import type { StaffingCategoryKey, StaffingCounts } from '../lib/staffing'
import type { StationStaffing, StationStaffingHistory } from '../types/database'

interface StationStaffingCardProps {
  stationId: string
  // Quién carga los efectivos: los mismos roles que cargan el personal del
  // cuartel (la base lo vuelve a exigir).
  canEdit: boolean
  // Lo que hoy figura como total del cuartel (stations.personnel_count):
  // mientras no haya efectivos cargados por categoría, es el personal activo
  // del registro nominal.
  currentTotal: number
  // Avisa el nuevo total al guardar, para que la ficha lo muestre sin recargar.
  onSaved: (total: number) => void
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { dateStyle: 'medium' })

function formatUpdated(row: Pick<StationStaffing, 'updated_at' | 'updated_by_name'>): string {
  const when = new Date(row.updated_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
  return row.updated_by_name ? `${when} · ${row.updated_by_name}` : when
}

// Efectivos del cuartel: cantidad de personas por categoría, que se edita
// cuando cambian (no es una carga mensual). El total se calcula solo y cada
// cambio queda en el historial. Se muestra en la ficha del cuartel (id
// "efectivos").
export function StationStaffingCard({ stationId, canEdit, currentTotal, onSaved }: StationStaffingCardProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<StationStaffing | null>(null)
  const [counts, setCounts] = useState<StaffingCounts>(EMPTY_STAFFING)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [history, setHistory] = useState<StationStaffingHistory[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const loadHistory = useCallback(() => {
    fetchStationStaffingHistory(stationId)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [stationId])

  const load = useCallback(() => {
    let active = true
    setStatus('loading')
    setLoadError(null)
    fetchStationStaffing(stationId)
      .then((row) => {
        if (!active) return
        setSaved(row)
        setCounts(staffingCountsOf(row))
        setYear(row?.reference_year ?? new Date().getFullYear())
        setStatus('ready')
        loadHistory()
      })
      .catch((err) => {
        if (!active) return
        setLoadError(describeSupabaseError(err, 'No pudimos cargar los efectivos. Reintentá en unos segundos.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [stationId, loadHistory])

  useEffect(() => load(), [load])

  const baseline = staffingCountsOf(saved)
  const baselineYear = saved?.reference_year ?? new Date().getFullYear()
  const dirty = !sameStaffing(counts, baseline) || year !== baselineYear
  const total = sumStaffing(counts)
  // Se ofrece también el año ya guardado, aunque ya no esté entre los recientes.
  const years = [...new Set([...staffingYearOptions(), baselineYear, year])].sort((a, b) => b - a)

  function change(key: StaffingCategoryKey, value: number) {
    setJustSaved(false)
    setSaveError(null)
    setCounts((prev) => ({ ...prev, [key]: value }))
  }

  function discard() {
    setCounts(baseline)
    setYear(baselineYear)
    setSaveError(null)
    setJustSaved(false)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!saved && total === 0) {
      setSaveError('Cargá al menos una categoría antes de guardar.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setJustSaved(false)
    try {
      const row = await saveStationStaffing(stationId, counts, year)
      setSaved(row)
      setCounts(staffingCountsOf(row))
      setYear(row.reference_year)
      setJustSaved(true)
      onSaved(row.total)
      loadHistory()
    } catch (err) {
      setSaveError(describeSupabaseError(err, 'No pudimos guardar los efectivos. Reintentá en unos segundos.'))
    } finally {
      setSaving(false)
    }
  }

  // Las actualizaciones anteriores a la actual (la primera foto es la vigente).
  const previous = history.slice(1)

  return (
    <section id="efectivos" className="anchor-target" aria-labelledby="efectivos-title">
      <div className="section-header">
        <h2 id="efectivos-title" className="section-title">
          Efectivos del cuartel
        </h2>
      </div>
      <div className="card staffing-card" style={{ marginBottom: 20 }}>
        <p className="staffing-intro">
          Cantidad de efectivos por categoría. Se actualiza cuando cambian; el total se calcula solo y no hace falta cargar nombres.
        </p>

        {status === 'loading' && (
          <div className="loading-state" role="status">
            Cargando los efectivos…
          </div>
        )}

        {status === 'error' && (
          <div className="alert alert-danger" role="alert">
            <span className="alert-content">{loadError}</span>
            <button type="button" className="btn btn-outlined btn-sm" onClick={load}>
              Reintentar
            </button>
          </div>
        )}

        {status === 'ready' && !canEdit && (
          <>
            {saved ? (
              <>
                <p className="staffing-meta">Efectivos al año {saved.reference_year}.</p>
                {STAFFING_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="staffing-group-title">{group.title}</h3>
                    <dl className="staffing-list">
                      {group.categories.map((c) => (
                        <div key={c.key}>
                          <dt>{c.label}</dt>
                          <dd>{saved[c.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <div className="staffing-total">
                  <span className="staffing-total-label">Total de efectivos</span>
                  <span className="staffing-total-value">{saved.total}</span>
                </div>
                <p className="staffing-meta">
                  {STAFFING_TOTAL_NOTE} Última actualización: {formatUpdated(saved)}
                </p>
              </>
            ) : (
              <div className="empty-state">
                Este cuartel todavía no cargó sus efectivos por categoría.
                {currentTotal > 0 && ` Figuran ${currentTotal} en el registro de personal.`}
              </div>
            )}
            <p className="staffing-meta">
              Los efectivos los actualizan el Presidente de CD, el Jefe de Cuerpo Activo o el usuario de carga del cuartel, el Secretario Regional e Informática y
              Estadística.
            </p>
          </>
        )}

        {status === 'ready' && canEdit && (
          <form onSubmit={handleSave} noValidate>
            {!saved && (
              <div className="alert alert-info" role="note" style={{ marginBottom: 14 }}>
                <span className="alert-content">
                  Todavía no cargaste los efectivos de este cuartel.
                  {currentTotal > 0 && ` Figuran ${currentTotal} en el registro de personal.`} Cargá la cantidad de cada categoría.
                </span>
              </div>
            )}

            <div className="field staffing-year">
              <label htmlFor="staffing-year">Año de referencia</label>
              <select id="staffing-year" value={year} disabled={saving} onChange={(e) => { setJustSaved(false); setSaveError(null); setYear(Number(e.target.value)) }}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {STAFFING_GROUPS.map((group) => (
              <fieldset key={group.title} className="staffing-group">
                <legend className="staffing-group-title">{group.title}</legend>
                <div className="staffing-grid">
                  {group.categories.map((c) => (
                    <NumberStepper
                      key={c.key}
                      label={c.label}
                      value={counts[c.key]}
                      min={0}
                      max={MAX_STAFFING_COUNT}
                      disabled={saving}
                      onChange={(value) => change(c.key, value)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}

            <div className="staffing-total" aria-live="polite">
              <span className="staffing-total-label">Total de efectivos</span>
              <span className="staffing-total-value">
                {total}
                {saved && dirty && <span className="staffing-total-before"> (antes {saved.total})</span>}
              </span>
            </div>
            <p className="staffing-meta">
              {STAFFING_TOTAL_NOTE} Cada categoría va de 0 a {MAX_STAFFING_COUNT}.
              {saved && ` Última actualización: ${formatUpdated(saved)}.`}
            </p>

            {saveError && (
              <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
                {saveError}
              </div>
            )}
            {justSaved && !dirty && (
              <div className="alert alert-success" role="status" style={{ marginTop: 12 }}>
                Efectivos guardados. Total: {saved?.total}.
              </div>
            )}

            <div className="staffing-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving || (!dirty && Boolean(saved))}>
                {saving ? 'Guardando…' : 'Guardar efectivos'}
              </button>
              {dirty && !saving && (
                <button type="button" className="btn btn-ghost" onClick={discard}>
                  Descartar cambios
                </button>
              )}
            </div>
          </form>
        )}

        {status === 'ready' && previous.length > 0 && (
          <details className="staffing-history">
            <summary>Actualizaciones anteriores ({previous.length})</summary>
            <ul>
              {previous.map((h) => (
                <li key={h.id}>
                  <span>
                    {formatDay(h.recorded_at)} · {h.total} {h.total === 1 ? 'efectivo' : 'efectivos'} · año {h.reference_year}
                  </span>
                  {h.recorded_by_name && <span className="staffing-history-by">{h.recorded_by_name}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
