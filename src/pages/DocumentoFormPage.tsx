import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { addDocumentVersion, createDocument, fetchDocumentById, fetchDocumentVersions, updateDocument, updateDocumentStoragePath } from '../lib/api/documents'
import { isDocumentMimeAllowed, uploadDocumentFile } from '../lib/api/storage'
import { DOCUMENT_SCOPE_LABEL, DOCUMENT_VISIBILITY_LABEL, canManageDocument, canPublishToAll, documentScopeKind, visibilityHelp } from '../lib/documentAccess'
import type { DocumentScopeKind } from '../lib/documentAccess'
import { FilePicker } from '../components/ui/FilePicker'
import { AccessDenied } from '../components/ui/AccessDenied'
import { useSessionDraft } from '../hooks/useSessionDraft'
import type { DocumentRecord, DocumentVersion, DocumentVisibility, Profile, Region, Station, Subsede, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useDocumentAccess } from '../hooks/useDocumentAccess'
import { describeSupabaseError } from '../lib/api/errors'

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const DOCUMENT_ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

interface DocumentDraft {
  title: string
  category: string
  description: string
}

// Alta y edición de documentos, desde escritorio o celular. El archivo se
// elige con FilePicker (archivo o foto). Si Android recarga la app mientras
// el selector está abierto, el borrador de sessionStorage conserva título,
// tipo y descripción (ver useSessionDraft / DEPLOYMENT.md sección 56).
//
// Dos preguntas, sin términos técnicos:
//   - ¿Dónde va? (el alcance: Regional, subsede, cuartel, departamento o una
//     persona). Define de quién es y quién lo administra.
//   - ¿Quién lo puede ver? (la visibilidad): solo ese alcance, todos (solo
//     Informática y el Secretario Regional) o restringido.
export function DocumentoFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderIdFromQuery = searchParams.get('folderId')
  const departmentFromQuery = searchParams.get('departamento')
  const visibilityFromQuery = searchParams.get('visibilidad')
  const { profile: currentProfile, scopes, isAdmin, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'usuario_carga_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const isRegionalRole = hasRole('secretario_regional')
  const hasDepartments = coordinatedDepartmentIds.length + memberDepartmentIds.length > 0
  const canCreate = isAdmin || isRegionalRole || isStationRole || hasDepartments
  // Quien tiene alcance amplio (Informática, Secretario Regional) elige entre
  // todos los alcances; un rol de cuartel solo su propio cuartel; quien trabaja
  // en un departamento, su departamento. La base lo vuelve a exigir.
  const broad = isAdmin || isRegionalRole
  // documents_write_admin_regional_station (migración 0047): un rol de
  // cuartel SOLO puede escribir con station_id = su propio cuartel (nunca
  // region/subsede/usuario); secretario_regional solo dentro de su región.
  const myStationId = currentProfile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''
  const myRegionId = currentProfile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? ''
  const stationLocked = isStationRole && !broad
  const regionLocked = isRegionalRole && !isAdmin

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [lookupsReady, setLookupsReady] = useState(false)
  const access = useDocumentAccess(stations, subsedes)
  const canPublish = canPublishToAll(access)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const initialScope: DocumentScopeKind = departmentFromQuery ? 'department' : broad ? 'region' : isStationRole ? 'station' : 'department'
  const [scopeTarget, setScopeTarget] = useState<DocumentScopeKind>(initialScope)
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState(stationLocked ? myStationId : '')
  const [profileId, setProfileId] = useState('')
  const [departmentId, setDepartmentId] = useState(departmentFromQuery ?? '')
  const [visibility, setVisibility] = useState<DocumentVisibility>(visibilityFromQuery === 'todos' && canPublish ? 'todos' : 'alcance')

  // Departamentos donde la persona puede cargar: los suyos (Informática, todos)
  // y activos.
  const writableDepartments = departments.filter((d) => d.is_active && (isAdmin || Boolean(d.my_relation)))
  const scopeOptions: DocumentScopeKind[] = [
    ...(broad ? (['region', 'subsede'] as DocumentScopeKind[]) : []),
    ...(broad || isStationRole ? (['station'] as DocumentScopeKind[]) : []),
    ...(writableDepartments.length > 0 || (!broad && hasDepartments) ? (['department'] as DocumentScopeKind[]) : []),
    ...(broad ? (['profile'] as DocumentScopeKind[]) : []),
  ]

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const draftValue = useMemo<DocumentDraft>(() => ({ title, category, description }), [title, category, description])
  const { readDraft, clearDraft } = useSessionDraft<DocumentDraft>(
    `documento-nuevo:${folderIdFromQuery ?? departmentFromQuery ?? 'general'}`,
    draftValue,
    !isEditing,
  )
  const [restoredDraft, setRestoredDraft] = useState(false)

  useEffect(() => {
    if (isEditing) return
    const draft = readDraft()
    if (draft && (draft.title || draft.category || draft.description)) {
      setTitle(draft.title)
      setCategory(draft.category)
      setDescription(draft.description)
      setRestoredDraft(true)
    }
  }, [isEditing, readDraft])
  const [existing, setExisting] = useState<DocumentRecord | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles().catch(() => [] as Profile[]), fetchVisibleDepartments().catch(() => [] as VisibleDepartment[])]).then(
      ([regionsData, subsedesData, stationsData, profilesData, departmentsData]) => {
        if (!active) return
        if (stationLocked) {
          setStations(stationsData.filter((s) => s.id === myStationId))
        } else if (regionLocked) {
          setRegions(regionsData.filter((r) => r.id === myRegionId))
          setSubsedes(subsedesData.filter((s) => s.region_id === myRegionId))
          setStations(stationsData.filter((s) => s.region_id === myRegionId))
          setRegionId((prev) => prev || myRegionId)
        } else {
          setRegions(regionsData)
          setSubsedes(subsedesData)
          setStations(stationsData)
          setRegionId((prev) => prev || regionsData[0]?.id || '')
        }
        setProfiles(profilesData)
        setDepartments(departmentsData)
        setLookupsReady(true)
      },
    )
    return () => {
      active = false
    }
  }, [canCreate, stationLocked, regionLocked, myStationId, myRegionId])

  // Un solo departamento para elegir: ya queda elegido.
  useEffect(() => {
    if (isEditing || departmentId || writableDepartments.length !== 1) return
    setDepartmentId(writableDepartments[0].id)
  }, [isEditing, departmentId, writableDepartments])

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchDocumentById(id), fetchDocumentVersions(id).catch(() => [] as DocumentVersion[])]).then(([doc, docVersions]) => {
      if (!active) return
      if (!doc) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setTitle(doc.title)
      setCategory(doc.category)
      setDescription(doc.description ?? '')
      setExisting(doc)
      setVersions(docVersions)
      setVisibility(doc.visibility)
      const kind = documentScopeKind(doc)
      setScopeTarget(kind)
      if (kind === 'department') setDepartmentId(doc.department_id ?? '')
      else if (kind === 'profile') setProfileId(doc.profile_id ?? '')
      else if (kind === 'subsede') setSubsedeId(doc.subsede_id ?? '')
      else if (kind === 'station') setStationId(doc.station_id ?? '')
      else setRegionId(doc.region_id ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  if (!canCreate) {
    return (
      <AppShell title="Documentos">
        <AccessDenied
          title="No podés cargar documentos"
          message="Cargar documentos es de Informática, el Secretario Regional, los roles de cuartel (para su cuartel) y los coordinadores e integrantes de un departamento (para su departamento). Podés ver y descargar lo que está a tu alcance."
          backTo="/documentos"
          backLabel="Volver a Documentos"
        />
      </AppShell>
    )
  }

  if (isEditing && !loading && (notFound || !existing)) {
    return (
      <AppShell title="Documentos">
        <AccessDenied
          title="No encontramos el documento"
          message="Puede que lo hayan eliminado o que no tengas acceso. Los documentos los ve quien está dentro de su alcance, y los restringidos, solo quien los carga y quienes los administran."
          backTo="/documentos"
          backLabel="Volver a Documentos"
        />
      </AppShell>
    )
  }

  if (isEditing && existing && lookupsReady && !canManageDocument(existing, access)) {
    return (
      <AppShell title="Documentos">
        <AccessDenied
          title="No podés editar este documento"
          message="Lo editan quien lo cargó (si es de un departamento), el coordinador del departamento, los roles de carga del cuartel, el Secretario Regional e Informática y Estadística."
          backTo="/documentos"
          backLabel="Volver a Documentos"
        />
      </AppShell>
    )
  }

  function currentScopeInput() {
    return {
      region_id: scopeTarget === 'region' ? regionId : null,
      subsede_id: scopeTarget === 'subsede' ? subsedeId : null,
      station_id: scopeTarget === 'station' ? stationId : null,
      profile_id: scopeTarget === 'profile' ? profileId : null,
      department_id: scopeTarget === 'department' ? departmentId : null,
    }
  }

  function scopeIsReady(): boolean {
    if (scopeTarget === 'region') return Boolean(regionId)
    if (scopeTarget === 'subsede') return Boolean(subsedeId)
    if (scopeTarget === 'station') return Boolean(stationId)
    if (scopeTarget === 'department') return Boolean(departmentId)
    return Boolean(profileId)
  }

  // Nombre del alcance elegido, para explicar quién lo va a ver.
  const scopeName =
    scopeTarget === 'department'
      ? departments.find((d) => d.id === departmentId)?.name
      : scopeTarget === 'station'
        ? stations.find((s) => s.id === stationId)?.name
        : scopeTarget === 'subsede'
          ? subsedes.find((s) => s.id === subsedeId)?.name
          : undefined

  // Un documento para una persona puntual solo lo ve esa persona: no se publica
  // ni se restringe. "Visible para todos" solo lo ofrecen quienes pueden publicar
  // (o, si el documento ya estaba publicado, se muestra tal cual).
  const alreadyPublished = existing?.visibility === 'todos'
  const visibilityOptions: DocumentVisibility[] =
    scopeTarget === 'profile' ? ['alcance'] : [...(canPublish || alreadyPublished ? (['todos'] as DocumentVisibility[]) : []), 'alcance', 'restringido']
  const effectiveVisibility: DocumentVisibility = scopeTarget === 'profile' ? 'alcance' : visibility

  function handleScopeChange(next: DocumentScopeKind) {
    setScopeTarget(next)
    if (next === 'profile') setVisibility('alcance')
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file)
    setError(null)
    if (file && !title.trim()) {
      setTitle(
        file.name
          .replace(/\.[a-zA-Z0-9]{1,10}$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .slice(0, 200),
      )
    }
  }

  function handleDiscardDraft() {
    clearDraft()
    setTitle('')
    setCategory('')
    setDescription('')
    setRestoredDraft(false)
  }

  // Adónde se vuelve después de guardar: al espacio donde queda el documento.
  function spaceAfterSave(folderId: string | null): string {
    if (scopeTarget === 'department' && departmentId) return `/documentos/departamentos/${departmentId}`
    if (folderId) return `/documentos/carpetas/${folderId}`
    return effectiveVisibility === 'todos' ? '/documentos/carpetas/general' : '/documentos/carpetas/sin-carpeta'
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isEditing && !selectedFile) return setError('Falta el archivo: tocá "Elegir archivo" (o "Sacar foto" desde el celular).')
    if (!title.trim()) return setError('Escribí un título para reconocer el documento en el listado.')
    if (!category.trim()) return setError('Indicá el tipo de documento (por ejemplo: Circular, Acta, Manual).')
    if (!scopeIsReady()) {
      return setError(
        scopeTarget === 'department'
          ? 'Elegí el departamento al que pertenece el documento.'
          : 'Elegí dónde va el documento: Regional, subsede, cuartel, departamento o una persona.',
      )
    }
    if (effectiveVisibility === 'todos' && !canPublish && !alreadyPublished) {
      return setError('Solo Informática y el Secretario Regional pueden publicar un documento para todos.')
    }

    setSubmitting(true)
    try {
      const input = {
        title: title.trim(),
        category: category.trim(),
        description: description || null,
        visibility: effectiveVisibility,
        ...currentScopeInput(),
      }

      if (isEditing && id && existing) {
        await updateDocument(id, input)
        if (selectedFile) {
          if (existing.storage_path && existing.storage_path !== 'pending') {
            await addDocumentVersion(id, existing.storage_path, currentProfile?.id ?? null)
          }
          const path = await uploadDocumentFile(id, selectedFile)
          await updateDocumentStoragePath(id, path)
        }
        navigate(spaceAfterSave(scopeTarget === 'department' ? null : existing.folder_id), {
          state: { notice: selectedFile ? 'Se guardaron los cambios y el archivo nuevo.' : 'Se guardaron los cambios.' },
        })
      } else {
        // Un documento de departamento va en el espacio del departamento, no en una carpeta.
        const folderId = scopeTarget === 'department' ? null : folderIdFromQuery || null
        const created = await createDocument({
          ...input,
          folder_id: folderId,
          uploaded_by_profile_id: currentProfile?.id ?? null,
        })
        const path = await uploadDocumentFile(created.id, selectedFile!)
        await updateDocumentStoragePath(created.id, path)
        clearDraft()
        navigate(spaceAfterSave(folderId), { state: { notice: `"${title.trim()}" se subió correctamente.` } })
      }
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el documento. Reintentá en unos segundos.'))
    } finally {
      setSubmitting(false)
    }
  }

  // Alta: el archivo va primero (el título se completa con su nombre).
  // Edición: va al final, como reemplazo opcional.
  const fileField = (
    <>
      <FilePicker
        id="documento-file"
        label={isEditing ? 'Reemplazar archivo (opcional)' : 'Archivo'}
        file={selectedFile}
        onChange={handleFileChange}
        accept={DOCUMENT_ACCEPT}
        isAllowedType={isDocumentMimeAllowed}
        maxBytes={MAX_DOCUMENT_BYTES}
        formatsLabel="PDF, Word, Excel o foto (JPG, PNG, WEBP, HEIC)"
        allowCamera
        disabled={submitting}
      />
      {isEditing && !selectedFile && existing?.storage_path && existing.storage_path !== 'pending' && (
        <p className="field-help" style={{ marginTop: -8, marginBottom: 16 }}>
          Ya tiene un archivo. Elegí uno nuevo solo si querés reemplazarlo: el actual queda en el historial de versiones.
        </p>
      )}
    </>
  )

  const backTo = isEditing
    ? existing?.department_id
      ? `/documentos/departamentos/${existing.department_id}`
      : existing?.folder_id
        ? `/documentos/carpetas/${existing.folder_id}`
        : '/documentos'
    : departmentFromQuery
      ? `/documentos/departamentos/${departmentFromQuery}`
      : folderIdFromQuery
        ? `/documentos/carpetas/${folderIdFromQuery}`
        : '/documentos'

  return (
    <AppShell title={isEditing ? 'Editar documento' : 'Subir documento'}>
      <Link to={backTo} className="back-link">
        ← Volver a Documentos
      </Link>
      <h1 className="page-title">{isEditing ? 'Editar documento' : 'Subir documento'}</h1>
      <p className="page-subtitle">
        {isEditing
          ? 'Cambiá los datos del documento o subí una versión nueva del archivo.'
          : 'Elegí el archivo (o sacale una foto), ponele un título y elegí dónde va y quién lo puede ver. Funciona desde la computadora o el celular.'}
      </p>

      {loading ? (
        <div className="loading-state" role="status">Cargando datos del documento…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          {restoredDraft && (
            <div className="alert alert-info" role="status">
              <span className="alert-content">Recuperamos los datos que habías escrito. Revisalos y elegí el archivo.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleDiscardDraft} style={{ color: 'inherit' }}>
                Empezar de cero
              </button>
            </div>
          )}
          {!isEditing && fileField}

          <div className="field">
            <label htmlFor="title">Título</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular N°12" />
          </div>

          <div className="field">
            <label htmlFor="category">Tipo de documento</label>
            <input id="category" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Circular, Acta, Manual..." />
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label>¿Dónde va?</label>
            {scopeOptions.length <= 1 && scopeTarget === 'station' ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Este documento va a quedar dentro de tu propio cuartel.</p>
            ) : (
              <>
                {scopeOptions.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {scopeOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleScopeChange(option)}
                        className="chip"
                        aria-pressed={scopeTarget === option}
                      >
                        {DOCUMENT_SCOPE_LABEL[option]}
                      </button>
                    ))}
                  </div>
                )}

                {scopeTarget === 'region' && (
                  <select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Regional">
                    <option value="">Seleccionar Regional</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'subsede' && (
                  <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)} aria-label="Subsede">
                    <option value="">Seleccionar subsede</option>
                    {subsedes.map((subsede) => (
                      <option key={subsede.id} value={subsede.id}>
                        {subsede.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'station' && !stationLocked && (
                  <select value={stationId} onChange={(e) => setStationId(e.target.value)} aria-label="Cuartel">
                    <option value="">Seleccionar cuartel</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                )}
                {scopeTarget === 'station' && stationLocked && (
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Este documento va a quedar dentro de tu propio cuartel.</p>
                )}

                {scopeTarget === 'department' && (
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Departamento">
                    <option value="">Seleccionar departamento</option>
                    {(isEditing && departmentId && !writableDepartments.some((d) => d.id === departmentId)
                      ? [...writableDepartments, ...departments.filter((d) => d.id === departmentId)]
                      : writableDepartments
                    ).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'profile' && (
                  <select value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Usuario">
                    <option value="">Seleccionar usuario</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>

          <div className="field">
            <span className="field-label" id="visibility-label">
              ¿Quién lo puede ver?
            </span>
            <div className="visibility-options" role="radiogroup" aria-labelledby="visibility-label">
              {visibilityOptions.map((option) => {
                const locked = option === 'todos' && !canPublish
                return (
                  <label key={option} className={`visibility-option${effectiveVisibility === option ? ' visibility-option--selected' : ''}`}>
                    <input
                      type="radio"
                      name="visibility"
                      value={option}
                      checked={effectiveVisibility === option}
                      disabled={submitting || locked}
                      onChange={() => setVisibility(option)}
                    />
                    <span className="visibility-option-text">
                      <strong>{DOCUMENT_VISIBILITY_LABEL[option]}</strong>
                      <span>{visibilityHelp(option, scopeTarget, scopeName)}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {scopeTarget === 'profile' && <p className="field-help">Un documento para una persona lo ve solo esa persona.</p>}
            {scopeTarget !== 'profile' && !canPublish && !alreadyPublished && (
              <p className="field-help">Para publicar algo para todos, pedíselo a Informática o al Secretario Regional.</p>
            )}
            {alreadyPublished && !canPublish && (
              <p className="field-help">Este documento está publicado para todos. Solo Informática y el Secretario Regional pueden volver a publicarlo.</p>
            )}
            {effectiveVisibility === 'todos' && scopeTarget === 'department' && (
              <p className="field-help">Al publicarlo para todos, el documento pasa a ser una publicación general: lo va a ver cualquier persona con usuario de SIGER4.</p>
            )}
          </div>

          {isEditing && fileField}

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? (selectedFile ? 'Subiendo archivo…' : 'Guardando…') : isEditing ? 'Guardar cambios' : 'Subir documento'}
          </button>

          {versions.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>
                Versiones anteriores
              </div>
              {versions.map((v) => (
                <div key={v.id} style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                  {new Date(v.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </AppShell>
  )
}
