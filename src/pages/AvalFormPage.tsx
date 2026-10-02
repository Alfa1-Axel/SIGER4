import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import {
  fetchAvalesDepartments,
  fetchSchoolAvalDocumentById,
  updateSchoolAvalDocument,
  uploadSchoolAvalDocument,
} from '../lib/api/schoolAvales'
import { inferMimeType, isDocumentMimeAllowed } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { formatBytes } from '../lib/format'
import { isMobileUserAgent } from '../lib/device'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { Department, SchoolAvalDocument } from '../types/database'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const TITLE_MAX = 200
const TEXT_MAX = 2000

// Alta de un aval (cualquier rol con acceso, solo en departamentos activos
// que puede ver) y edición de metadata (solo informatica_r4). El archivo de
// un aval ya cargado no se reemplaza: editar es cambiar título, descripción,
// observaciones o departamento.
//
// La carga de archivos queda solo para escritorio, igual que en Documentos
// (decisión de producto vigente, ver DEPLOYMENT.md sección 21): en ciertos
// Android el selector de archivos no es confiable dentro de React. Ver y
// descargar sí funciona en el celular.
export function AvalFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canManage } = useSchoolAvalesAccess()

  const [departments, setDepartments] = useState<Department[]>([])
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

  const blockedOnMobile = !isEditing && isMobileUserAgent()
  const blockedEdit = isEditing && !canManage

  useEffect(() => {
    if (blockedOnMobile || blockedEdit) {
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
        } else {
          const fromQuery = departmentsData.find((d) => d.id === searchParams.get('departamento') && d.is_active)
          const activeDepartments = departmentsData.filter((d) => d.is_active)
          setDepartmentId(fromQuery?.id ?? (activeDepartments.length === 1 ? activeDepartments[0].id : ''))
        }
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los datos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, blockedOnMobile, blockedEdit, searchParams])

  // Al crear, solo departamentos activos (los únicos donde la base deja
  // cargar). Al editar (admin), todos, incluido el actual aunque esté inactivo.
  const departmentOptions = isEditing ? departments : departments.filter((d) => d.is_active)
  const backHref = departmentId ? `/escuela/avales?departamento=${departmentId}` : '/escuela/avales'

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!selected) return
    const mime = inferMimeType(selected)
    if (!isDocumentMimeAllowed(mime)) {
      setFile(null)
      setError(`Tipo de archivo no permitido (${selected.name}). Formatos aceptados: PDF, Word, Excel, PNG, JPG, WEBP, HEIC.`)
      return
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null)
      setError('El archivo supera el tamaño máximo permitido (20 MB).')
      return
    }
    setError(null)
    setFile(selected)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const cleanTitle = title.trim()
    if (!departmentId) return setError('Elegí el departamento.')
    if (!cleanTitle) return setError('Ingresá un título para el documento.')
    if (cleanTitle.length > TITLE_MAX) return setError(`El título no puede superar los ${TITLE_MAX} caracteres.`)
    if (description.length > TEXT_MAX || observations.length > TEXT_MAX) {
      return setError(`La descripción y las observaciones no pueden superar los ${TEXT_MAX} caracteres.`)
    }
    if (!isEditing && !file) return setError('Elegí el archivo del aval.')

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
        navigate(target, { state: { notice: 'Los datos del documento se actualizaron.' } })
      } else if (file) {
        await uploadSchoolAvalDocument({
          departmentId,
          title: cleanTitle,
          description: description.trim() || null,
          observations: observations.trim() || null,
          file,
        })
        navigate(target, { state: { notice: `"${cleanTitle}" se cargó correctamente.` } })
      }
    } catch (err) {
      setError(describeSupabaseError(err, isEditing ? 'No pudimos guardar los cambios.' : 'No pudimos cargar el documento.'))
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEditing ? 'Editar datos del aval' : 'Cargar aval'

  if (blockedEdit) {
    return (
      <AppShell title={pageTitle}>
        <EscuelaHeader />
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>Solo Informática R4 puede editar los datos de un aval ya cargado.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      </AppShell>
    )
  }

  if (blockedOnMobile) {
    return (
      <AppShell title={pageTitle}>
        <EscuelaHeader />
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>
            La carga de documentos está disponible solo desde PC. Desde el celular podés ver y descargar los avales.
          </p>
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
          ? 'Solo se edita la información del documento. El archivo cargado no se reemplaza.'
          : 'El documento queda guardado en el departamento que elijas.'}
      </p>

      {loading && <div className="loading-state" role="status">Cargando…</div>}

      {!loading && loadError && <div className="empty-state field-error">{loadError}</div>}

      {!loading && !loadError && notFound && (
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>No se encontró el documento, o no tenés permiso para verlo.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length === 0 && (
        <div className="empty-state">
          No tenés departamentos activos donde cargar avales. Si deberías tenerlos, pedile a Informática R4 que revise tu
          asignación.
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length > 0 && (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          <div className="field">
            <label htmlFor="department">Departamento</label>
            <select id="department" required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Seleccionar departamento</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                  {!department.is_active ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">Título</label>
            <input
              id="title"
              required
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aval curso de Incendios Estructurales 2026"
            />
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" rows={3} maxLength={TEXT_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" rows={2} maxLength={TEXT_MAX} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>

          {isEditing && existing ? (
            <div className="field">
              <label>Archivo</label>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, overflowWrap: 'anywhere' }}>
                {existing.file_name} · {formatBytes(existing.file_size)} · cargado por {existing.uploaded_by_name ?? 'usuario eliminado'} el{' '}
                {new Date(existing.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="file">Archivo</label>
              <input id="file" type="file" onChange={handleFileChange} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.heic,.heif" />
              {file ? (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, overflowWrap: 'anywhere' }}>
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>PDF, Word, Excel o imagen. Máximo 20 MB.</p>
              )}
            </div>
          )}

          {!isEditing && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 12 }}>
              Una vez cargado, solo Informática R4 puede editar sus datos, archivarlo o eliminarlo.
            </p>
          )}

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? (isEditing ? 'Guardando…' : 'Cargando…') : isEditing ? 'Guardar cambios' : 'Cargar documento'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
