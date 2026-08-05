import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import {
  addDocumentVersion,
  createDocument,
  fetchDocumentById,
  fetchDocumentVersions,
  updateDocument,
  updateDocumentStoragePath,
} from '../lib/api/documents'
import { uploadDocumentFile } from '../lib/api/storage'
import type { DocumentVersion, Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

type DocScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const DOC_SCOPE_OPTIONS: { value: DocScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

// Quita la extensión de un nombre de archivo para usarlo como título por
// defecto ("Circular_12.pdf" -> "Circular_12") — nunca se manda vacío a
// createDocument (title es NOT NULL), aunque el usuario todavía no haya
// escrito nada cuando el archivo ya se subió (ver handleFileChange).
function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[a-zA-Z0-9]{1,10}$/, '')
  return withoutExt || fileName
}

export function DocumentoFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderIdFromQuery = searchParams.get('folderId')
  const { profile: currentProfile, isAdmin, hasRole } = useAuth()
  const canCreate = isAdmin || hasRole('secretario_regional', 'presidente_cuartel', 'usuario_carga_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [versions, setVersions] = useState<DocumentVersion[]>([])

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [scopeTarget, setScopeTarget] = useState<DocScopeTarget>('region')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [profileId, setProfileId] = useState('')

  // documentId: apenas se termina de crear+subir el archivo (ver
  // handleFileChange), esta pantalla deja de estar en modo "nuevo puro" y
  // pasa a editar esta fila real hasta que se hace click en Guardar — el
  // archivo ya quedó a salvo en Storage/DB desde el momento en que se
  // seleccionó, sin depender de que el resto del formulario se complete ni
  // de que la pestaña/app siga viva. Esto es lo que evita perder el archivo
  // si Android mata el proceso de la PWA al volver del selector nativo de
  // archivos (ver DEPLOYMENT.md, sección de este fix): antes, el archivo
  // vivía solo en un <input type="file"> + estado de React hasta el submit
  // final, y ambos se pierden si el navegador recarga la página.
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(null)
  const [existingFolderId, setExistingFolderId] = useState<string | null>(null)
  // uploadStatus separa explícitamente "hay una fila creada pero el archivo
  // real todavía no se subió con éxito" (failed) de "ya está subido" (done) —
  // documentId por sí solo no alcanza para esa distinción (queda seteado
  // apenas se crea la fila, antes de saber si el upload del archivo
  // funcionó), y handleSubmit lo usa para bloquear el guardado si el archivo
  // no quedó realmente subido (ver más abajo).
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles()]).then(
      ([regionsData, subsedesData, stationsData, profilesData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setProfiles(profilesData)
        setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [canCreate])

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
      // Un documento existente puede llegar en storage_path='pending' si una
      // carga anterior (en este flujo, o en el anterior a este fix) se
      // interrumpió sin que el archivo terminara de subirse — bloquear
      // Guardar hasta que se adjunte un archivo real, igual que en modo
      // creación (ver handleSubmit).
      setUploadStatus(doc.storage_path === 'pending' ? 'failed' : 'done')
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
        <div className="empty-state">No tenés permisos para cargar documentos.</div>
      </AppShell>
    )
  }

  // Alcance actual del formulario en el momento de crear la fila — hace
  // falta que ya sea válido cuando se elige el archivo (no se puede crear un
  // documento sin alcance, documents_single_scope lo exige), por eso el
  // input de archivo usa esto en vez de esperar al submit final.
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

  // Se dispara apenas el usuario elige un archivo (no en el submit del
  // formulario): crea la fila real (si todavía no existe una para esta
  // carga) y sube el archivo de inmediato, para que quede a salvo en
  // Storage/DB sin depender de que el resto del formulario se complete. En
  // mobile, esto es lo que evita perder el archivo si Android recarga la
  // PWA al volver del selector nativo (el <input type="file"> dispara este
  // handler ANTES de que exista ninguna chance de que la página se
  // recargue). Si ya existe un documento de esta carga (el usuario cambió de
  // archivo antes de guardar), el archivo anterior se archiva como versión,
  // igual que reemplazar un archivo en modo edición.
  async function handleFileChange(selected: File | null) {
    setError(null)
    if (!selected) return

    if (!isEditing && !documentId && !scopeIsReady()) {
      setError('Elegí un alcance (región, subsede, cuartel o usuario) antes de adjuntar el archivo.')
      return
    }

    setUploadStatus('uploading')
    setFileName(selected.name)
    setFileSize(selected.size)
    try {
      const targetId = isEditing ? id! : documentId
      let createdId: string | null = null
      if (!targetId) {
        // Primera vez que se elige un archivo en una carga nueva: crea la
        // fila real con el título/categoría que haya hasta el momento (o un
        // valor por defecto a partir del nombre del archivo, nunca vacío).
        // Se hace ANTES de subir el archivo porque las policies de Storage
        // necesitan un document_id real para validar el path (ver
        // createDocument en lib/api/documents.ts) — la fila queda con
        // storage_path='pending' hasta que el upload de abajo confirme.
        const created = await createDocument({
          title: title.trim() || titleFromFileName(selected.name),
          category: category.trim() || 'Sin categorizar',
          description: description || null,
          ...currentScopeInput(),
          folder_id: folderIdFromQuery || null,
          uploaded_by_profile_id: currentProfile?.id ?? null,
        })
        createdId = created.id
        setDocumentId(created.id)
      } else if (existingStoragePath && existingStoragePath !== 'pending') {
        // Ya existe una fila con archivo real (edición existente, o ya se
        // subió un archivo antes en esta misma carga): el archivo anterior
        // pasa a historial de versiones antes de reemplazarlo.
        await addDocumentVersion(targetId, existingStoragePath, currentProfile?.id ?? null)
      }

      const finalId = targetId ?? createdId!
      // Si esto falla (red, MIME rechazado server-side, tamaño excedido), la
      // fila en "documents" ya existe pero storage_path queda en 'pending' —
      // uploadStatus pasa a 'failed' en el catch de abajo, lo que bloquea
      // Guardar (ver handleSubmit) hasta que se reintente. Nunca queda un
      // archivo "subido" fantasma: o la fila tiene el path real, o el botón
      // de guardar sigue deshabilitado.
      const path = await uploadDocumentFile(finalId, selected)
      await updateDocumentStoragePath(finalId, path)
      setExistingStoragePath(path)
      setUploadStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir el archivo. Probá de nuevo.')
      setUploadStatus('failed')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    // Validación propia en vez de confiar en "required" del navegador (el
    // form tiene noValidate): si el navegador bloqueara el submit de forma
    // nativa por un campo requerido vacío, handleSubmit nunca llegaría a
    // correr y un mensaje de error de un intento anterior quedaría pegado en
    // pantalla sin actualizarse, dando la impresión de que el sistema no
    // reacciona a lo que el usuario ya corrigió.
    if (!title.trim()) {
      setError('Ingresá un título para el documento.')
      return
    }
    if (!category.trim()) {
      setError('Ingresá el tipo de documento.')
      return
    }
    if (scopeTarget === 'region' && !regionId) {
      setError('Seleccioná la región destino.')
      return
    }
    if (scopeTarget === 'subsede' && !subsedeId) {
      setError('Seleccioná la subsede destino.')
      return
    }
    if (scopeTarget === 'station' && !stationId) {
      setError('Seleccioná el cuartel destino.')
      return
    }
    if (scopeTarget === 'profile' && !profileId) {
      setError('Seleccioná el usuario destino.')
      return
    }
    if (!isEditing && !documentId) {
      setError('Adjuntá un archivo.')
      return
    }
    // Bloquea el guardado si el archivo no quedó realmente subido: la fila
    // puede existir (documentId seteado) con storage_path='pending' si el
    // upload falló después de crearla (ver handleFileChange), o si un
    // documento en edición nunca tuvo archivo. Nunca se debe poder guardar
    // metadatos "como si" el archivo estuviera ahí cuando no lo está.
    if (uploadStatus === 'uploading') {
      setError('Esperá a que termine de subirse el archivo antes de guardar.')
      return
    }
    if (uploadStatus === 'failed' || uploadStatus === 'idle') {
      setError('El archivo todavía no se subió correctamente. Elegilo de nuevo antes de guardar.')
      return
    }

    setSubmitting(true)
    try {
      const input = { title, category, description: description || null, ...currentScopeInput() }

      if (isEditing && id) {
        await updateDocument(id, input)
        navigate(existingFolderId ? `/documentos/carpetas/${existingFolderId}` : '/documentos/carpetas/general')
      } else if (documentId) {
        // El archivo ya se subió en handleFileChange — acá solo se
        // actualizan los datos finales (título/categoría/descripción/
        // alcance real, que puede haber cambiado respecto al que tenía el
        // documento cuando se creó apenas se eligió el archivo).
        await updateDocument(documentId, input)
        navigate(folderIdFromQuery ? `/documentos/carpetas/${folderIdFromQuery}` : '/documentos/carpetas/general')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el documento.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={isEditing ? 'Editar Documento' : 'Nuevo Documento'}>
      <h1 className="page-title">{isEditing ? 'Editar Documento' : 'Nuevo Documento'}</h1>
      <p className="page-subtitle">Cargá documentación institucional para el alcance que corresponda.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del documento…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
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

          {!isEditing && (
            <div className="field">
              <label>Alcance</label>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 8 }}>
                Elegí el alcance antes de adjuntar el archivo — el archivo se sube apenas lo elegís, con
                este alcance.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {DOC_SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={Boolean(documentId)}
                    onClick={() => setScopeTarget(option.value)}
                    className={`btn ${scopeTarget === option.value ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {scopeTarget === 'region' && (
                <select value={regionId} disabled={Boolean(documentId)} onChange={(e) => setRegionId(e.target.value)}>
                  <option value="">Seleccionar región</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              )}

              {scopeTarget === 'subsede' && (
                <select value={subsedeId} disabled={Boolean(documentId)} onChange={(e) => setSubsedeId(e.target.value)}>
                  <option value="">Seleccionar subsede</option>
                  {subsedes.map((subsede) => (
                    <option key={subsede.id} value={subsede.id}>
                      {subsede.name}
                    </option>
                  ))}
                </select>
              )}

              {scopeTarget === 'station' && (
                <select value={stationId} disabled={Boolean(documentId)} onChange={(e) => setStationId(e.target.value)}>
                  <option value="">Seleccionar cuartel</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              )}

              {scopeTarget === 'profile' && (
                <select value={profileId} disabled={Boolean(documentId)} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">Seleccionar usuario</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              )}
              {documentId && (
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  El alcance queda fijo una vez subido el archivo. Si te equivocaste, guardá igual y
                  después editá el documento para corregirlo.
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="file">{isEditing ? 'Reemplazar archivo (opcional)' : 'Archivo adjunto'}</label>
            <input
              id="file"
              type="file"
              disabled={uploadStatus === 'uploading'}
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null
                void handleFileChange(selected)
                // Se limpia el input para poder volver a elegir el mismo
                // archivo dos veces seguidas (ej. si la primera subida
                // falló) — el nombre/tamaño ya quedaron guardados en estado
                // propio (fileName/fileSize), no dependen del valor del
                // input nativo.
                e.target.value = ''
              }}
            />
            {uploadStatus === 'uploading' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Subiendo archivo{fileName ? `: ${fileName}` : '…'}
              </p>
            )}
            {uploadStatus === 'done' && fileName && (
              <p style={{ fontSize: 12, color: 'var(--color-success, #16a34a)', marginTop: 4, fontWeight: 600 }}>
                ✓ Archivo subido correctamente: {fileName}
                {fileSize != null && ` (${Math.round(fileSize / 1024)} KB)`}
              </p>
            )}
            {uploadStatus === 'failed' && (
              <p className="field-error" style={{ marginTop: 4 }}>
                No se pudo subir el archivo{fileName ? ` "${fileName}"` : ''}: {error ?? 'error desconocido'}. Elegilo de nuevo para reintentar.
              </p>
            )}
            {uploadStatus === 'done' && !fileName && isEditing && existingStoragePath && existingStoragePath !== 'pending' && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Ya tiene un archivo cargado. Elegí uno nuevo solo si querés reemplazarlo (el actual queda
                en el historial de versiones).
              </p>
            )}
          </div>

          {error && uploadStatus !== 'failed' && <p className="field-error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting || uploadStatus === 'uploading' || uploadStatus === 'failed' || uploadStatus === 'idle'}
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          {(uploadStatus === 'failed' || uploadStatus === 'idle') && (
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
              El botón se habilita cuando el archivo termine de subirse correctamente.
            </p>
          )}

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
