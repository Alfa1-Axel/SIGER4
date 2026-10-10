import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { DraftRecoveryBanner, DraftStatusLine } from '../components/FormDraftUi'
import { useFormDraft } from '../hooks/useFormDraft'
import { fetchPoint, fetchPointPermissions, fetchSheet, proposeSheet, saveSheet } from '../lib/api/mapPoints'
import type { PointPermissions } from '../lib/api/mapPoints'
import { describeSupabaseError } from '../lib/api/errors'
import { isEditConflict } from '../lib/concurrency'
import { SHEET_FIELD_LABEL, NO_INFO, pointKindLabel } from '../lib/mapPointMeta'
import type { MapCharacteristic, MapPointSheet, MapPointSheetPayload, MapReferencePoint } from '../types/database'

const MAX_CHARACTERISTICS = 20

interface FichaDraft {
  address: string
  locality: string
  responsibleEntity: string
  institutionalContact: string
  accessNotes: string
  observations: string
  documentedRisks: string
  surveyedOn: string
  surveyedByName: string
  reviewEveryDays: string
  characteristics: MapCharacteristic[]
  note: string
}

const EMPTY_DRAFT: FichaDraft = {
  address: '',
  locality: '',
  responsibleEntity: '',
  institutionalContact: '',
  accessNotes: '',
  observations: '',
  documentedRisks: '',
  surveyedOn: '',
  surveyedByName: '',
  reviewEveryDays: '',
  characteristics: [],
  note: '',
}

function fromSheet(sheet: MapPointSheet | null): FichaDraft {
  if (!sheet) return EMPTY_DRAFT
  return {
    address: sheet.address ?? '',
    locality: sheet.locality ?? '',
    responsibleEntity: sheet.responsible_entity ?? '',
    institutionalContact: sheet.institutional_contact ?? '',
    accessNotes: sheet.access_notes ?? '',
    observations: sheet.observations ?? '',
    documentedRisks: sheet.documented_risks ?? '',
    surveyedOn: sheet.surveyed_on ?? '',
    surveyedByName: sheet.surveyed_by_name ?? '',
    reviewEveryDays: sheet.review_every_days ? String(sheet.review_every_days) : '',
    characteristics: sheet.characteristics ?? [],
    note: '',
  }
}

function todayInputValue(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatField(field: string, value: unknown): string {
  if (field === 'characteristics') {
    const list = (value as MapCharacteristic[] | null | undefined) ?? []
    return list.length === 0 ? NO_INFO : list.map((c) => `${c.label}: ${c.value}${c.unit ? ` ${c.unit}` : ''}`).join(' · ')
  }
  if (value === null || value === undefined || value === '') return NO_INFO
  return String(value)
}

// Edición de la ficha de un punto del mapa.
// - Quien valida (Informática, Secretario Regional en su Regional) guarda directo.
// - Quien carga en el cuartel del punto PROPONE: la ficha no cambia hasta que se acepta.
// Todo lo que se escribe se guarda solo como borrador mientras tanto (useFormDraft).
export function PuntoMapaFichaFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [point, setPoint] = useState<MapReferencePoint | null>(null)
  const [sheet, setSheet] = useState<MapPointSheet | null>(null)
  const [perms, setPerms] = useState<PointPermissions>({ canValidate: false, canPropose: false, canViewPrivate: false })
  const [form, setForm] = useState<FichaDraft>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ mine: Record<string, unknown> } | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchPoint(id), fetchSheet(id), fetchPointPermissions(id)])
      .then(([pointData, sheetData, permissions]) => {
        if (!active) return
        setPoint(pointData)
        setSheet(sheetData)
        setPerms(permissions)
        setForm(fromSheet(sheetData))
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar la ficha. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  const draft = useFormDraft<FichaDraft>({
    formKey: 'ficha-punto',
    contextKey: `edit:${id}`,
    value: form,
    enabled: !loading && !loadError && Boolean(point) && (perms.canValidate || perms.canPropose),
    recordId: id ?? null,
    baseVersion: sheet?.row_version ?? null,
  })

  const isSupply = point?.type === 'abastecimiento'
  const mode: 'guardar' | 'proponer' = perms.canValidate ? 'guardar' : 'proponer'

  function set<K extends keyof FichaDraft>(key: K, value: FichaDraft[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  function setCharacteristic(index: number, patch: Partial<MapCharacteristic>) {
    setForm((current) => ({
      ...current,
      characteristics: current.characteristics.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))
  }

  // El payload que viaja a la base: textos recortados, vacío = sin información.
  const payload = useMemo<MapPointSheetPayload>(() => {
    const clean = (v: string) => v.trim() || null
    return {
      address: clean(form.address),
      locality: clean(form.locality),
      responsible_entity: clean(form.responsibleEntity),
      institutional_contact: clean(form.institutionalContact),
      access_notes: clean(form.accessNotes),
      observations: clean(form.observations),
      documented_risks: clean(form.documentedRisks),
      characteristics: form.characteristics
        .filter((c) => c.label.trim() || c.value.trim())
        .map((c) => ({
          label: c.label.trim(),
          value: c.value.trim(),
          ...(c.unit?.trim() ? { unit: c.unit.trim() } : {}),
          ...(c.source?.trim() ? { source: c.source.trim() } : {}),
        })),
      surveyed_on: form.surveyedOn || null,
      surveyed_by_name: clean(form.surveyedByName),
      ...(isSupply && perms.canValidate ? { review_every_days: form.reviewEveryDays ? Number(form.reviewEveryDays) : null } : {}),
    }
  }, [form, isSupply, perms.canValidate])

  function applyDraft(d: FichaDraft) {
    setForm({ ...EMPTY_DRAFT, ...d })
  }

  async function finish(message: string) {
    void draft.resolve()
    navigate(`/mapa/puntos/${id}`, { state: { notice: message } })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!id || !point) return
    setError(null)
    if (form.characteristics.some((c) => !c.label.trim() !== !c.value.trim())) {
      return setError('Cada característica necesita nombre y valor. Completala o quitala.')
    }
    if (form.reviewEveryDays && (!Number.isInteger(Number(form.reviewEveryDays)) || Number(form.reviewEveryDays) < 1 || Number(form.reviewEveryDays) > 3650)) {
      return setError('El plazo de revisión tiene que ser un número entero de días entre 1 y 3650.')
    }
    if (form.surveyedOn && form.surveyedOn > todayInputValue()) return setError('La fecha del relevamiento no puede ser futura.')

    setSubmitting(true)
    try {
      if (mode === 'guardar') {
        await saveSheet(id, payload, sheet?.row_version ?? null)
        await finish('La ficha se guardó.')
        return
      }
      // Quien propone manda solo lo que cambia respecto de la ficha actual.
      const base = sheet ?? ({} as Partial<MapPointSheet>)
      const changes: MapPointSheetPayload = {}
      for (const key of Object.keys(payload) as (keyof MapPointSheetPayload)[]) {
        if (JSON.stringify(payload[key] ?? null) !== JSON.stringify((base as Record<string, unknown>)[key] ?? null)) {
          ;(changes as Record<string, unknown>)[key] = payload[key]
        }
      }
      if (Object.keys(changes).length === 0) return setError('No cambiaste nada respecto de la ficha actual.')
      await proposeSheet(id, changes, form.note.trim() || null, sheet?.row_version ?? null, draft.clientRecordId)
      await finish('La propuesta se envió. La ficha cambia cuando Informática o el Secretario Regional la validen.')
    } catch (err) {
      if (mode === 'guardar' && isEditConflict(err)) {
        setConflict({ mine: payload as Record<string, unknown> })
      } else {
        setError(describeSupabaseError(err, 'No pudimos guardar. Reintentá en unos segundos.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Ficha del mapa">
        <div className="loading-state" role="status">Cargando…</div>
      </AppShell>
    )
  }
  if (loadError) {
    return (
      <AppShell title="Ficha del mapa">
        <div className="alert alert-danger" role="alert">{loadError}</div>
      </AppShell>
    )
  }
  if (!point) {
    return (
      <AppShell title="Ficha del mapa">
        <AccessDenied title="No encontramos este punto" message="Puede que lo hayan quitado del mapa o que no tengas acceso a él." backTo="/mapa" backLabel="Volver al mapa" />
      </AppShell>
    )
  }
  if (!perms.canValidate && !perms.canPropose) {
    return (
      <AppShell title="Ficha del mapa">
        <AccessDenied
          title="No podés editar esta ficha"
          message="La ficha la editan Informática y el Secretario Regional de la Regional. Los roles que cargan datos en el cuartel del punto pueden proponer cambios."
          backTo={`/mapa/puntos/${point.id}`}
          backLabel="Volver a la ficha"
        />
      </AppShell>
    )
  }

  return (
    <AppShell title={mode === 'guardar' ? 'Editar ficha' : 'Proponer cambios'}>
      <Link to={`/mapa/puntos/${point.id}`} className="back-link">← Volver a la ficha</Link>
      <h1 className="page-title">{mode === 'guardar' ? (sheet ? 'Editar ficha' : 'Cargar ficha') : 'Proponer cambios'}</h1>
      <p className="page-subtitle">
        {point.name} · {pointKindLabel(point.type, point.subtype)}
      </p>
      <p className="field-help">
        {mode === 'guardar'
          ? 'Cargá lo que conozcas. Lo que no sepas, dejalo vacío: figura como "Sin información".'
          : 'Tu propuesta no cambia la ficha: la ve Informática o el Secretario Regional, que la aceptan o la rechazan. Lo que no sepas, dejalo vacío.'}
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <DraftRecoveryBanner draft={draft} subject="la ficha" onApply={applyDraft} currentVersion={sheet?.row_version ?? null} />

        <div className="form-row">
          <div className="field">
            <label htmlFor="ficha-direccion">{SHEET_FIELD_LABEL.address}</label>
            <input id="ficha-direccion" value={form.address} maxLength={200} onChange={(e) => set('address', e.target.value)} disabled={submitting} />
          </div>
          <div className="field">
            <label htmlFor="ficha-localidad">{SHEET_FIELD_LABEL.locality}</label>
            <input id="ficha-localidad" value={form.locality} maxLength={100} onChange={(e) => set('locality', e.target.value)} disabled={submitting} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="ficha-entidad">{SHEET_FIELD_LABEL.responsible_entity}</label>
            <input id="ficha-entidad" value={form.responsibleEntity} maxLength={120} onChange={(e) => set('responsibleEntity', e.target.value)} disabled={submitting} aria-describedby="ficha-entidad-ayuda" />
            <p id="ficha-entidad-ayuda" className="field-help">La empresa, el organismo o la institución titular. No una persona.</p>
          </div>
          <div className="field">
            <label htmlFor="ficha-contacto">{SHEET_FIELD_LABEL.institutional_contact}</label>
            <input id="ficha-contacto" value={form.institutionalContact} maxLength={300} onChange={(e) => set('institutionalContact', e.target.value)} disabled={submitting} aria-describedby="ficha-contacto-ayuda" />
            <p id="ficha-contacto-ayuda" className="field-help">Teléfono o correo general de la entidad. Los contactos de personas van en la parte reservada.</p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="ficha-accesos">{SHEET_FIELD_LABEL.access_notes}</label>
          <textarea id="ficha-accesos" rows={2} value={form.accessNotes} maxLength={1000} onChange={(e) => set('accessNotes', e.target.value)} disabled={submitting} />
        </div>
        <div className="field">
          <label htmlFor="ficha-observaciones">{SHEET_FIELD_LABEL.observations}</label>
          <textarea id="ficha-observaciones" rows={3} value={form.observations} maxLength={2000} onChange={(e) => set('observations', e.target.value)} disabled={submitting} />
        </div>
        <div className="field">
          <label htmlFor="ficha-riesgos">{SHEET_FIELD_LABEL.documented_risks}</label>
          <textarea id="ficha-riesgos" rows={3} value={form.documentedRisks} maxLength={2000} onChange={(e) => set('documentedRisks', e.target.value)} disabled={submitting} aria-describedby="ficha-riesgos-ayuda" />
          <p id="ficha-riesgos-ayuda" className="field-help">Solo lo que consta en el relevamiento o en un documento. No lo que se supone.</p>
        </div>

        <fieldset className="sheet-characteristics-editor">
          <legend>{SHEET_FIELD_LABEL.characteristics}</legend>
          <p className="field-help">Nombre, valor, y si la conocés, la unidad y la fuente del dato. Hasta {MAX_CHARACTERISTICS}. No cargues cifras que no tengas documentadas.</p>
          {form.characteristics.map((c, index) => (
            <div key={index} className="sheet-characteristic-row">
              <div className="field">
                <label htmlFor={`car-nombre-${index}`}>Nombre</label>
                <input id={`car-nombre-${index}`} value={c.label} maxLength={60} onChange={(e) => setCharacteristic(index, { label: e.target.value })} disabled={submitting} />
              </div>
              <div className="field">
                <label htmlFor={`car-valor-${index}`}>Valor</label>
                <input id={`car-valor-${index}`} value={c.value} maxLength={120} onChange={(e) => setCharacteristic(index, { value: e.target.value })} disabled={submitting} />
              </div>
              <div className="field">
                <label htmlFor={`car-unidad-${index}`}>Unidad</label>
                <input id={`car-unidad-${index}`} value={c.unit ?? ''} maxLength={20} onChange={(e) => setCharacteristic(index, { unit: e.target.value })} disabled={submitting} />
              </div>
              <div className="field">
                <label htmlFor={`car-fuente-${index}`}>Fuente</label>
                <input id={`car-fuente-${index}`} value={c.source ?? ''} maxLength={120} onChange={(e) => setCharacteristic(index, { source: e.target.value })} disabled={submitting} />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setForm((current) => ({ ...current, characteristics: current.characteristics.filter((_, i) => i !== index) }))}
                disabled={submitting}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outlined btn-sm"
            onClick={() => setForm((current) => ({ ...current, characteristics: [...current.characteristics, { label: '', value: '', unit: '', source: '' }] }))}
            disabled={submitting || form.characteristics.length >= MAX_CHARACTERISTICS}
          >
            Agregar una característica
          </button>
        </fieldset>

        <div className="form-row">
          <div className="field">
            <label htmlFor="ficha-relevado-por">{SHEET_FIELD_LABEL.surveyed_by_name}</label>
            <input id="ficha-relevado-por" value={form.surveyedByName} maxLength={120} onChange={(e) => set('surveyedByName', e.target.value)} disabled={submitting} />
          </div>
          <div className="field">
            <label htmlFor="ficha-relevado-fecha">{SHEET_FIELD_LABEL.surveyed_on}</label>
            <input id="ficha-relevado-fecha" type="date" max={todayInputValue()} value={form.surveyedOn} onChange={(e) => set('surveyedOn', e.target.value)} disabled={submitting} />
          </div>
        </div>

        {isSupply && perms.canValidate && (
          <div className="field">
            <label htmlFor="ficha-revision">{SHEET_FIELD_LABEL.review_every_days}</label>
            <input id="ficha-revision" type="number" min={1} max={3650} inputMode="numeric" value={form.reviewEveryDays} onChange={(e) => set('reviewEveryDays', e.target.value)} disabled={submitting} aria-describedby="ficha-revision-ayuda" />
            <p id="ficha-revision-ayuda" className="field-help">
              Opcional. Si la cargás, el punto figura como "pendiente de nueva revisión" cuando pasan esos días desde la última verificación. Sin plazo, no hay vencimiento.
            </p>
          </div>
        )}

        {mode === 'proponer' && (
          <div className="field">
            <label htmlFor="ficha-nota">Nota para quien valida (opcional)</label>
            <textarea id="ficha-nota" rows={2} value={form.note} maxLength={500} onChange={(e) => set('note', e.target.value)} disabled={submitting} />
          </div>
        )}

        <DraftStatusLine draft={draft} isNew={false} onApply={applyDraft} />

        {conflict && (
          <EditConflictPanel
            table="map_point_sheets"
            keyColumn="point_id"
            recordId={point.id}
            base={(sheet ?? {}) as Record<string, unknown>}
            mine={conflict.mine}
            fieldLabel={(field) => SHEET_FIELD_LABEL[field as keyof MapPointSheetPayload] ?? field}
            formatValue={formatField}
            onSave={(patch, version) => saveSheet(point.id, patch as MapPointSheetPayload, version)}
            onResolved={() => finish('La ficha se guardó.')}
            onDiscard={() => {
              void draft.discard().then(() => window.location.reload())
            }}
            onClose={() => setConflict(null)}
          />
        )}

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Enviando…' : mode === 'guardar' ? 'Guardar ficha' : 'Enviar propuesta'}
        </button>
      </form>
    </AppShell>
  )
}
