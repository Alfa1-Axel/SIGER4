import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { NumberStepper } from './ui/NumberStepper'
import { fetchStationStaffing, saveStationStaffing } from '../lib/api/stationStaffing'
import { describeSupabaseError } from '../lib/api/errors'
import { EMPTY_STAFFING, MAX_STAFFING_COUNT, STAFFING_GROUPS, sameStaffing, staffingCountsOf, sumStaffing } from '../lib/staffing'
import type { StaffingCategoryKey, StaffingCounts } from '../lib/staffing'
import type { StationStaffing } from '../types/database'

interface StationStaffingCardProps {
  stationId: string
  // Quién carga la dotación: los mismos roles que cargan el personal del
  // cuartel (la base lo vuelve a exigir).
  canEdit: boolean
  // Lo que hoy figura como dotación del cuartel (stations.personnel_count):
  // mientras no haya categorías cargadas, es el personal activo del registro
  // nominal.
  currentTotal: number
  // Avisa el nuevo total al guardar, para que la ficha lo muestre sin recargar.
  onSaved: (total: number) => void
}

function formatUpdated(row: StationStaffing): string {
  const when = new Date(row.updated_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
  return row.updated_by_name ? `${when} · ${row.updated_by_name}` : when
}

// Dotación actual del cuartel: cantidad de integrantes por categoría, que se
// edita cuando cambia la dotación real (no es una carga mensual). El total se
// calcula solo. Se muestra en la ficha del cuartel (id "dotacion").
export function StationStaffingCard({ stationId, canEdit, currentTotal, onSaved }: StationStaffingCardProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<StationStaffing | null>(null)
  const [counts, setCounts] = useState<StaffingCounts>(EMPTY_STAFFING)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const load = useCallback(() => {
    let active = true
    setStatus('loading')
    setLoadError(null)
    fetchStationStaffing(stationId)
      .then((row) => {
        if (!active) return
        setSaved(row)
        setCounts(staffingCountsOf(row))
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(describeSupabaseError(err, 'No pudimos cargar la dotación. Reintentá en unos segundos.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [stationId])

  useEffect(() => load(), [load])

  const baseline = staffingCountsOf(saved)
  const dirty = !sameStaffing(counts, baseline)
  const total = sumStaffing(counts)

  function change(key: StaffingCategoryKey, value: number) {
    setJustSaved(false)
    setSaveError(null)
    setCounts((prev) => ({ ...prev, [key]: value }))
  }

  function discard() {
    setCounts(baseline)
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
      const row = await saveStationStaffing(stationId, counts)
      setSaved(row)
      setCounts(staffingCountsOf(row))
      setJustSaved(true)
      onSaved(row.total)
    } catch (err) {
      setSaveError(describeSupabaseError(err, 'No pudimos guardar la dotación. Reintentá en unos segundos.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="dotacion" className="anchor-target" aria-labelledby="dotacion-title">
      <div className="section-header">
        <h2 id="dotacion-title" className="section-title">
          Dotación actual
        </h2>
      </div>
      <div className="card staffing-card" style={{ marginBottom: 20 }}>
        <p className="staffing-intro">
          Cantidad de integrantes por categoría. Se actualiza cuando cambia la dotación real del cuartel; el total se calcula solo y no hace falta cargar
          nombres.
        </p>

        {status === 'loading' && (
          <div className="loading-state" role="status">
            Cargando la dotación…
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
                  <span className="staffing-total-label">Dotación total</span>
                  <span className="staffing-total-value">{saved.total}</span>
                </div>
                <p className="staffing-meta">Última actualización: {formatUpdated(saved)}</p>
              </>
            ) : (
              <div className="empty-state">
                Este cuartel todavía no cargó su dotación por categorías.
                {currentTotal > 0 && ` Figuran ${currentTotal} en el registro de personal.`}
              </div>
            )}
            <p className="staffing-meta">
              La dotación la actualizan el Presidente, el Jefe de Cuerpo Activo o el usuario de carga del cuartel, el Secretario Regional y Informática y
              Estadística.
            </p>
          </>
        )}

        {status === 'ready' && canEdit && (
          <form onSubmit={handleSave} noValidate>
            {!saved && (
              <div className="alert alert-info" role="note" style={{ marginBottom: 14 }}>
                <span className="alert-content">
                  Todavía no cargaste la dotación de este cuartel.
                  {currentTotal > 0 && ` Hoy figuran ${currentTotal} en el registro de personal.`} Cargá la dotación actual por categoría.
                </span>
              </div>
            )}

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
              <span className="staffing-total-label">Dotación total</span>
              <span className="staffing-total-value">
                {total}
                {saved && dirty && <span className="staffing-total-before"> (antes {saved.total})</span>}
              </span>
            </div>
            <p className="staffing-meta">
              Cada categoría va de 0 a {MAX_STAFFING_COUNT}.
              {saved && ` Última actualización: ${formatUpdated(saved)}.`}
            </p>

            {saveError && (
              <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
                {saveError}
              </div>
            )}
            {justSaved && !dirty && (
              <div className="alert alert-success" role="status" style={{ marginTop: 12 }}>
                Dotación guardada. Total: {saved?.total}.
              </div>
            )}

            <div className="staffing-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving || (!dirty && Boolean(saved))}>
                {saving ? 'Guardando…' : 'Guardar dotación'}
              </button>
              {dirty && !saving && (
                <button type="button" className="btn btn-ghost" onClick={discard}>
                  Descartar cambios
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
