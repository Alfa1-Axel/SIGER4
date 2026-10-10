import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { AttachmentsPicker } from '../components/ui/AttachmentsPicker'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { Icon } from '../components/ui/Icon'
import { fetchDepartments } from '../lib/api/departments'
import {
  DEPARTMENT_REPORT_TYPE_LABEL,
  DEPARTMENT_REPORT_TYPES,
  addDepartmentReportFile,
  createDepartmentReport,
  deleteDepartmentReport,
  fetchDepartmentReport,
  removeDepartmentReportFile,
  updateDepartmentReport,
} from '../lib/api/departmentReports'
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'
import { isEditConflict } from '../lib/concurrency'
import { formatBytes } from '../lib/format'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { useFormDraft } from '../hooks/useFormDraft'
import { DraftRecoveryBanner, DraftStatusLine } from '../components/FormDraftUi'
import type { Department, DepartmentReport, DepartmentReportFile, DepartmentReportType, DepartmentReportWithFiles } from '../types/database'

type Mode = 'redactar' | 'cargar'

interface ReportDraft {
  departmentId: string
  reportType: DepartmentReportType
  title: string
  reportDate: string
  body: string
  observations: string
}

interface UploadState {
  name: string
  size: number
  loaded: number
  status: 'pendiente' | 'subiendo' | 'subido' | 'error'
  error?: string
}

const MAX_FILES = 10
const MAX_BODY = 20000

function todayInputValue(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function titleFromFileName(name: string): string {
  return name
    .replace(/\.[a-zA-Z0-9]{1,10}$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 200)
}

// Alta y edición de informes de un departamento (0098).
// - /departamentos/informes/nuevo?modo=redactar|cargar&departamento=<id>
// - /departamentos/informes/:reportId/editar
// "Redactar": el texto se escribe acá; fotos y archivos son opcionales.
// "Cargar": el informe es un archivo (acta, PDF, foto del papel); el texto
// es opcional. Se puede cambiar de modo sin perder lo escrito.
export function DepartamentoInformeFormPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const isEditing = Boolean(reportId)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const access = useDepartmentReportsAccess()

  const mode: Mode = searchParams.get('modo') === 'cargar' ? 'cargar' : 'redactar'
  const departmentFromQuery = searchParams.get('departamento') ?? ''

  const [departments, setDepartments] = useState<Department[]>([])
  const [existing, setExisting] = useState<DepartmentReportWithFiles | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [departmentId, setDepartmentId] = useState(departmentFromQuery)
  const [reportType, setReportType] = useState<DepartmentReportType>(mode === 'cargar' ? 'acta_reunion' : 'informe_operativo')
  const [title, setTitle] = useState('')
  const [reportDate, setReportDate] = useState(todayInputValue())
  const [body, setBody] = useState('')
  const [observations, setObservations] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [uploads, setUploads] = useState<UploadState[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removingFileId, setRemovingFileId] = useState<string | null>(null)
  // Otra persona cambió el informe mientras se editaba: lo que se intentó guardar.
  const [conflict, setConflict] = useState<{ mine: Record<string, unknown> } | null>(null)

  const draftValue = useMemo<ReportDraft>(
    () => ({ departmentId, reportType, title, reportDate, body, observations }),
    [departmentId, reportType, title, reportDate, body, observations],
  )

  useEffect(() => {
    let active = true
    Promise.all([fetchDepartments(), reportId ? fetchDepartmentReport(reportId) : Promise.resolve(null)])
      .then(([departmentsData, reportData]) => {
        if (!active) return
        setDepartments(departmentsData)
        if (reportData) {
          setExisting(reportData)
          setDepartmentId(reportData.department_id)
          setReportType(reportData.report_type)
          setTitle(reportData.title)
          setReportDate(reportData.report_date)
          setBody(reportData.body ?? '')
          setObservations(reportData.observations ?? '')
        }
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los datos. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reportId])


  // Departamentos donde puede cargar: los que ve y están activos.
  const { canView } = access
  const writableDepartments = useMemo(() => departments.filter((d) => d.is_active && canView(d.id)), [departments, canView])

  // Si hay un solo departamento posible, queda elegido.
  useEffect(() => {
    if (isEditing || departmentId || writableDepartments.length !== 1) return
    setDepartmentId(writableDepartments[0].id)
  }, [isEditing, departmentId, writableDepartments])

  // Borrador en el servidor (0113). Recién se activa cuando el formulario terminó de
  // cargar y de elegir solo el departamento, para no guardar un borrador vacío.
  const draft = useFormDraft<ReportDraft>({
    formKey: 'informe-departamento',
    contextKey: isEditing ? `edit:${reportId}` : `nuevo:${departmentFromQuery || 'general'}`,
    value: draftValue,
    enabled: !loading && !loadError && (isEditing ? Boolean(existing) : writableDepartments.length !== 1 || Boolean(departmentId)),
    recordId: reportId ?? null,
    baseVersion: existing?.row_version ?? null,
  })

  function applyDraft(d: ReportDraft) {
    if (d.departmentId && !isEditing) setDepartmentId(d.departmentId)
    setReportType(d.reportType)
    setTitle(d.title)
    setReportDate(d.reportDate || todayInputValue())
    setBody(d.body)
    setObservations(d.observations)
  }

  const selectedDepartment = departments.find((d) => d.id === departmentId) ?? null
  const backHref = existing
    ? `/departamentos/informes/${existing.id}`
    : departmentFromQuery
      ? `/departamentos/${departmentFromQuery}`
      : '/departamentos'

  function switchMode(next: Mode) {
    const params = new URLSearchParams(searchParams)
    params.set('modo', next)
    setSearchParams(params, { replace: true })
    setError(null)
  }

  function handleFilesChange(next: File[]) {
    setFiles(next)
    setError(null)
    if (!title.trim() && next.length > 0 && mode === 'cargar') setTitle(titleFromFileName(next[0].name))
  }

  async function handleRemoveExistingFile(file: DepartmentReportFile) {
    if (!existing) return
    if (!window.confirm(`¿Quitar "${file.file_name}" del informe? El archivo se borra.`)) return
    setRemovingFileId(file.id)
    setError(null)
    try {
      await removeDepartmentReportFile(file)
      setExisting({ ...existing, files: existing.files.filter((f) => f.id !== file.id) })
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos quitar el archivo. Reintentá en unos segundos.'))
    } finally {
      setRemovingFileId(null)
    }
  }

  // Sube los archivos de a uno, con progreso. Devuelve los nombres que
  // fallaron (con el motivo).
  async function uploadAll(report: { id: string; department_id: string }, list: File[]): Promise<string[]> {
    const states: UploadState[] = list.map((f) => ({ name: f.name, size: f.size, loaded: 0, status: 'pendiente' }))
    setUploads([...states])
    const failed: string[] = []
    for (let i = 0; i < list.length; i += 1) {
      states[i] = { ...states[i], status: 'subiendo' }
      setUploads([...states])
      try {
        await addDepartmentReportFile(report, list[i], (fraction) => {
          states[i] = { ...states[i], loaded: Math.round(fraction * list[i].size) }
          setUploads([...states])
        })
        states[i] = { ...states[i], status: 'subido', loaded: list[i].size }
      } catch (err) {
        const reason = describeSupabaseError(err, 'no se pudo subir')
        states[i] = { ...states[i], status: 'error', error: reason }
        failed.push(`${list[i].name} (${reason})`)
      }
      setUploads([...states])
    }
    return failed
  }

  // Cierre del guardado de un informe existente: sube los archivos nuevos y vuelve al detalle.
  async function finishEdit(report: DepartmentReportWithFiles) {
    const failed = files.length ? await uploadAll(report, files) : []
    void draft.resolve()
    navigate(`/departamentos/informes/${report.id}`, {
      state: failed.length
        ? { notice: `Se guardaron los cambios, pero no se pudieron subir: ${failed.join('; ')}. Probá agregarlos de nuevo.`, noticeTone: 'warning' }
        : { notice: files.length ? 'Se guardaron los cambios y los archivos nuevos.' : 'Se guardaron los cambios.' },
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!departmentId || (!isEditing && !writableDepartments.some((d) => d.id === departmentId))) {
      return setError('Elegí el departamento del informe.')
    }
    if (mode === 'cargar' && !isEditing && files.length === 0) {
      return setError('Agregá el archivo del informe o acta (o sacale una foto al papel).')
    }
    if (!title.trim()) return setError('Escribí un título, por ejemplo: "Acta reunión mensual de octubre".')
    if (!reportDate) return setError('Indicá la fecha del informe o de la actividad.')
    if (mode === 'redactar' && !body.trim() && files.length === 0 && !(existing && existing.files.length > 0)) {
      return setError('Escribí el texto del informe o adjuntá un archivo.')
    }
    if (body.length > MAX_BODY) return setError(`El texto supera los ${MAX_BODY.toLocaleString('es-AR')} caracteres. Acortalo o adjuntalo como archivo.`)

    setSubmitting(true)
    const input = {
      report_type: reportType,
      title: title.trim(),
      body: body.trim() || null,
      observations: observations.trim() || null,
      report_date: reportDate,
    }
    try {
      if (existing) {
        await updateDepartmentReport(existing.id, input, existing.row_version)
        await finishEdit(existing)
        return
      }

      // El id lo eligió el borrador de antemano: si la respuesta se pierde y se reintenta,
      // el segundo intento no duplica el informe sino que retoma el primero.
      let created: DepartmentReport
      try {
        created = await createDepartmentReport(departmentId, input, draft.clientRecordId)
      } catch (createErr) {
        if (postgrestCode(createErr) !== '23505') throw createErr
        const already = await fetchDepartmentReport(draft.clientRecordId)
        if (!already) throw createErr
        created = already
      }
      const failed = files.length ? await uploadAll(created, files) : []

      // Un informe "cargado" sin texto y sin ningún archivo subido no sirve:
      // se elimina y se queda en el formulario para reintentar.
      if (failed.length === files.length && files.length > 0 && !input.body) {
        try {
          await deleteDepartmentReport({ ...created, files: [] })
        } catch {
          // Si no se pudo borrar, queda visible para su autor y lo puede eliminar.
        }
        setUploads(null)
        setError(`No se pudo subir ningún archivo: ${failed.join('; ')}. Revisá la conexión y volvé a intentar.`)
        setSubmitting(false)
        return
      }

      void draft.resolve()
      navigate(`/departamentos/informes/${created.id}`, {
        state: failed.length
          ? { notice: `Se guardó el informe, pero no se pudieron subir: ${failed.join('; ')}. Agregalos desde "Editar".`, noticeTone: 'warning' }
          : { notice: `"${input.title}" quedó cargado en ${selectedDepartment?.name ?? 'el departamento'}.` },
      })
    } catch (err) {
      setUploads(null)
      setSubmitting(false)
      if (existing && isEditConflict(err)) {
        setConflict({ mine: input })
        return
      }
      setError(describeSupabaseError(err, 'No pudimos guardar el informe. Reintentá en unos segundos.'))
    }
  }

  if (loading) {
    return (
      <AppShell title="Informe">
        <div className="loading-state" role="status">Cargando…</div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell title="Informe">
        <div className="alert alert-danger" role="alert">{loadError}</div>
      </AppShell>
    )
  }

  if (isEditing && (!existing || !access.canManage(existing))) {
    return (
      <AppShell title="Informe">
        <AccessDenied
          title={existing ? 'No podés editar este informe' : 'No encontramos el informe'}
          message={
            existing
              ? 'Lo editan quien lo cargó, el coordinador del departamento e Informática.'
              : 'Puede que lo hayan eliminado o que no tengas acceso a los informes de ese departamento.'
          }
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  if (!isEditing && writableDepartments.length === 0) {
    return (
      <AppShell title="Nuevo informe">
        <AccessDenied
          title="No podés cargar informes"
          message="Cargan informes el coordinador de cada departamento, sus miembros e Informática y Estadística. Si tenés que cargar en un departamento, pedile a su coordinador que te sume como miembro."
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  const pageTitle = isEditing ? 'Editar informe' : mode === 'cargar' ? 'Cargar informe o acta' : 'Redactar informe'
  const totalBytes = uploads?.reduce((sum, u) => sum + u.size, 0) ?? 0
  const loadedBytes = uploads?.reduce((sum, u) => sum + (u.status === 'error' ? u.size : u.loaded), 0) ?? 0
  const doneCount = uploads?.filter((u) => u.status === 'subido' || u.status === 'error').length ?? 0
  const existingFiles = existing?.files ?? []

  const filesField = (
    <AttachmentsPicker
      id="informe-archivos"
      label={mode === 'cargar' && !isEditing ? 'Archivos del informe' : isEditing ? 'Agregar archivos' : 'Fotos y archivos de respaldo'}
      files={files}
      onChange={handleFilesChange}
      maxFiles={MAX_FILES}
      existingCount={existingFiles.length}
      required={mode === 'cargar' && !isEditing}
      disabled={submitting}
      hint={
        mode === 'cargar' && !isEditing
          ? 'El acta o el informe (PDF, Word o una foto del papel) y, si querés, fotos o videos de respaldo.'
          : undefined
      }
    />
  )

  return (
    <AppShell title={pageTitle}>
      <Link to={backHref} className="back-link">
        ← {existing ? 'Volver al informe' : selectedDepartment && departmentFromQuery ? `Volver a ${selectedDepartment.name}` : 'Volver a Departamentos'}
      </Link>
      <h1 className="page-title">{pageTitle}</h1>
      <p className="page-subtitle">
        {isEditing
          ? 'Cambiá los datos, agregá o quitá archivos.'
          : mode === 'cargar'
            ? 'Subí el acta o informe que ya tenés (también podés sacarle una foto) y completá los datos.'
            : 'Escribí el informe acá. Podés sumar fotos, videos o archivos de respaldo.'}
      </p>

      {!isEditing && (
        <div className="segmented" role="group" aria-label="Cómo cargar el informe">
          <button type="button" className="chip" aria-pressed={mode === 'redactar'} onClick={() => switchMode('redactar')} disabled={submitting}>
            <Icon name="edit" size={14} />
            Redactar en el sistema
          </button>
          <button type="button" className="chip" aria-pressed={mode === 'cargar'} onClick={() => switchMode('cargar')} disabled={submitting}>
            <Icon name="file" size={14} />
            Subir un archivo
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <DraftRecoveryBanner draft={draft} subject="un informe" onApply={applyDraft} currentVersion={existing?.row_version ?? null} />

        <div className="form-row">
          <div className="field">
            <label htmlFor="departamento">Departamento</label>
            <select
              id="departamento"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={isEditing || submitting || writableDepartments.length === 1}
              aria-describedby="departamento-help"
            >
              {!isEditing && !writableDepartments.some((d) => d.id === departmentId) && <option value="">Elegí un departamento</option>}
              {(isEditing && selectedDepartment ? [selectedDepartment] : writableDepartments).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <p id="departamento-help" className="field-help">
              Lo ven el coordinador, los miembros del departamento e Informática.
            </p>
          </div>

          <div className="field">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" value={reportType} onChange={(e) => setReportType(e.target.value as DepartmentReportType)} disabled={submitting}>
              {DEPARTMENT_REPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DEPARTMENT_REPORT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mode === 'cargar' && !isEditing && filesField}

        <div className="form-row">
          <div className="field" style={{ flex: '2 1 260px' }}>
            <label htmlFor="titulo">Título</label>
            <input
              id="titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: Acta reunión mensual de octubre"
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} disabled={submitting} aria-describedby="fecha-help" />
            <p id="fecha-help" className="field-help">
              Del informe o de la actividad.
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="texto">
            {mode === 'redactar' ? 'Texto del informe' : 'Resumen o comentario'}
            {(mode === 'cargar' || existingFiles.length > 0) && <span className="field-label-optional"> (opcional)</span>}
          </label>
          <textarea
            id="texto"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={mode === 'redactar' ? 10 : 4}
            placeholder={mode === 'redactar' ? 'Qué se hizo, quiénes participaron, qué se resolvió y qué queda pendiente.' : 'Lo más importante del documento, para leerlo sin abrirlo.'}
            disabled={submitting}
          />
          {body.length > MAX_BODY * 0.9 && (
            <p className="field-help">
              {body.length.toLocaleString('es-AR')} de {MAX_BODY.toLocaleString('es-AR')} caracteres.
            </p>
          )}
        </div>

        {isEditing && existingFiles.length > 0 && (
          <div className="field">
            <span className="field-label">Archivos del informe</span>
            <ul className="attachment-list attachment-list--boxed">
              {existingFiles.map((f) => (
                <li key={f.id} className="attachment-item">
                  <span className="list-item-icon">
                    <Icon name={f.file_kind === 'imagen' ? 'image' : f.file_kind === 'video' ? 'video' : 'file'} size={18} />
                  </span>
                  <span className="file-picker-name">
                    <strong>{f.file_name}</strong>
                    <span>{formatBytes(f.file_size)}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRemoveExistingFile(f)}
                    disabled={submitting || removingFileId === f.id}
                  >
                    {removingFileId === f.id ? 'Quitando…' : 'Quitar'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(mode === 'redactar' || isEditing) && filesField}

        <div className="field">
          <label htmlFor="observaciones">
            Observaciones<span className="field-label-optional"> (opcional)</span>
          </label>
          <textarea id="observaciones" value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} maxLength={2000} disabled={submitting} />
        </div>

        {uploads && (
          <div className="upload-progress" role="status" aria-live="polite">
            <div className="upload-progress-head">
              <strong>
                Subiendo archivos ({doneCount} de {uploads.length})
              </strong>
              <span>{totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0}%</span>
            </div>
            <progress max={1} value={totalBytes ? loadedBytes / totalBytes : 0} aria-label="Progreso de la subida" />
            <ul className="upload-progress-list">
              {uploads.map((u, i) => (
                <li key={`${u.name}-${i}`} className={`upload-progress-item upload-progress-item--${u.status}`}>
                  <span className="upload-progress-name">{u.name}</span>
                  <span>
                    {u.status === 'pendiente' && 'En espera'}
                    {u.status === 'subiendo' && `${u.size ? Math.round((u.loaded / u.size) * 100) : 0}%`}
                    {u.status === 'subido' && 'Subido'}
                    {u.status === 'error' && 'Error'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {conflict && existing && (
          <EditConflictPanel
            table="department_reports"
            recordId={existing.id}
            base={existing as unknown as Record<string, unknown>}
            mine={conflict.mine}
            onSave={(patch, version) => updateDepartmentReport(existing.id, patch, version)}
            onResolved={() => finishEdit(existing)}
            onDiscard={() => window.location.reload()}
            onClose={() => setConflict(null)}
          />
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <DraftStatusLine draft={draft} isNew={!isEditing} onApply={applyDraft} />

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? (uploads ? 'Subiendo archivos…' : 'Guardando…') : isEditing ? 'Guardar cambios' : 'Guardar informe'}
        </button>
      </form>
    </AppShell>
  )
}
