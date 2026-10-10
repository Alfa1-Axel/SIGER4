import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './ui/Icon'
import { describeSupabaseError } from '../lib/api/errors'
import { translateField, translateValue } from '../lib/audit/humanize'
import {
  analyzeConflict,
  describeChangesAsText,
  fetchCurrentRow,
  fetchUpdaterName,
  isEditConflict,
} from '../lib/concurrency'
import type { ConflictField } from '../lib/concurrency'

interface EditConflictPanelProps {
  // Tabla y registro que se estaba editando.
  table: string
  recordId: string
  // Columna que identifica al registro (por defecto id; las fichas del mapa usan point_id).
  keyColumn?: string
  // La fila tal como la leyó el formulario al abrirse.
  base: Record<string, unknown>
  // Lo que la persona intentó guardar (columnas de la tabla).
  mine: Record<string, unknown>
  // Guarda un cambio sobre la versión indicada; si vuelve a haber conflicto,
  // lanza el error P0409 y el panel vuelve a comparar.
  onSave: (patch: Record<string, unknown>, expectedVersion: number) => Promise<unknown>
  // Se guardó: el formulario sigue su camino normal (volver al detalle, etc.).
  onResolved: (saved: unknown) => void | Promise<void>
  // La persona prefiere quedarse con la versión vigente y descartar lo suyo.
  onDiscard: () => void
  // Cerrar el panel y seguir editando sin guardar.
  onClose: () => void
  // Etiqueta y formato de los campos; por defecto, los de Auditoría.
  fieldLabel?: (field: string) => string
  formatValue?: (field: string, value: unknown) => string
}

type Choice = 'mine' | 'current'

// Se muestra cuando la base rechazó el guardado porque otra persona cambió el
// registro mientras se editaba. Lo escrito NO se pierde: sigue en el
// formulario y acá se compara campo por campo. Los cambios de la otra persona
// en campos que no tocaste se conservan; en los campos donde cambiaron los dos
// elegís cuál queda; guardar manda la combinación sobre la versión vigente.
export function EditConflictPanel({
  table,
  recordId,
  keyColumn = 'id',
  base,
  mine,
  onSave,
  onResolved,
  onDiscard,
  onClose,
  fieldLabel = translateField,
  formatValue = translateValue,
}: EditConflictPanelProps) {
  const [current, setCurrent] = useState<Record<string, unknown> | null | undefined>(undefined)
  const [updaterName, setUpdaterName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const row = await fetchCurrentRow(table, recordId, keyColumn)
      setCurrent(row)
      setChoices({})
      setUpdaterName(row ? await fetchUpdaterName(row.updated_by_profile_id as string | null | undefined) : null)
    } catch (err) {
      setLoadError(describeSupabaseError(err, 'No pudimos traer la versión actual. Reintentá en unos segundos.'))
      setCurrent(undefined)
    }
  }, [table, recordId, keyColumn])

  useEffect(() => {
    void load()
  }, [load])

  // Lleva la vista al aviso: en el celular el botón de guardar queda lejos.
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [])

  const analysis = useMemo(() => (current ? analyzeConflict(base, mine, current) : null), [base, mine, current])
  const conflicts = analysis?.fields.filter((f) => f.kind === 'conflict') ?? []
  const pendingChoices = conflicts.filter((f) => !choices[f.field])
  const updatedAt = current && typeof current.updated_at === 'string' ? current.updated_at : null

  async function handleCopy() {
    const text = describeChangesAsText(mine, base, fieldLabel, formatValue) || 'No había cambios para copiar.'
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      // Sin permiso de portapapeles (HTTP, navegador viejo): se selecciona el texto.
      setCopied('fail')
    }
  }

  async function handleSave() {
    if (!current || !analysis) return
    setSaveError(null)
    // Se manda lo mío donde la otra persona no tocó, y lo elegido donde chocamos.
    const patch: Record<string, unknown> = {}
    for (const f of analysis.fields) {
      if (f.kind === 'mine-only' || choices[f.field] === 'mine') patch[f.field] = f.mine
    }
    if (Object.keys(patch).length === 0) {
      // Todo lo mío quedó descartado o ya estaba igual en la versión vigente.
      onDiscard()
      return
    }
    setSaving(true)
    try {
      const saved = await onSave(patch, Number(current.row_version))
      await onResolved(saved)
    } catch (err) {
      if (isEditConflict(err)) {
        setSaveError('Mientras resolvías las diferencias, alguien volvió a cambiar el registro. Revisalo de nuevo.')
        await load()
      } else {
        setSaveError(describeSupabaseError(err, 'No pudimos guardar los cambios. Reintentá en unos segundos.'))
      }
      setSaving(false)
    }
  }

  function renderValue(field: string, value: unknown) {
    const text = formatValue(field, value)
    return <span className="conflict-value">{text}</span>
  }

  function renderConflict(f: ConflictField) {
    const choice = choices[f.field]
    return (
      <li key={f.field} className="conflict-field">
        <strong className="conflict-field-name">{fieldLabel(f.field)}</strong>
        {f.kind === 'conflict' ? (
          <fieldset className="conflict-choice">
            <legend className="sr-only">Qué valor queda en {fieldLabel(f.field)}</legend>
            <label className={`conflict-option ${choice === 'mine' ? 'conflict-option--selected' : ''}`}>
              <input type="radio" name={`conflict-${f.field}`} checked={choice === 'mine'} onChange={() => setChoices((c) => ({ ...c, [f.field]: 'mine' }))} />
              <span>
                <span className="conflict-option-label">Tu cambio</span>
                {renderValue(f.field, f.mine)}
              </span>
            </label>
            <label className={`conflict-option ${choice === 'current' ? 'conflict-option--selected' : ''}`}>
              <input type="radio" name={`conflict-${f.field}`} checked={choice === 'current'} onChange={() => setChoices((c) => ({ ...c, [f.field]: 'current' }))} />
              <span>
                <span className="conflict-option-label">Versión actual</span>
                {renderValue(f.field, f.current)}
              </span>
            </label>
          </fieldset>
        ) : (
          <div className="conflict-mine-only">
            <span className="conflict-option-label">Tu cambio (se aplica)</span>
            {renderValue(f.field, f.mine)}
          </div>
        )}
      </li>
    )
  }

  return (
    <div ref={panelRef} className="conflict-panel alert alert-warning" role="alert" aria-labelledby="conflict-title">
      <span aria-hidden="true">
        <Icon name="info" size={18} />
      </span>
      <div className="alert-content">
        <strong id="conflict-title">Este registro fue actualizado mientras lo editabas.</strong>
        <p className="conflict-lead">
          No se guardó nada y <strong>lo que escribiste sigue en el formulario</strong>.
          {current && (
            <>
              {' '}
              Lo cambió {updaterName ?? 'otra persona'}
              {updatedAt ? ` (${new Date(updatedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}.
            </>
          )}
        </p>

        {current === undefined && !loadError && <p role="status">Trayendo la versión actual…</p>}
        {loadError && (
          <div>
            <p>{loadError}</p>
            <button type="button" className="btn btn-outlined btn-sm" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}

        {current === null && (
          <p>
            Ya no podés ver este registro: lo eliminaron o cambió tu acceso. Tus cambios siguen en el formulario; copialos para no perderlos.
          </p>
        )}

        {analysis && (
          <>
            {analysis.fields.length === 0 && (
              <p>La otra persona ya dejó el registro como lo querías: no queda nada tuyo por guardar.</p>
            )}
            {analysis.fields.length > 0 && (
              <>
                <p className="conflict-help">
                  {conflicts.length > 0
                    ? 'Elegí qué valor queda en los campos donde cambiaron las dos personas. Lo que cambió la otra persona y vos no tocaste se conserva.'
                    : 'Tus cambios no chocan con los de la otra persona: se pueden guardar sobre la versión actual.'}
                </p>
                <ul className="conflict-list">{analysis.fields.map(renderConflict)}</ul>
              </>
            )}
            {analysis.keptFromOthers.length > 0 && (
              <p className="conflict-kept">
                Se conserva lo que cambió la otra persona en: {analysis.keptFromOthers.map((f) => fieldLabel(f)).join(', ')}.
              </p>
            )}
          </>
        )}

        {copied === 'ok' && <p role="status">Copiamos tus cambios. Pegalos donde quieras guardarlos.</p>}
        {copied === 'fail' && (
          <textarea
            readOnly
            rows={5}
            className="conflict-copy"
            aria-label="Tus cambios, para copiar"
            value={describeChangesAsText(mine, base, fieldLabel, formatValue)}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        {saveError && <p className="conflict-error">{saveError}</p>}

        <div className="conflict-actions">
          {analysis && analysis.fields.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving || pendingChoices.length > 0}>
              {saving ? 'Guardando…' : 'Guardar sobre la versión actual'}
            </button>
          )}
          {analysis && pendingChoices.length > 0 && <span className="conflict-pending">Falta elegir en {pendingChoices.length === 1 ? 'un campo' : `${pendingChoices.length} campos`}.</span>}
          <button type="button" className="btn btn-outlined" onClick={() => void handleCopy()} disabled={saving}>
            Copiar mis cambios
          </button>
          <button
            type="button"
            className="btn btn-outlined"
            onClick={() => {
              if (window.confirm('Se descartan los cambios que escribiste y se muestra la versión actual. ¿Seguro?')) onDiscard()
            }}
            disabled={saving}
          >
            Descartar lo mío y ver la versión actual
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Seguir editando
          </button>
        </div>
      </div>
    </div>
  )
}
