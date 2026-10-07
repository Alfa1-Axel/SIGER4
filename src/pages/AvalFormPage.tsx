import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { FilePicker } from '../components/ui/FilePicker'
import {
  fetchAvalesDepartments,
  fetchSchoolAvalDocumentById,
  updateSchoolAvalDocument,
  uploadSchoolAvalDocument,
} from '../lib/api/schoolAvales'
import { isDocumentMimeAllowed } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { formatBytes } from '../lib/format'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { useSessionDraft } from '../hooks/useSessionDraft'
import type { AvalesDepartment, SchoolAvalDocument } from '../types/database'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const TITLE_MAX = 200
const TEXT_MAX = 2000
const ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

interface AvalDraft {
  departmentId: string
  title: string
  description: string
  observations: string
}

// "aval_incendios-2026.pdf" -> "aval incendios 2026": sugerencia de título
// cuando el usuario elige el archivo antes de escribir uno.
function titleFromFileName(name: string): string {
  return name
    .replace(/\.[a-zA-Z0-9]{1,10}$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX)
}

// Alta de un aval (cualquier rol con acceso, solo en departamentos activos
// que puede ver), desde escritorio o celular, y edición de metadata (solo
// informatica_r4). El archivo de un aval ya cargado no se reemplaza: editar es
// cambiar título, descripción, observaciones o departamento.
export function AvalFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canManage } = useSchoolAvalesAccess()

  const [departments, setDepartments] = useState<AvalesDepartment[]>([])
  const [existing, setExisting] = useState<SchoolAvalDocument | null>(null)
  const [departmentId, setDepartmentId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [observations, setObservations] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoredDraft, setRestoredDraft] = useState(false)

  const blockedEdit = isEditing && !canManage
  const draftValue = useMemo<AvalDraft>(() => ({ departmentId, title, description, observations }), [departmentId, title, description, observations])
  const { readDraft, clearDraft } = useSessionDraft<AvalDraft>('aval-nuevo', draftValue, !isEditing && !loading)

  useEffect(() => {
    if (blockedEdit) {
      setLoading(false)
      return
    }
    let active = true
    Promise.all([fetchAvalesDepartments(), id ? fetchSchoolAvalDocumentById(id) : Promise.resolve(null)])
      .then(([departmentsData, doc]) => {
        if (!active) return
        setDepartments(departmentsData)
        if (id) {
          if (!doc) {
            setNotFound(true)
            return
          }
          setExisting(doc)
          setDepartmentId(doc.department_id)
          setTitle(doc.title)
          setDescription(doc.description ?? '')
          setObservations(doc.observations ?? '')
          return
        }
        const activeDepartments = departmentsData.filter((d) => d.is_active)
        const draft = readDraft()
        const hasDraft = Boolean(draft && (draft.title || draft.description || draft.observations))
        const draftDepartment = draft ? activeDepartments.find((d) => d.id === draft.departmentId) : undefined
        const fromQuery = activeDepartments.find((d) => d.id === searchParams.get('departamento'))
        setDepartmentId(draftDepartment?.id ?? fromQuery?.id ?? (activeDepartments.length === 1 ? activeDepartments[0].id : ''))
        if (draft && hasDraft) {
          setTitle(draft.title)
          setDescription(draft.description)
          setObservations(draft.observations)
          setRestoredDraft(true)
        }
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los departamentos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, blockedEdit, searchParams, readDraft])

  // Al crear, solo departamentos activos (los únicos donde la base deja
  // cargar). Al editar (admin), todos, incluido el actual aunque esté inactivo.
  const departmentOptions = isEditing ? departments : departments.filter((d) => d.is_active)
  const selectedDepartment = departments.find((d) => d.id === departmentId)
  const backHref = departmentId ? `/escuela/avales?departamento=${departmentId}` : '/escuela/avales'

  function handleFileChange(selected: File | null) {
    setFile(selected)
    setError(null)
    if (selected && !title.trim()) setTitle(titleFromFileName(selected.name))
  }

  function handleDiscardDraft() {
    clearDraft()
    setTitle('')
    setDescription('')
    setObservations('')
    setRestoredDraft(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const cleanTitle = title.trim()
    if (!departmentId) return setError('Elegí el departamento donde va el aval.')
    if (!isEditing && !file) return setError('Falta el archivo: tocá "Elegir archivo" (o "Sacar foto" desde el celular).')
    if (!cleanTitle) return setError('Escribí un título para reconocer el aval en el listado.')
    if (cleanTitle.length > TITLE_MAX) return setError(`El título no puede superar los ${TITLE_MAX} caracteres.`)
    if (description.length > TEXT_MAX || observations.length > TEXT_MAX) {
      return setError(`La descripción y las observaciones no pueden superar los ${TEXT_MAX} caracteres.`)
    }

    setSubmitting(true)
    try {
      const target = `/escuela/avales?departamento=${departmentId}`
      if (isEditing && id) {
        await updateSchoolAvalDocument(id, {
          title: cleanTitle,
          description: description.trim() || null,
          observations: observations.trim() || null,
          department_id: departmentId,
        })
        navigate(target, { state: { notice: 'Los datos del aval se guardaron.' } })
      } else if (file) {
        await uploadSchoolAvalDocument({
          departmentId,
          title: cleanTitle,
          description: description.trim() || null,
          observations: observations.trim() || null,
          file,
        })
        clearDraft()
        navigate(target, { state: { notice: `"${cleanTitle}" se subió correctamente.` } })
      }
    } catch (err) {
      setError(describeSupabaseError(err, isEditing ? 'No pudimos guardar los cambios. Reintentá en unos segundos.' : 'No pudimos subir el aval. Reintentá en unos segundos.'))
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEditing ? 'Editar datos del aval' : 'Subir aval'

  if (blockedEdit) {
    return (
      <AppShell title={pageTitle}>
        <EscuelaHeader />
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>Los datos de un aval ya cargado los edita solo el Dpto. Informática y Estadística R4.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={pageTitle}>
      <EscuelaHeader />
      <Link to={backHref} className="back-link">
        ← Volver a Avales
      </Link>
      <h1 className="page-title">{pageTitle}</h1>
      <p className="page-subtitle">
        {isEditing
          ? 'Cambiá los datos del aval. El archivo ya cargado no se reemplaza.'
          : 'Elegí el departamento, el archivo (o sacale una foto) y un título. Funciona desde la computadora o el celular.'}
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

      {!loading && !loadError && notFound && (
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>No encontramos ese aval. Puede haber sido eliminado, o no tenés acceso a su departamento.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length === 0 && (
        <div className="empty-state">
          No hay departamentos activos donde puedas subir avales. Si deberías tenerlos, consultá a Informática y Estadística para que revisen
          tu departamento en la sección Departamentos.
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length > 0 && (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          {restoredDraft && (
            <div className="alert alert-info" role="status">
              <span className="alert-content">Recuperamos los datos que habías escrito. Revisalos y elegí el archivo.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleDiscardDraft} style={{ color: 'inherit' }}>
                Empezar de cero
              </button>
            </div>
          )}

          <div className="field">
            <label htmlFor="department">Departamento</label>
            <select
              id="department"
              required
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={!isEditing && departmentOptions.length === 1}
            >
              {departmentOptions.length > 1 && <option value="">Elegí un departamento</option>}
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                  {!department.is_active ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
            {selectedDepartment && (
              <p className="field-help">
                {selectedDepartment.coordinator_name
                  ? `Coordinador: ${selectedDepartment.coordinator_name}${selectedDepartment.is_my_department ? ' (vos)' : ''}.`
                  : 'Este departamento no tiene coordinador asignado.'}
              </p>
            )}
          </div>

          {isEditing && existing ? (
            <div className="field">
              <span className="field-label">Archivo</span>
              <p className="field-help" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {existing.file_name} · {formatBytes(existing.file_size)} · subido por {existing.uploaded_by_name ?? 'usuario eliminado'} el{' '}
                {new Date(existing.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          ) : (
            <FilePicker
              id="aval-file"
              label="Archivo del aval"
              file={file}
              onChange={handleFileChange}
              accept={ACCEPT}
              isAllowedType={isDocumentMimeAllowed}
              maxBytes={MAX_FILE_BYTES}
              formatsLabel="PDF, Word, Excel o foto (JPG, PNG, WEBP, HEIC)"
              allowCamera
              disabled={submitting}
            />
          )}

          <div className="field">
            <label htmlFor="title">Título</label>
            <input
              id="title"
              required
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: Aval curso de Incendios Estructurales 2026"
            />
            {!isEditing && <p className="field-help">Si elegís el archivo primero, lo completamos con su nombre. Podés cambiarlo.</p>}
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" rows={3} maxLength={TEXT_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" rows={2} maxLength={TEXT_MAX} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? (isEditing ? 'Guardando…' : 'Subiendo archivo…') : isEditing ? 'Guardar cambios' : 'Subir aval'}
          </button>

          {!isEditing && (
            <p className="field-help" style={{ marginTop: 10, textAlign: 'center' }}>
              Una vez subido, solo Informática puede editar sus datos, archivarlo o eliminarlo.
            </p>
          )}
        </form>
      )}
    </AppShell>
  )
}
