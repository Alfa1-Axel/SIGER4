import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { addDocumentVersion, createDocument, fetchDocumentById, fetchDocumentVersions, updateDocument, updateDocumentStoragePath } from '../lib/api/documents'
import { isDocumentMimeAllowed, uploadDocumentFile } from '../lib/api/storage'
import { FilePicker } from '../components/ui/FilePicker'
import { AccessDenied } from '../components/ui/AccessDenied'
import { useSessionDraft } from '../hooks/useSessionDraft'
import type { DocumentVersion, Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

type DocScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const DOC_SCOPE_OPTIONS: { value: DocScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

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
export function DocumentoFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderIdFromQuery = searchParams.get('folderId')
  const { profile: currentProfile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'usuario_carga_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const isRegionalRole = hasRole('secretario_regional')
  const canCreate = isAdmin || isRegionalRole || isStationRole
  // documents_write_admin_regional_station (migración 0047): un rol de
  // cuartel SOLO puede escribir con station_id = su propio cuartel (nunca
  // region/subsede/usuario); secretario_regional solo dentro de su región.
  // Antes el picker ofrecía los 4 alcances y todos los cuarteles/regiones del
  // sistema a cualquiera de estos roles, rechazado recién al guardar.
  const myStationId = currentProfile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''
  const myRegionId = currentProfile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? ''
  const stationLocked = isStationRole && !isAdmin && !isRegionalRole
  const regionLocked = isRegionalRole && !isAdmin

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [versions, setVersions] = useState<DocumentVersion[]>([])

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [scopeTarget, setScopeTarget] = useState<DocScopeTarget>(stationLocked ? 'station' : 'region')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState(stationLocked ? myStationId : '')
  const [profileId, setProfileId] = useState('')

  const visibleScopeOptions = stationLocked ? DOC_SCOPE_OPTIONS.filter((o) => o.value === 'station') : DOC_SCOPE_OPTIONS

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const draftValue = useMemo<DocumentDraft>(() => ({ title, category, description }), [title, category, description])
  const { readDraft, clearDraft } = useSessionDraft<DocumentDraft>(`documento-nuevo:${folderIdFromQuery ?? 'general'}`, draftValue, !isEditing)
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
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(null)
  const [existingFolderId, setExistingFolderId] = useState<string | null>(null)

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles()]).then(
      ([regionsData, subsedesData, stationsData, profilesData]) => {
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
      },
    )
    return () => {
      active = false
    }
  }, [canCreate, stationLocked, regionLocked, myStationId, myRegionId])

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchDocumentById(id), fetchDocumentVersions(id)]).then(([doc, docVersions]) => {
      if (!active || !doc) return
      setTitle(doc.title)
      setCategory(doc.category)
      setDescription(doc.description ?? '')
      setExistingStoragePath(doc.storage_path)
      setExistingFolderId(doc.folder_id)
      setVersions(docVersions)
      if (doc.profile_id) {
        setScopeTarget('profile')
        setProfileId(doc.profile_id)
      } else if (doc.subsede_id) {
        setScopeTarget('subsede')
        setSubsedeId(doc.subsede_id)
      } else if (doc.station_id) {
        setScopeTarget('station')
        setStationId(doc.station_id)
      } else if (doc.region_id) {
        setScopeTarget('region')
        setRegionId(doc.region_id)
      }
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
          message="Cargar documentos es de Informática, el Secretario Regional y los roles de cuartel (para su cuartel). Podés ver y descargar los documentos de tu alcance."
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
    }
  }

  function scopeIsReady(): boolean {
    if (scopeTarget === 'region') return Boolean(regionId)
    if (scopeTarget === 'subsede') return Boolean(subsedeId)
    if (scopeTarget === 'station') return Boolean(stationId)
    return Boolean(profileId)
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isEditing && !selectedFile) return setError('Falta el archivo: tocá "Elegir archivo" (o "Sacar foto" desde el celular).')
    if (!title.trim()) return setError('Escribí un título para reconocer el documento en el listado.')
    if (!category.trim()) return setError('Indicá el tipo de documento (por ejemplo: Circular, Acta, Manual).')
    if (!scopeIsReady()) return setError('Elegí para quién es el documento: Regional, subsede, cuartel o usuario.')

    setSubmitting(true)
    try {
      const input = { title: title.trim(), category: category.trim(), description: description || null, ...currentScopeInput() }

      if (isEditing && id) {
        await updateDocument(id, input)
        if (selectedFile) {
          if (existingStoragePath && existingStoragePath !== 'pending') {
            await addDocumentVersion(id, existingStoragePath, currentProfile?.id ?? null)
          }
          const path = await uploadDocumentFile(id, selectedFile)
          await updateDocumentStoragePath(id, path)
        }
        navigate(existingFolderId ? `/documentos/carpetas/${existingFolderId}` : '/documentos/carpetas/general', {
          state: { notice: selectedFile ? 'Se guardaron los cambios y el archivo nuevo.' : 'Se guardaron los cambios.' },
        })
      } else {
        const created = await createDocument({
          ...input,
          folder_id: folderIdFromQuery || null,
          uploaded_by_profile_id: currentProfile?.id ?? null,
        })
        const path = await uploadDocumentFile(created.id, selectedFile!)
        await updateDocumentStoragePath(created.id, path)
        clearDraft()
        navigate(folderIdFromQuery ? `/documentos/carpetas/${folderIdFromQuery}` : '/documentos/carpetas/general', {
          state: { notice: `"${title.trim()}" se subió correctamente.` },
        })
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
      {isEditing && !selectedFile && existingStoragePath && existingStoragePath !== 'pending' && (
        <p className="field-help" style={{ marginTop: -8, marginBottom: 16 }}>
          Ya tiene un archivo. Elegí uno nuevo solo si querés reemplazarlo: el actual queda en el historial de versiones.
        </p>
      )}
    </>
  )

  return (
    <AppShell title={isEditing ? 'Editar documento' : 'Subir documento'}>
      <Link
        to={(isEditing ? existingFolderId : folderIdFromQuery) ? `/documentos/carpetas/${isEditing ? existingFolderId : folderIdFromQuery}` : '/documentos'}
        className="back-link"
      >
        ← Volver a Documentos
      </Link>
      <h1 className="page-title">{isEditing ? 'Editar documento' : 'Subir documento'}</h1>
      <p className="page-subtitle">
        {isEditing
          ? 'Cambiá los datos del documento o subí una versión nueva del archivo.'
          : 'Elegí el archivo (o sacale una foto), ponele un título y elegí para quién es. Funciona desde la computadora o el celular.'}
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
            <label>Alcance</label>
            {stationLocked ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Este documento va a quedar dentro de tu propio cuartel.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {visibleScopeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setScopeTarget(option.value)}
                      className="chip"
                      aria-pressed={scopeTarget === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {scopeTarget === 'region' && (
                  <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                    <option value="">Seleccionar Regional</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'subsede' && (
                  <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
                    <option value="">Seleccionar subsede</option>
                    {subsedes.map((subsede) => (
                      <option key={subsede.id} value={subsede.id}>
                        {subsede.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'station' && (
                  <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                    <option value="">Seleccionar cuartel</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTarget === 'profile' && (
                  <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
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
