import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { FilePicker } from '../components/ui/FilePicker'
import {
  fetchAvalesDepartments,
  fetchSchoolAvalDocumentById,
  findSchoolAvalToRenew,
  updateSchoolAvalDocument,
  uploadSchoolAvalDocument,
} from '../lib/api/schoolAvales'
import { isDocumentMimeAllowed } from '../lib/api/storage'
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { isEditConflict } from '../lib/concurrency'
import type { RowSnapshot } from '../lib/concurrency'
import { formatBytes } from '../lib/format'
import { useFormDraft } from '../hooks/useFormDraft'
import { DraftRecoveryBanner, DraftStatusLine } from '../components/FormDraftUi'
import type { AvalesDepartment, SchoolAvalDocument } from '../types/database'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const TITLE_MAX = 200
const TEXT_MAX = 2000
const NAME_MAX = 200
const ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

interface AvalDraft {
  departmentId: string
  title: string
  description: string
  observations: string
  year?: number
  forOther?: boolean
  personName?: string
}

// Años que se ofrecen: el próximo, el actual y los tres anteriores.
function yearOptions(): number[] {
  const current = new Date().getFullYear()
  return [current + 1, current, current - 1, current - 2, current - 3]
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Alta de un aval: cada persona con un rol que carga sube el SUYO en cualquier departamento activo;
// la autoridad del departamento puede cargar además el de otra persona (escribiendo su nombre).
// Hay un solo aval vigente por persona y departamento: si ya existe, se propone renovarlo. Edición
// de los datos (no del archivo): solo la autoridad del departamento. El archivo se cambia
// renovando (AvalRenovarPage).
export function AvalFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [departments, setDepartments] = useState<AvalesDepartment[]>([])
  const [existing, setExisting] = useState<SchoolAvalDocument | null>(null)
  const [departmentId, setDepartmentId] = useState('')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [observations, setObservations] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [forOther, setForOther] = useState(false)
  const [personName, setPersonName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Aval vigente de la misma persona en el departamento elegido (propone renovar en vez de duplicar).
  const [duplicate, setDuplicate] = useState<SchoolAvalDocument | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Si otra persona cambió el aval mientras se editaba: lo que se intentó guardar.
  const [conflict, setConflict] = useState<{ mine: Record<string, unknown> } | null>(null)

  const draftValue = useMemo<AvalDraft>(
    () => ({ departmentId, title, description, observations, year, forOther, personName }),
    [departmentId, title, description, observations, year, forOther, personName],
  )
  // Borrador en el servidor (0113): solo en el alta. El archivo no es parte del borrador.
  const draft = useFormDraft<AvalDraft>({
    formKey: 'aval-escuela',
    contextKey: 'nuevo',
    value: draftValue,
    enabled: !isEditing && !loading && !loadError,
  })

  function applyDraft(d: AvalDraft) {
    if (d.departmentId && departments.some((x) => x.id === d.departmentId && x.is_active)) setDepartmentId(d.departmentId)
    setTitle(d.title ?? '')
    setTitleTouched(Boolean(d.title))
    setDescription(d.description ?? '')
    setObservations(d.observations ?? '')
    if (typeof d.year === 'number' && yearOptions().includes(d.year)) setYear(d.year)
    setForOther(Boolean(d.forOther))
    setPersonName(d.personName ?? '')
  }

  useEffect(() => {
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
          setTitleTouched(true)
          setDescription(doc.description ?? '')
          setObservations(doc.observations ?? '')
          setYear(doc.reference_year ?? new Date(doc.created_at).getFullYear())
          setPersonName(doc.person_name ?? '')
          return
        }
        const activeDepartments = departmentsData.filter((d) => d.is_active)
        const fromQuery = activeDepartments.find((d) => d.id === searchParams.get('departamento'))
        const mine = activeDepartments.filter((d) => d.is_my_department)
        setDepartmentId(fromQuery?.id ?? (activeDepartments.length === 1 ? activeDepartments[0].id : mine.length === 1 ? mine[0].id : ''))
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los departamentos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, searchParams])

  const selectedDepartment = departments.find((d) => d.id === departmentId)
  // Al crear, solo departamentos activos (los únicos donde la base deja cargar). Al editar, los que la
  // persona administra, incluido el actual aunque esté inactivo.
  const departmentOptions = isEditing
    ? departments.filter((d) => d.can_manage || d.id === existing?.department_id)
    : departments.filter((d) => d.is_active)
  // Editar los datos es de la autoridad del departamento del aval.
  const currentDepartment = existing ? departments.find((d) => d.id === existing.department_id) : undefined
  const blockedEdit = isEditing && !loading && !notFound && !loadError && currentDepartment?.can_manage !== true
  const canChooseOther = !isEditing && selectedDepartment?.can_manage === true
  const backHref = departmentId ? `/escuela/avales?departamento=${departmentId}` : '/escuela/avales'
  // Los avales cargados a nombre de otra persona (sin usuario asociado) permiten corregir su nombre.
  const nameEditable = isEditing && existing != null && existing.person_profile_id === null

  // La autoridad deja de ver la opción "otra persona" si cambia a un departamento que no administra.
  useEffect(() => {
    if (forOther && !canChooseOther) setForOther(false)
  }, [forOther, canChooseOther])

  // Título sugerido mientras no lo toquen: "Aval <departamento> <año>" (+ nombre si es de otra persona).
  useEffect(() => {
    if (isEditing || titleTouched || !selectedDepartment) return
    const base = `Aval ${selectedDepartment.name} ${year}`
    const name = forOther ? personName.trim() : ''
    setTitle((name ? `${base} · ${name}` : base).slice(0, TITLE_MAX))
  }, [isEditing, titleTouched, selectedDepartment, year, forOther, personName])

  // ¿Ya existe un aval vigente de esa persona en el departamento? Propone renovar.
  useEffect(() => {
    if (isEditing || !departmentId || (forOther && !personName.trim())) {
      setDuplicate(null)
      return
    }
    let active = true
    const timer = window.setTimeout(
      () => {
        findSchoolAvalToRenew(departmentId, forOther ? personName : null)
          .then((found) => active && setDuplicate(found))
          .catch(() => active && setDuplicate(null))
      },
      forOther ? 350 : 0,
    )
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isEditing, departmentId, forOther, personName])

  function handleFileChange(selected: File | null) {
    setFile(selected)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const cleanTitle = title.trim()
    const cleanName = personName.trim()
    if (!departmentId) return setError('Elegí el departamento donde va el aval.')
    if (!isEditing && duplicate) return setError('Ya hay un aval vigente de esta persona en este departamento: renovalo en lugar de cargar otro.')
    if (!isEditing && !file) return setError('Falta el archivo: tocá "Elegir archivo" (o "Sacar foto" desde el celular).')
    if (!cleanTitle) return setError('Escribí un título para reconocer el aval en el listado.')
    if (cleanTitle.length > TITLE_MAX) return setError(`El título no puede superar los ${TITLE_MAX} caracteres.`)
    if (!isEditing && forOther && !cleanName) return setError('Escribí el nombre de la persona a la que corresponde el aval.')
    if (cleanName.length > NAME_MAX) return setError(`El nombre no puede superar los ${NAME_MAX} caracteres.`)
    if (description.length > TEXT_MAX || observations.length > TEXT_MAX) {
      return setError(`La descripción y las observaciones no pueden superar los ${TEXT_MAX} caracteres.`)
    }

    setSubmitting(true)
    let attempted: Record<string, unknown> | null = null
    try {
      const target = `/escuela/avales?departamento=${departmentId}`
      if (isEditing && id) {
        const input = {
          title: cleanTitle,
          description: description.trim() || null,
          observations: observations.trim() || null,
          department_id: departmentId,
          reference_year: year,
          ...(nameEditable ? { person_name: cleanName || null } : {}),
        }
        attempted = input
        await updateSchoolAvalDocument(id, input, existing?.row_version)
        navigate(target, { state: { notice: 'Los datos del aval se guardaron.' } })
      } else if (file) {
        await uploadSchoolAvalDocument({
          departmentId,
          title: cleanTitle,
          description: description.trim() || null,
          observations: observations.trim() || null,
          referenceYear: year,
          personName: forOther ? cleanName : null,
          file,
        })
        void draft.resolve()
        navigate(target, {
          state: {
            notice: forOther
              ? `"${cleanTitle}" se subió correctamente.`
              : 'Tu aval se subió correctamente. Se mantiene vigente hasta que sea actualizado o eliminado por una autoridad habilitada; la revisión queda a cargo de la autoridad del área.',
          },
        })
      }
    } catch (err) {
      if (isEditing && attempted && isEditConflict(err)) {
        setConflict({ mine: attempted })
        return
      }
      // Otra pantalla (o una carga anterior) ya dejó un aval vigente de esa persona: se propone renovarlo.
      if (!isEditing && postgrestCode(err) === '23505') {
        try {
          setDuplicate(await findSchoolAvalToRenew(departmentId, forOther ? personName : null))
        } catch {
          // Si no se puede consultar, el mensaje de abajo alcanza.
        }
      }
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
          <p style={{ marginBottom: 12 }}>
            Los datos de un aval ya cargado los edita la autoridad del área (Informática R4, el Coordinador de Escuela o el coordinador del departamento).
            {existing && existing.is_archived === false && ' Si es el tuyo, podés renovarlo para reemplazar el archivo.'}
          </p>
          {existing && !existing.is_archived && (
            <Link to={`/escuela/avales/${existing.id}/renovar`} className="btn btn-primary" style={{ marginRight: 8 }}>
              Renovar aval
            </Link>
          )}
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
          ? 'Cambiá los datos del aval. El archivo ya cargado se reemplaza renovando el aval.'
          : 'Elegí el departamento, el archivo (o sacale una foto) y el año. Funciona desde la computadora o el celular.'}
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
          <p style={{ marginBottom: 12 }}>No encontramos ese aval. Puede haber sido eliminado, o no tenés permiso para verlo.</p>
          <Link to="/escuela/avales" className="btn btn-outlined">
            Volver a Avales
          </Link>
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length === 0 && (
        <div className="empty-state">
          No hay departamentos activos donde puedas subir avales. Si deberías tenerlos, consultá a Informática y Estadística para que revisen
          la sección Departamentos.
        </div>
      )}

      {!loading && !loadError && !notFound && departmentOptions.length > 0 && (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          <DraftRecoveryBanner draft={draft} subject="un aval" onApply={applyDraft} />

          {!isEditing && (
            <p className="field-help aval-keep-note">
              Podés cargar tu aval, pero la revisión queda a cargo de la autoridad del área. Este aval se mantiene vigente hasta que sea
              actualizado o eliminado por una autoridad habilitada.
            </p>
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
            {selectedDepartment?.can_manage && (
              <p className="field-help">
                {selectedDepartment.coordinator_name
                  ? `Coordinador: ${selectedDepartment.coordinator_name}${selectedDepartment.is_my_department ? ' (vos)' : ''}.`
                  : 'Este departamento no tiene coordinador asignado.'}
              </p>
            )}
          </div>

          {canChooseOther && (
            <fieldset className="field aval-owner-choice">
              <legend className="field-label">¿De quién es el aval?</legend>
              <label className="check-row">
                <input type="radio" name="aval-owner" checked={!forOther} onChange={() => setForOther(false)} />
                Mío
              </label>
              <label className="check-row">
                <input type="radio" name="aval-owner" checked={forOther} onChange={() => setForOther(true)} />
                De otra persona (lo cargo yo)
              </label>
              {forOther && (
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="person-name">Nombre de la persona</label>
                  <input
                    id="person-name"
                    maxLength={NAME_MAX}
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="Ej.: Juan Pérez"
                    autoComplete="off"
                  />
                  <p className="field-help">Si hay dos personas con el mismo nombre en el departamento, sumá el cuartel: Juan Pérez (Villa del Rosario).</p>
                </div>
              )}
            </fieldset>
          )}

          {!isEditing && duplicate && (
            <div className="alert alert-warning aval-duplicate" role="alert">
              <div className="alert-content">
                <strong>
                  {forOther ? `${personName.trim()} ya tiene` : 'Ya tenés'} un aval vigente en {selectedDepartment?.name ?? 'este departamento'}.
                </strong>
                <p className="draft-recovery-text">
                  {duplicate.title} · año {duplicate.reference_year ?? new Date(duplicate.created_at).getFullYear()} · {duplicate.file_name} (cargado el{' '}
                  {formatDateTime(duplicate.created_at)}). En lugar de cargar otro, renovalo: se reemplaza el archivo del mismo aval y no se
                  acumulan versiones viejas.
                </p>
                <Link to={`/escuela/avales/${duplicate.id}/renovar`} className="btn btn-primary btn-sm">
                  Renovar el aval vigente
                </Link>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="year">Año del aval</label>
            <select id="year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              {!yearOptions().includes(year) && <option value={year}>{year}</option>}
            </select>
            <p className="field-help">Es el año al que corresponde. No vence: el aval sigue vigente hasta que se renueve o lo elimine una autoridad.</p>
          </div>

          {isEditing && existing ? (
            <div className="field">
              <span className="field-label">Archivo</span>
              <p className="field-help" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {existing.file_name} · {formatBytes(existing.file_size)} · subido por {existing.uploaded_by_name ?? 'usuario eliminado'} el{' '}
                {formatDateTime(existing.created_at)}
                {existing.renewed_at && ` · renovado por ${existing.renewed_by_name ?? 'usuario eliminado'} el ${formatDateTime(existing.renewed_at)}`}
              </p>
              {!existing.is_archived && (
                <Link to={`/escuela/avales/${existing.id}/renovar`} className="btn btn-outlined btn-sm">
                  Renovar (reemplazar el archivo)
                </Link>
              )}
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

          {nameEditable && (
            <div className="field">
              <label htmlFor="person-name-edit">Nombre de la persona del aval</label>
              <input id="person-name-edit" maxLength={NAME_MAX} value={personName} onChange={(e) => setPersonName(e.target.value)} autoComplete="off" />
              <p className="field-help">Este aval se cargó sin un usuario asociado: acá podés corregir el nombre.</p>
            </div>
          )}

          <div className="field">
            <label htmlFor="title">Título</label>
            <input
              id="title"
              required
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              placeholder="Ej.: Aval Fuego 2026"
            />
            {!isEditing && <p className="field-help">Se completa solo con el departamento y el año. Podés cambiarlo.</p>}
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

          <DraftStatusLine draft={draft} isNew onApply={applyDraft} />

          {conflict && existing && id && (
            <EditConflictPanel
              table="school_avales_documents"
              recordId={id}
              base={existing as unknown as RowSnapshot}
              mine={conflict.mine}
              onSave={(patch, version) => updateSchoolAvalDocument(id, patch as unknown as Parameters<typeof updateSchoolAvalDocument>[1], version)}
              onResolved={() => navigate(`/escuela/avales?departamento=${departmentId}`, { state: { notice: 'Los datos del aval se guardaron.' } })}
              onDiscard={() => window.location.reload()}
              onClose={() => setConflict(null)}
            />
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || (!isEditing && Boolean(duplicate))}>
            {submitting ? (isEditing ? 'Guardando…' : 'Subiendo archivo…') : isEditing ? 'Guardar cambios' : 'Subir aval'}
          </button>

          {!isEditing && (
            <p className="field-help" style={{ marginTop: 10, textAlign: 'center' }}>
              Una vez subido, solo vos y la autoridad del área pueden verlo. Para cambiarlo, renovalo; archivarlo o eliminarlo lo hace la autoridad del área.
            </p>
          )}
        </form>
      )}
    </AppShell>
  )
}
