import { useEffect, useMemo, useState } from 'react'
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
import { attachGlobalErrorCapture, attachPageLifecycleCapture, createUploadDiagnosticsLog, serializeError } from '../lib/uploadDiagnostics'
import { UploadDiagnosticsPanel } from '../components/UploadDiagnosticsPanel'

type DocScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const DOC_SCOPE_OPTIONS: { value: DocScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

type FormStep = 'metadata' | 'file'

// Borrador de metadatos del Paso 1 (nueva carga, no edición) — se guarda en
// sessionStorage en cada cambio, NUNCA se guarda el File ahí (solo texto).
// Sirve para sobrevivir la recarga real que Android/iOS hacen de la PWA al
// abrir el selector de archivos o la cámara — el dato clave confirmado con
// el panel de diagnóstico es que la recarga pasa AL ABRIR el selector/
// cámara, no recién después de elegir algo, así que puede pasar apenas se
// entra al Paso 2, antes de que exista ninguna fila en "documents" todavía.
//
// wizardStep es justamente lo que faltaba antes: se guardaba el id de la
// fila pending (pendingDocumentId) para saber que había que reanudar en el
// Paso 2, pero esa fila recién se crea DENTRO de handleFileChange — es
// decir, después de elegir un archivo. Si la recarga pasa antes de eso (que
// es el caso real, según el dato nuevo del usuario), pendingDocumentId
// nunca llegó a guardarse, y la recuperación anterior volvía silenciosamente
// al Paso 1 aunque el usuario ya hubiese completado todos los datos. Ahora
// el paso actual se persiste en el momento en que se confirma (Paso 1 -> 2),
// independiente de si ya existe o no una fila real.
interface DocumentDraft {
  title: string
  category: string
  description: string
  scopeTarget: DocScopeTarget
  regionId: string
  subsedeId: string
  stationId: string
  profileId: string
  folderId: string | null
  wizardStep: FormStep
  // Si el Paso 2 ya alcanzó a crear la fila en "documents" (necesario antes
  // de poder subir el archivo, ver createDocument) antes de que la página se
  // recargara, se guarda su id acá para reanudar sobre la MISMA fila en vez
  // de crear una segunda — evita duplicados si Android recarga justo después
  // de crear la fila pero antes de terminar de subir el archivo.
  pendingDocumentId: string | null
  updatedAt: string
}

function draftStorageKey(folderIdFromQuery: string | null): string {
  return `siger4:document-draft:${folderIdFromQuery ?? 'general'}`
}

function loadDraft(folderIdFromQuery: string | null): DocumentDraft | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(folderIdFromQuery))
    if (!raw) return null
    return JSON.parse(raw) as DocumentDraft
  } catch {
    return null
  }
}

function saveDraft(folderIdFromQuery: string | null, draft: DocumentDraft): void {
  try {
    sessionStorage.setItem(draftStorageKey(folderIdFromQuery), JSON.stringify(draft))
  } catch {
    // sessionStorage puede fallar (modo privado, cuota agotada) — el
    // borrador es una mejora de recuperación, no un requisito para cargar.
  }
}

function clearDraft(folderIdFromQuery: string | null): void {
  try {
    sessionStorage.removeItem(draftStorageKey(folderIdFromQuery))
  } catch {
    // Idem saveDraft.
  }
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

  // En modo creación, el formulario tiene dos pasos reales: 'metadata'
  // (título/tipo/alcance/descripción, todo obligatorio salvo descripción) y
  // 'file' (elegir y subir el archivo). Nunca se crea una fila en
  // "documents" durante el Paso 1 — recién se crea al entrar al Paso 2, justo
  // antes de intentar subir el archivo (ver handleFileChange). En modo
  // edición no hay pasos: el documento ya existe completo, solo se edita.
  const [step, setStep] = useState<FormStep>('metadata')

  // pendingDocumentId: la fila que el Paso 2 crea para poder subir el
  // archivo (las policies de Storage exigen un document_id real para
  // validar el path, ver createDocument en lib/api/documents.ts). Se llama
  // "pending" a propósito — mientras uploadStatus no sea 'done', esta fila
  // NO es un documento válido: fetchDocuments/fetchDocumentsByFolder la
  // excluyen de todos los listados normales (storage_path='pending'), así
  // que nunca aparece como un documento incompleto para otros usuarios.
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(null)
  const [existingFolderId, setExistingFolderId] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mensaje de recuperación de borrador (ver useEffect de recuperación más
  // abajo) — deliberadamente separado de "error": recuperar los datos del
  // Paso 1 después de una recarga NO es un fallo, es el comportamiento
  // esperado en mobile. Mezclarlo con "error" lo mostraba con el mismo
  // estilo rojo que un fallo real de subida, dando la falsa impresión de que
  // algo salió mal cuando en realidad el sistema ya recuperó todo lo que
  // podía recuperar.
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

  // Instrumentación TEMPORAL de diagnóstico (ver src/lib/uploadDiagnostics.ts)
  // para investigar por qué la carga falla en mobile/PWA pero funciona en
  // escritorio. Solo visible para informatica_r4/integrante_informatica (ver
  // UploadDiagnosticsPanel más abajo, gateado por isAdmin). No cambia ningún
  // comportamiento del flujo — createUploadDiagnosticsLog() solo acumula
  // eventos en memoria. Se crea una sola vez por montaje del formulario
  // (useMemo con deps vacías, no useState, porque no necesita disparar
  // re-render al loguear — el panel relee el snapshot con su propio timer).
  const diagnosticsLog = useMemo(() => createUploadDiagnosticsLog(), [])

  useEffect(() => attachGlobalErrorCapture(diagnosticsLog), [diagnosticsLog])
  useEffect(() => attachPageLifecycleCapture(diagnosticsLog), [diagnosticsLog])

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

  // Al entrar en modo creación (no edición), intenta recuperar un borrador
  // de una carga anterior interrumpida por una recarga (ver loadDraft).
  //
  // Dato clave confirmado con el panel de diagnóstico (ver DEPLOYMENT.md):
  // en mobile/PWA, Android/iOS recargan la página al ABRIR el selector de
  // archivos o la cámara — no recién después de elegir algo. Eso significa
  // que la recarga puede pasar apenas se entra al Paso 2, ANTES de que
  // exista ninguna fila en "documents" todavía (esa fila recién se crea
  // dentro de handleFileChange, que nunca llegó a correr). Restaurar el
  // Paso 2 solo cuando había un pendingDocumentId guardado (como hacía la
  // versión anterior) volvía silenciosamente al Paso 1 en ese caso — el
  // usuario ya había completado todo el Paso 1, pero la pantalla no lo
  // reflejaba. Ahora wizardStep se persiste apenas se confirma el Paso 1
  // (ver handleContinueToFile), así que la restauración ya no depende de
  // que exista una fila real.
  useEffect(() => {
    if (isEditing) return
    const draft = loadDraft(folderIdFromQuery)
    diagnosticsLog.log('draftRecovered', {
      found: Boolean(draft),
      wizardStep: draft?.wizardStep ?? null,
      pendingDocumentId: draft?.pendingDocumentId ?? null,
      updatedAt: draft?.updatedAt ?? null,
    })
    if (!draft) return
    setTitle(draft.title)
    setCategory(draft.category)
    setDescription(draft.description)
    setScopeTarget(draft.scopeTarget)
    setRegionId(draft.regionId)
    setSubsedeId(draft.subsedeId)
    setStationId(draft.stationId)
    setProfileId(draft.profileId)
    if (draft.wizardStep === 'file') {
      setStep('file')
      if (draft.pendingDocumentId) {
        // La fila ya existía cuando se interrumpió — el archivo no llegó a
        // terminar de subirse (storage_path sigue en 'pending'), hace falta
        // reintentar sobre esa misma fila.
        setPendingDocumentId(draft.pendingDocumentId)
        setUploadStatus('failed')
        setRecoveryNotice('Recuperamos los datos del documento. Volvé a seleccionar el archivo para completar la carga.')
      } else {
        // Se llegó a confirmar el Paso 1 pero la recarga pasó antes de
        // elegir un archivo (el caso real más común, según el diagnóstico
        // en mobile) — no hay ninguna fila creada todavía, así que no es un
        // error de "no se pudo subir": simplemente hay que elegir el
        // archivo por primera vez, con los datos del Paso 1 ya completos.
        setUploadStatus('idle')
        setRecoveryNotice('Recuperamos los datos del documento. Volvé a seleccionar el archivo para completar la carga.')
      }
      diagnosticsLog.log('wizardStepChange', { from: null, to: 'file', persisted: false, reason: 'draftRestore' })
    } else {
      diagnosticsLog.log('wizardStepChange', { from: null, to: 'metadata', persisted: false, reason: 'draftRestore' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

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
      // carga anterior se interrumpió sin que el archivo terminara de
      // subirse (no debería ser visible en listados normales, pero se puede
      // llegar acá por URL directa, ej. desde el panel de pendientes de
      // informática) — bloquear Guardar hasta que se adjunte un archivo real.
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

  function metadataIsValid(): string | null {
    if (!title.trim()) return 'Ingresá un título para el documento.'
    if (!category.trim()) return 'Ingresá el tipo de documento.'
    if (!scopeIsReady()) return 'Completá el alcance (región, subsede, cuartel o usuario) del documento.'
    return null
  }

  // Arma el borrador completo con el estado actual del formulario —
  // centralizado para no repetir los mismos 10 campos en cada punto que
  // necesita guardar (handleContinueToFile, handleFileChange). wizardStep y
  // pendingDocumentId se pasan explícitos porque son justo lo que cambia
  // entre esos puntos.
  function currentDraft(wizardStep: FormStep, pendingId: string | null): DocumentDraft {
    return {
      title,
      category,
      description,
      scopeTarget,
      regionId,
      subsedeId,
      stationId,
      profileId,
      folderId: folderIdFromQuery,
      wizardStep,
      pendingDocumentId: pendingId,
      updatedAt: new Date().toISOString(),
    }
  }

  // Paso 1 -> Paso 2: los metadatos ya están completos y validados acá, no
  // recién al guardar al final — así el Paso 2 solo se ocupa del archivo.
  // Guarda el borrador apenas se confirma el paso, ANTES de tocar el
  // selector de archivos — es la única forma de que sobreviva una recarga
  // que Android/iOS puede disparar al abrir el selector/cámara, no recién
  // después de elegir algo (ver el useEffect de recuperación más arriba).
  function handleContinueToFile(event: FormEvent) {
    event.preventDefault()
    const validationError = metadataIsValid()
    diagnosticsLog.log('validateMetadata', { ok: !validationError, error: validationError })
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setRecoveryNotice(null)
    // Si ya existe una fila pending de un intento anterior en esta misma
    // carga (el usuario volvió al Paso 1 para corregir algo después de que
    // el Paso 2 ya la había creado), se preserva su id en el borrador — así
    // una recarga en este punto sigue apuntando a la fila correcta en vez de
    // "olvidarla" y terminar creando una segunda cuando el Paso 2 vuelva a
    // correr.
    saveDraft(folderIdFromQuery, currentDraft('file', pendingDocumentId))
    diagnosticsLog.log('wizardStepChange', { from: 'metadata', to: 'file', persisted: true })
    setStep('file')
  }

  function handleBackToMetadata() {
    setError(null)
    // Persiste el retroceso: si la página se recarga mientras el usuario
    // sigue corrigiendo el Paso 1, debe quedar en Paso 1 (no en el "file"
    // guardado la última vez que se confirmó) — pendingDocumentId se
    // conserva igual, ver handleContinueToFile.
    if (!isEditing) saveDraft(folderIdFromQuery, currentDraft('metadata', pendingDocumentId))
    diagnosticsLog.log('wizardStepChange', { from: 'file', to: 'metadata', persisted: true })
    setStep('metadata')
  }

  // Se dispara apenas el usuario elige un archivo en el Paso 2. Los
  // metadatos del Paso 1 ya están validados y confirmados en este punto:
  // crea la fila real en "documents" (si todavía no existe una para esta
  // carga — puede ya existir si esto es un reintento después de un fallo, o
  // si se recuperó un borrador con pendingDocumentId) y sube el archivo de
  // inmediato. La fila queda con storage_path='pending' hasta que el upload
  // confirma — invisible en listados normales mientras tanto (ver
  // fetchDocuments/fetchDocumentsByFolder), así que nunca es un documento
  // "a medias" visible para nadie.
  async function handleFileChange(selected: File | null) {
    setError(null)
    setRecoveryNotice(null)
    // Loguea el evento onChange SIEMPRE, incluso si selected es null — si el
    // handler nunca llega a correr en mobile (la sospecha más básica a
    // descartar primero), este log tampoco va a aparecer, lo que ya sería un
    // dato real en sí mismo.
    diagnosticsLog.log('onChange', {
      hasFile: Boolean(selected),
      fileName: selected?.name,
      fileType: selected?.type,
      fileSize: selected?.size,
    })
    if (!selected) return

    setUploadStatus('uploading')
    setFileName(selected.name)
    setFileSize(selected.size)
    try {
      const targetId = isEditing ? id! : pendingDocumentId
      let createdId: string | null = null
      if (!targetId) {
        diagnosticsLog.log('createPending', { title: title.trim(), category: category.trim(), scope: currentScopeInput() })
        const created = await createDocument({
          title: title.trim(),
          category: category.trim(),
          description: description || null,
          ...currentScopeInput(),
          folder_id: folderIdFromQuery || null,
          uploaded_by_profile_id: currentProfile?.id ?? null,
        })
        diagnosticsLog.log('createPending', { ok: true, documentId: created.id })
        createdId = created.id
        setPendingDocumentId(created.id)
        // Guarda el id de la fila recién creada en el borrador, para que si
        // la página se recarga entre este punto y que termine el upload de
        // abajo, la próxima carga de la pantalla reanude sobre esta misma
        // fila en vez de crear una segunda (ver el useEffect de recuperación
        // de borrador más arriba).
        if (!isEditing) {
          saveDraft(folderIdFromQuery, currentDraft('file', created.id))
        }
      } else {
        // Ya existe una fila (reintento después de un fallo, o el usuario
        // volvió al Paso 1 a corregir algo y volvió a esta misma fila
        // pending). Se re-sincronizan los metadatos por si cambiaron desde
        // que se creó — sin esto, quedarían con los valores del primer
        // intento hasta el guardado final. Si además ya tenía un archivo
        // real (no este caso en el flujo normal de creación, pero sí en
        // edición), ese archivo anterior pasa a historial de versiones antes
        // de reemplazarlo.
        if (!isEditing) {
          diagnosticsLog.log('updatePendingMetadata', { documentId: targetId })
          await updateDocument(targetId, { title: title.trim(), category: category.trim(), description: description || null, ...currentScopeInput() })
        }
        if (existingStoragePath && existingStoragePath !== 'pending') {
          diagnosticsLog.log('addVersion', { documentId: targetId, previousStoragePath: existingStoragePath })
          await addDocumentVersion(targetId, existingStoragePath, currentProfile?.id ?? null)
        }
      }

      const finalId = targetId ?? createdId!
      diagnosticsLog.log('uploadStart', { documentId: finalId, fileName: selected.name, fileType: selected.type, fileSize: selected.size })
      const path = await uploadDocumentFile(finalId, selected)
      diagnosticsLog.log('uploadSuccess', { documentId: finalId, storagePath: path })
      diagnosticsLog.log('updateStoragePath', { documentId: finalId, storagePath: path })
      await updateDocumentStoragePath(finalId, path)
      setExistingStoragePath(path)
      setUploadStatus('done')
    } catch (err) {
      diagnosticsLog.log('uploadFail', serializeError(err))
      setError(err instanceof Error ? err.message : 'No pudimos subir el archivo. Probá de nuevo.')
      setUploadStatus('failed')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (uploadStatus === 'uploading') {
      setError('Esperá a que termine de subirse el archivo antes de guardar.')
      return
    }
    if (uploadStatus !== 'done') {
      setError(isEditing ? 'Adjuntá un archivo antes de guardar.' : 'Seleccioná un archivo antes de guardar.')
      return
    }

    setSubmitting(true)
    diagnosticsLog.log('finalSave', { documentId: isEditing ? id : pendingDocumentId })
    try {
      const input = { title: title.trim(), category: category.trim(), description: description || null, ...currentScopeInput() }

      if (isEditing && id) {
        await updateDocument(id, input)
        navigate(existingFolderId ? `/documentos/carpetas/${existingFolderId}` : '/documentos/carpetas/general')
      } else if (pendingDocumentId) {
        // El archivo ya se subió en handleFileChange y la fila ya se creó
        // con los metadatos correctos del Paso 1 — esto solo confirma/
        // actualiza por si algo cambió. Con el archivo ya subido
        // (uploadStatus === 'done'), storage_path ya no es 'pending', así
        // que el documento pasa a ser visible en los listados normales
        // recién en este punto.
        await updateDocument(pendingDocumentId, input)
        clearDraft(folderIdFromQuery)
        navigate(folderIdFromQuery ? `/documentos/carpetas/${folderIdFromQuery}` : '/documentos/carpetas/general')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el documento.')
    } finally {
      setSubmitting(false)
    }
  }

  const showingMetadataStep = !isEditing && step === 'metadata'
  const showingFileStep = isEditing || step === 'file'

  return (
    <AppShell title={isEditing ? 'Editar Documento' : 'Nuevo Documento'}>
      <h1 className="page-title">{isEditing ? 'Editar Documento' : 'Nuevo Documento'}</h1>
      {!isEditing && (
        <p className="page-subtitle">
          Paso {step === 'metadata' ? '1' : '2'} de 2 — {step === 'metadata' ? 'Datos del documento' : 'Archivo'}
        </p>
      )}
      {isEditing && <p className="page-subtitle">Cargá documentación institucional para el alcance que corresponda.</p>}

      {loading ? (
        <div className="empty-state">Cargando datos del documento…</div>
      ) : showingMetadataStep ? (
        <form onSubmit={handleContinueToFile} className="card-solid" noValidate>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {DOC_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScopeTarget(option.value)}
                  className={`btn ${scopeTarget === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {scopeTarget === 'region' && (
              <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">Seleccionar región</option>
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
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block">
            Continuar: elegir archivo
          </button>
        </form>
      ) : showingFileStep ? (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          {!isEditing && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div style={{ fontSize: 13 }}>
                <strong>{title}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}> · {category}</span>
              </div>
              <button type="button" className="btn btn-outlined" style={{ padding: '6px 10px', fontSize: 12 }} onClick={handleBackToMetadata}>
                Editar datos
              </button>
            </div>
          )}

          {recoveryNotice && (
            <div
              className="card"
              style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-card-soft)', border: '1px solid var(--color-border)' }}
            >
              <p style={{ margin: 0, fontSize: 13 }}>{recoveryNotice}</p>
            </div>
          )}

          <div className="field">
            <label htmlFor="file">
              {isEditing ? 'Reemplazar archivo (opcional)' : recoveryNotice ? 'Seleccionar archivo nuevamente' : 'Archivo adjunto'}
            </label>
            {!isEditing && uploadStatus === 'idle' && !recoveryNotice && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 8 }}>
                Seleccioná un archivo — se sube apenas lo elegís.
              </p>
            )}
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
                No se pudo subir el archivo{fileName ? ` "${fileName}"` : ''}
                {error ? `: ${error}` : ''}. Elegilo de nuevo para reintentar.
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
            disabled={submitting || uploadStatus !== 'done'}
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          {uploadStatus !== 'done' && (
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
      ) : null}

      {isAdmin && !loading && <UploadDiagnosticsPanel log={diagnosticsLog} />}
    </AppShell>
  )
}
