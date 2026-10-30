import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { FilePicker } from '../components/ui/FilePicker'
import { DraftRecoveryBanner, DraftStatusLine } from '../components/FormDraftUi'
import { useFormDraft } from '../hooks/useFormDraft'
import { addPointFile, createVerification, fetchPoint, fetchPointPermissions, fetchVerifications } from '../lib/api/mapPoints'
import type { PointPermissions } from '../lib/api/mapPoints'
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'
import { isMapPointMimeAllowed, MAP_POINT_FILE_MAX_BYTES } from '../lib/api/storage'
import { VERIFICATION_RESULT_LABEL, pointKindLabel } from '../lib/mapPointMeta'
import type { MapReferencePoint, MapVerificationResult } from '../types/database'

const FILE_ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
const MAX_EVIDENCE = 3

interface VerificationDraft {
  verifiedOn: string
  result: MapVerificationResult
  problems: string
  notes: string
  followUp: string
}

const RESULT_HELP: Record<MapVerificationResult, string> = {
  sin_problemas_informados: 'No encontraste problemas el día que fuiste. No es una garantía de que funcione hoy.',
  problema_informado: 'Encontraste algo que no está bien. Queda un seguimiento pendiente hasta que se resuelva.',
  no_se_pudo_verificar: 'Fuiste y no pudiste comprobarlo (acceso cerrado, no se encontró...). Explicalo en las notas.',
}

function todayInputValue(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

// Alta de una verificación de un punto de abastecimiento. Una verificación no se
// edita después: si hubo un error, se carga una nueva y la anterior queda en el
// historial. El texto se guarda solo como borrador mientras se escribe.
export function PuntoMapaVerificacionFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [point, setPoint] = useState<MapReferencePoint | null>(null)
  const [perms, setPerms] = useState<PointPermissions>({ canValidate: false, canPropose: false, canViewPrivate: false })
  const [form, setForm] = useState<VerificationDraft>({ verifiedOn: todayInputValue(), result: 'sin_problemas_informados', problems: '', notes: '', followUp: '' })
  const [files, setFiles] = useState<(File | null)[]>([null])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchPoint(id), fetchPointPermissions(id)])
      .then(([pointData, permissions]) => {
        if (!active) return
        setPoint(pointData)
        setPerms(permissions)
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar el punto. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  const draft = useFormDraft<VerificationDraft>({
    formKey: 'verificacion-punto',
    contextKey: `nueva:${id}`,
    value: form,
    enabled: !loading && !loadError && Boolean(point) && perms.canPropose && point?.type === 'abastecimiento',
  })

  function set<K extends keyof VerificationDraft>(key: K, value: VerificationDraft[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  function applyDraft(d: VerificationDraft) {
    setForm({ ...d, verifiedOn: d.verifiedOn || todayInputValue() })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!id || !point) return
    setError(null)
    if (!form.verifiedOn) return setError('Indicá la fecha de la verificación.')
    if (form.verifiedOn > todayInputValue()) return setError('La fecha de la verificación no puede ser futura.')
    if (form.result === 'problema_informado' && !form.problems.trim()) return setError('Contá qué problema encontraste.')

    setSubmitting(true)
    try {
      try {
        await createVerification({
          id: draft.clientRecordId,
          point_id: id,
          verified_on: form.verifiedOn,
          result: form.result,
          problems: form.problems.trim() || null,
          notes: form.notes.trim() || null,
          follow_up: form.followUp.trim() || null,
        })
      } catch (createErr) {
        // Si la respuesta de un intento anterior se perdió, la verificación ya existe: se retoma.
        if (postgrestCode(createErr) !== '23505') throw createErr
        const existing = await fetchVerifications(id)
        if (!existing.some((v) => v.id === draft.clientRecordId)) throw createErr
      }

      const chosen = files.filter((f): f is File => f !== null)
      const failed: string[] = []
      for (let i = 0; i < chosen.length; i += 1) {
        setProgress(`Subiendo la evidencia (${i + 1} de ${chosen.length})…`)
        try {
          await addPointFile({ pointId: id, file: chosen[i], kind: 'foto', visibility: 'compartido', caption: null, verificationId: draft.clientRecordId })
        } catch (fileErr) {
          failed.push(`${chosen[i].name} (${describeSupabaseError(fileErr, 'no se pudo subir')})`)
        }
      }
      void draft.resolve()
      navigate(`/mapa/puntos/${id}`, {
        state: failed.length
          ? { notice: `La verificación quedó registrada, pero no se pudo subir: ${failed.join('; ')}.`, noticeTone: 'warning' }
          : { notice: 'La verificación quedó registrada en el historial del punto.' },
      })
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos registrar la verificación. Reintentá en unos segundos.'))
      setSubmitting(false)
      setProgress(null)
    }
  }

  if (loading) {
    return (
      <AppShell title="Verificación">
        <div className="loading-state" role="status">Cargando…</div>
      </AppShell>
    )
  }
  if (loadError) {
    return (
      <AppShell title="Verificación">
        <div className="alert alert-danger" role="alert">{loadError}</div>
      </AppShell>
    )
  }
  if (!point) {
    return (
      <AppShell title="Verificación">
        <AccessDenied title="No encontramos este punto" message="Puede que lo hayan quitado del mapa o que no tengas acceso a él." backTo="/mapa" backLabel="Volver al mapa" />
      </AppShell>
    )
  }
  if (point.type !== 'abastecimiento') {
    return (
      <AppShell title="Verificación">
        <AccessDenied title="Este punto no tiene verificaciones" message="Las verificaciones son solo para los puntos de abastecimiento (hidrantes, reservas y cisternas)." backTo={`/mapa/puntos/${point.id}`} backLabel="Volver a la ficha" />
      </AppShell>
    )
  }
  if (!perms.canPropose) {
    return (
      <AppShell title="Verificación">
        <AccessDenied
          title="No podés registrar verificaciones acá"
          message="Las registran quienes cargan datos en el cuartel del punto (Presidente de CD, jefe de cuerpo activo, secretario de comisión y usuario de carga), Informática y el Secretario Regional."
          backTo={`/mapa/puntos/${point.id}`}
          backLabel="Volver a la ficha"
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Registrar verificación">
      <Link to={`/mapa/puntos/${point.id}`} className="back-link">← Volver a la ficha</Link>
      <h1 className="page-title">Registrar verificación</h1>
      <p className="page-subtitle">
        {point.name} · {pointKindLabel(point.type, point.subtype)}
      </p>
      <p className="field-help">Queda en el historial del punto con tu nombre y la fecha. No se edita después: si hay un error, cargá otra.</p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <DraftRecoveryBanner draft={draft} subject="una verificación" onApply={applyDraft} />

        <div className="field">
          <label htmlFor="ver-fecha">Fecha de la verificación</label>
          <input id="ver-fecha" type="date" max={todayInputValue()} value={form.verifiedOn} onChange={(e) => set('verifiedOn', e.target.value)} disabled={submitting} />
        </div>

        <fieldset className="field verification-results">
          <legend>Resultado</legend>
          {(Object.keys(VERIFICATION_RESULT_LABEL) as MapVerificationResult[]).map((value) => (
            <label key={value} className={`visibility-option ${form.result === value ? 'visibility-option--selected' : ''}`}>
              <input type="radio" name="resultado" value={value} checked={form.result === value} onChange={() => set('result', value)} disabled={submitting} />
              <span className="visibility-option-text">
                {VERIFICATION_RESULT_LABEL[value]}
                <span>{RESULT_HELP[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {form.result === 'problema_informado' && (
          <div className="field">
            <label htmlFor="ver-problemas">Qué problema encontraste</label>
            <textarea id="ver-problemas" rows={3} value={form.problems} maxLength={1500} onChange={(e) => set('problems', e.target.value)} disabled={submitting} />
          </div>
        )}

        <div className="field">
          <label htmlFor="ver-notas">Notas (opcional)</label>
          <textarea id="ver-notas" rows={2} value={form.notes} maxLength={1500} onChange={(e) => set('notes', e.target.value)} disabled={submitting} />
        </div>

        <div className="field">
          <label htmlFor="ver-seguimiento">Qué falta hacer (opcional)</label>
          <textarea id="ver-seguimiento" rows={2} value={form.followUp} maxLength={500} onChange={(e) => set('followUp', e.target.value)} disabled={submitting} aria-describedby="ver-seguimiento-ayuda" />
          <p id="ver-seguimiento-ayuda" className="field-help">Si lo completás, queda un seguimiento pendiente en el punto hasta que alguien lo marque como resuelto.</p>
        </div>

        <div className="field">
          {files.map((file, index) => (
            <FilePicker
              key={index}
              id={`ver-evidencia-${index}`}
              label={index === 0 ? 'Foto o evidencia (opcional)' : `Foto o evidencia ${index + 1}`}
              file={file}
              onChange={(next) => setFiles((current) => current.map((f, i) => (i === index ? next : f)))}
              accept={FILE_ACCEPT}
              isAllowedType={isMapPointMimeAllowed}
              maxBytes={MAP_POINT_FILE_MAX_BYTES}
              formatsLabel="JPG, PNG, WEBP o PDF, hasta 10 MB"
              allowCamera
              disabled={submitting}
            />
          ))}
          {files.length < MAX_EVIDENCE && files[files.length - 1] !== null && (
            <button type="button" className="btn btn-outlined btn-sm" onClick={() => setFiles((current) => [...current, null])} disabled={submitting}>
              Agregar otra foto
            </button>
          )}
          <p className="field-help">Los archivos no forman parte del borrador: si recargás la pantalla, hay que volver a elegirlos.</p>
        </div>

        <DraftStatusLine draft={draft} isNew onApply={applyDraft} />

        {progress && <p role="status">{progress}</p>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Registrar verificación'}
        </button>
      </form>
    </AppShell>
  )
}
