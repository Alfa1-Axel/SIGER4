import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { FilePicker } from '../components/ui/FilePicker'
import { fetchAvalesDepartments, fetchSchoolAvalDocumentById, renewSchoolAvalDocument } from '../lib/api/schoolAvales'
import { isDocumentMimeAllowed } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { isEditConflict } from '../lib/concurrency'
import { formatBytes } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import type { AvalesDepartment, SchoolAvalDocument } from '../types/database'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const TEXT_MAX = 2000
const ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

function yearOptions(): number[] {
  const current = new Date().getFullYear()
  return [current + 1, current, current - 1, current - 2, current - 3]
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Renovar un aval: reemplaza el archivo del MISMO aval (no se crea otro ni se acumulan archivos
// viejos). Lo hace la persona dueña del aval o la autoridad del departamento. Queda quién lo
// renovó, cuándo y cuántas veces. El aval anterior no se borra por antigüedad: sigue vigente hasta
// que se renueve, o lo archive o elimine una autoridad.
export function AvalRenovarPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const myProfileId = profile?.id ?? null

  const [doc, setDoc] = useState<SchoolAvalDocument | null>(null)
  const [department, setDepartment] = useState<AvalesDepartment | null>(null)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [observations, setObservations] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchSchoolAvalDocumentById(id), fetchAvalesDepartments()])
      .then(([found, departments]) => {
        if (!active) return
        if (!found) {
          setNotFound(true)
          return
        }
        setDoc(found)
        setDepartment(departments.find((d) => d.id === found.department_id) ?? null)
        setObservations(found.observations ?? '')
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar el aval.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  // Quien renueva: la persona dueña del aval o la autoridad del departamento (la base lo vuelve a comprobar).
  const isOwner =
    doc !== null &&
    myProfileId !== null &&
    (doc.person_profile_id === myProfileId || (doc.person_profile_id === null && doc.person_name === null && doc.uploaded_by_profile_id === myProfileId))
  const canRenew = doc !== null && !doc.is_archived && (isOwner || department?.can_manage === true)
  const backHref = doc ? `/escuela/avales?departamento=${doc.department_id}` : '/escuela/avales'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!doc) return
    setError(null)
    if (!file) return setError('Falta el archivo nuevo: tocá "Elegir archivo" (o "Sacar foto" desde el celular).')
    if (observations.length > TEXT_MAX) return setError(`Las observaciones no pueden superar los ${TEXT_MAX} caracteres.`)
    setSubmitting(true)
    try {
      const { oldFileRemoved } = await renewSchoolAvalDocument(doc, {
        file,
        referenceYear: year,
        observations: observations.trim(),
      })
      navigate(backHref, {
        state: {
          notice: oldFileRemoved
            ? 'El aval se renovó: el archivo nuevo reemplazó al anterior. Se mantiene vigente hasta que sea actualizado o eliminado por una autoridad habilitada.'
            : 'El aval se renovó con el archivo nuevo. El archivo anterior se quitará del almacenamiento más tarde; no lo ve nadie.',
        },
      })
    } catch (err) {
      if (isEditConflict(err)) {
        setStale(true)
        setError('Este aval se modificó mientras renovabas (otra persona lo cambió). Recargá la página para ver la versión actual y volvé a intentar.')
      } else {
        setError(describeSupabaseError(err, 'No pudimos renovar el aval. Reintentá en unos segundos.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Renovar aval">
      <EscuelaHeader />
      <Link to={backHref} className="back-link">
        ← Volver a Avales
      </Link>
      <h1 className="page-title">Renovar aval</h1>
      <p className="page-subtitle">
        Subí el archivo nuevo: reemplaza al anterior en el mismo aval. No se crea otro ni se acumulan archivos viejos.
      </p>

      {loading && (
        <div className="loading-state" role="status">
          Cargando…
        </div>
      )}

      {!loading && loadError && (
        <div className="alert alert-danger" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (notFound || !doc) && (
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>No encontramos ese aval. Puede haber sido eliminado, o no tenés permiso para verlo.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      )}

      {!loading && !loadError && doc && !canRenew && (
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>
            {doc.is_archived
              ? 'Este aval está archivado. Pedile a la autoridad del área que lo vuelva a activar, o cargá uno nuevo.'
              : 'Solo la persona a la que corresponde el aval o la autoridad del área pueden renovarlo.'}
          </p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      )}

      {!loading && !loadError && doc && canRenew && (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          <div className="field">
            <span className="field-label">Aval actual</span>
            <p className="field-help" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
              <strong>{doc.title}</strong>
              <br />
              {department?.name ?? 'Departamento'} · año {doc.reference_year ?? new Date(doc.created_at).getFullYear()} · {doc.file_name} ({formatBytes(doc.file_size)})
              <br />
              Cargado por {doc.uploaded_by_name ?? 'usuario eliminado'} el {formatDateTime(doc.created_at)}
              {doc.renewed_at && (
                <>
                  <br />
                  Última renovación: {doc.renewed_by_name ?? 'usuario eliminado'} el {formatDateTime(doc.renewed_at)}
                  {doc.renewal_count > 1 ? ` (${doc.renewal_count} renovaciones)` : ''}
                </>
              )}
            </p>
          </div>

          <div className="field">
            <label htmlFor="year">Año del aval</label>
            <select id="year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <FilePicker
            id="aval-file"
            label="Archivo nuevo"
            file={file}
            onChange={(selected) => {
              setFile(selected)
              setError(null)
            }}
            accept={ACCEPT}
            isAllowedType={isDocumentMimeAllowed}
            maxBytes={MAX_FILE_BYTES}
            formatsLabel="PDF, Word, Excel o foto (JPG, PNG, WEBP, HEIC)"
            allowCamera
            disabled={submitting}
          />

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" rows={2} maxLength={TEXT_MAX} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>

          <p className="field-help aval-keep-note">
            Este aval se mantiene vigente hasta que sea actualizado o eliminado por una autoridad habilitada. Al renovar, el archivo anterior
            se reemplaza; quedan registrados quién renovó y cuándo.
          </p>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
              {stale && (
                <>
                  {' '}
                  <button type="button" className="btn btn-outlined btn-sm" onClick={() => window.location.reload()}>
                    Recargar
                  </button>
                </>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Renovando…' : 'Renovar aval'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
