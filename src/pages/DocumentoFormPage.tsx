import { useEffect, useMemo, useRef, useState } from 'react'
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
import { inferMimeType, isDocumentMimeAllowed, uploadDocumentFile } from '../lib/api/storage'
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
// sessionStorage en cada cambio, NUNCA se guarda el File ahí (solo texto,
// nunca binario) — un File no sobrevive una recarga real de todos modos
// (Android/iOS lo descartan junto con el resto de la memoria JS), así que
// intentar persistirlo sería inútil además de innecesario. Si la recarga
// pasa después de seleccionar un archivo pero antes de tocar "Subir
// archivo", el archivo se pierde y hay que volver a elegirlo — eso se
// comunica explícito en pantalla (ver fileLostNotice), nunca se finge que
// "ya está" ni se crea nada en la base por esto.
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
  // Si ya se llegó a crear la fila real en "documents" (recién pasa al
  // tocar "Subir archivo", nunca al solo elegir el archivo — ver
  // handleUploadFile), se guarda su id para reanudar sobre la MISMA fila en
  // vez de crear una segunda si la página se recarga a mitad de una subida.
  pendingDocumentId: string | null
  // true si se llegó a confirmar el documento (storage_path real, ya no
  // 'pending') antes de que la fila se recargara — permite distinguir, al
  // recuperar el borrador, "ya se subió, falta solo Finalizar" de "hay que
  // volver a elegir el archivo".
  uploadConfirmed: boolean
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

// Estado real del Paso 2 — separa explícitamente "elegido pero no subido"
// de "subiendo" y "subido", que es exactamente lo que el usuario pidió:
// elegir un archivo NUNCA dispara la subida por sí solo, hace falta tocar
// "Subir archivo" a propósito.
//   - idle: nada elegido todavía.
//   - selected: hay un File en memoria, no se tocó nada del lado del
//     servidor todavía (ni fila pending ni upload).
//   - uploading: se tocó "Subir archivo" — creando/confirmando la fila y
//     subiendo a Storage.
//   - uploaded: confirmado con éxito (storage_path real, notificación real
//     disparada por el trigger de la base).
//   - failed: el intento de subida falló — el File se conserva en memoria
//     para poder reintentar sin tener que volver a elegirlo.
type FileStageStatus = 'idle' | 'selected' | 'uploading' | 'uploaded' | 'failed'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]{1,10})$/)
  return match ? match[1].toLowerCase() : '(sin extensión)'
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
  // 'file' (elegir Y subir el archivo, dos acciones separadas). Nunca se
  // crea una fila en "documents" durante el Paso 1. En modo edición no hay
  // pasos: el documento ya existe completo, solo se edita.
  const [step, setStep] = useState<FormStep>('metadata')

  // pendingDocumentId: la fila que se crea recién al tocar "Subir archivo"
  // (las policies de Storage exigen un document_id real para validar el
  // path, ver createDocument en lib/api/documents.ts) — nunca al solo
  // elegir el archivo. Mientras storage_path siga en 'pending',
  // fetchDocuments/fetchDocumentsByFolder la excluyen de todos los listados
  // normales, así que nunca aparece como un documento incompleto para otros
  // usuarios, y el trigger de notificaciones (0056) no dispara ningún aviso
  // hasta que se confirma.
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null)

  // selectedFile: el File real en memoria, elegido pero todavía no
  // necesariamente subido — nunca se persiste (ni a sessionStorage ni a
  // ningún otro lado) porque un File no es serializable ni sobrevive una
  // recarga real de todos modos.
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileStageStatus, setFileStageStatus] = useState<FileStageStatus>('idle')
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(null)
  const [existingFolderId, setExistingFolderId] = useState<string | null>(null)

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mensaje de recuperación de borrador — deliberadamente separado de
  // "error": recuperar los datos del Paso 1 después de una recarga NO es un
  // fallo, es el comportamiento esperado en mobile.
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)
  // Mensaje específico para "el File se perdió por una recarga mientras
  // estaba elegido pero no subido" — pedido explícito del usuario, con texto
  // exacto ("El archivo se perdió al volver del selector. Volvé a
  // seleccionarlo.") y SIN crear ni notificar nada, porque en este caso no
  // se llegó a crear ninguna fila (elegir un archivo no crea nada, ver
  // handleFileInputChange).
  const [fileLostNotice, setFileLostNotice] = useState<string | null>(null)

  // Ref estable al <input type="file"> real — nunca se le pone key
  // dinámica ni se desmonta condicionalmente entre renders (confirmado al
  // revisar el JSX de abajo), así que la misma instancia del elemento vive
  // durante todo el Paso 2. El botón visible "Seleccionar archivo" dispara
  // el picker nativo llamando a este ref, en vez de que el input esté
  // escondido con estilos que algunos navegadores/Android tratan distinto a
  // un input realmente interactivo.
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Instrumentación TEMPORAL de diagnóstico (ver src/lib/uploadDiagnostics.ts)
  // — persiste a sessionStorage en cada log(), sobrevive recargas reales.
  // Solo visible para informatica_r4/integrante_informatica.
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
  // de una carga anterior interrumpida por una recarga real (Android/iOS
  // pueden recargar la PWA al abrir el selector de archivos/cámara). El
  // File en sí NUNCA se recupera (no se persiste, ver DocumentDraft) — si el
  // borrador dice que ya se había elegido un archivo pero no `uploadConfirmed`,
  // se le avisa al usuario que el archivo se perdió y hay que elegirlo de
  // nuevo, sin haber creado nada.
  useEffect(() => {
    if (isEditing) return
    const draft = loadDraft(folderIdFromQuery)
    diagnosticsLog.log('draftRecovered', {
      found: Boolean(draft),
      wizardStep: draft?.wizardStep ?? null,
      pendingDocumentId: draft?.pendingDocumentId ?? null,
      uploadConfirmed: draft?.uploadConfirmed ?? null,
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
      if (draft.pendingDocumentId && draft.uploadConfirmed) {
        // Se había confirmado la subida antes de la recarga — el documento
        // ya es válido (storage_path real), solo falta tocar Finalizar.
        setPendingDocumentId(draft.pendingDocumentId)
        setExistingStoragePath('confirmed') // valor no 'pending': solo se usa para el chequeo != 'pending' de abajo
        setFileStageStatus('uploaded')
        setRecoveryNotice('El archivo ya se había subido correctamente. Tocá Finalizar para completar la carga.')
      } else if (draft.pendingDocumentId) {
        // Había una fila pending (se había tocado "Subir archivo" pero no
        // llegó a confirmarse) — el archivo real nunca llegó a Storage con
        // certeza, hay que reintentar desde cero con un archivo nuevo.
        setPendingDocumentId(draft.pendingDocumentId)
        setFileStageStatus('idle')
        setFileLostNotice('El archivo se perdió al volver del selector. Volvé a seleccionarlo.')
      } else {
        // Se confirmó el Paso 1 pero la recarga pasó antes de tocar "Subir
        // archivo" (o incluso antes de elegir uno) — no se creó nada.
        setFileStageStatus('idle')
        setFileLostNotice('El archivo se perdió al volver del selector. Volvé a seleccionarlo.')
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
      // carga anterior se interrumpió sin confirmarse (no debería ser
      // visible en listados normales, pero se puede llegar acá por URL
      // directa, ej. desde el panel de pendientes de informática) —
      // bloquear Finalizar hasta que se suba un archivo real.
      setFileStageStatus(doc.storage_path === 'pending' ? 'idle' : 'uploaded')
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

  function currentDraft(wizardStep: FormStep, pendingId: string | null, uploadConfirmed: boolean): DocumentDraft {
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
      uploadConfirmed,
      updatedAt: new Date().toISOString(),
    }
  }

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
    setFileLostNotice(null)
    saveDraft(folderIdFromQuery, currentDraft('file', pendingDocumentId, fileStageStatus === 'uploaded'))
    diagnosticsLog.log('wizardStepChange', { from: 'metadata', to: 'file', persisted: true })
    setStep('file')
  }

  function handleBackToMetadata() {
    setError(null)
    if (!isEditing) saveDraft(folderIdFromQuery, currentDraft('metadata', pendingDocumentId, fileStageStatus === 'uploaded'))
    diagnosticsLog.log('wizardStepChange', { from: 'file', to: 'metadata', persisted: true })
    setStep('metadata')
  }

  // Botón visible "Seleccionar archivo" — dispara el input real por
  // referencia estable, en vez de que el usuario tenga que interactuar con
  // un <input type="file"> escondido/estilizado de formas que algunos
  // navegadores mobile manejan mal.
  function handleSelectFileButtonClick() {
    diagnosticsLog.log('fileInputButtonClick', {})
    fileInputRef.current?.click()
  }

  // onChange del input real: SOLO guarda el archivo en memoria y lo
  // muestra — nunca crea nada en el servidor ni sube nada. Esa es la
  // separación explícita que se pidió: elegir un archivo es un paso
  // completamente distinto de subirlo.
  function handleFileInputChange(selected: File | null, filesLength: number) {
    setError(null)
    setFileLostNotice(null)
    diagnosticsLog.log('nativeFileInputChange', {
      filesLength,
      hasFile: Boolean(selected),
      fileName: selected?.name,
      fileType: selected?.type,
      fileSize: selected?.size,
      lastModified: selected?.lastModified,
    })
    if (!selected) return

    const inferredMime = inferMimeType(selected)
    diagnosticsLog.log('fileDetected', {
      fileName: selected.name,
      fileType: selected.type,
      fileTypeInferred: inferredMime,
      fileSize: selected.size,
      lastModified: selected.lastModified,
    })
    if (!isDocumentMimeAllowed(inferredMime)) {
      diagnosticsLog.log('fileRejectedClient', {
        fileName: selected.name,
        fileType: selected.type,
        fileTypeInferred: inferredMime,
        reason: 'mime_not_allowed',
      })
      setError(
        `Tipo de archivo no permitido (${selected.name}): ${inferredMime || 'no se pudo determinar el tipo'}. ` +
          'Formatos aceptados: PDF, Word, Excel, PNG, JPG, WEBP, HEIC.',
      )
      setSelectedFile(null)
      setFileStageStatus('idle')
      return
    }

    setSelectedFile(selected)
    setFileStageStatus('selected')
  }

  // Botón explícito "Subir archivo" — recién acá se crea la fila pending
  // (si hace falta) y se sube a Storage. Los metadatos del Paso 1 ya están
  // validados y confirmados en este punto. La fila queda con
  // storage_path='pending' hasta que updateDocumentStoragePath confirma —
  // invisible en listados normales mientras tanto, y sin disparar ninguna
  // notificación hasta ese momento (ver migración 0056).
  async function handleUploadFile() {
    if (!selectedFile) return
    setError(null)
    setFileLostNotice(null)
    diagnosticsLog.log('uploadButtonClicked', { fileName: selectedFile.name })

    setFileStageStatus('uploading')
    try {
      const targetId = isEditing ? id! : pendingDocumentId
      let createdId: string | null = null
      if (!targetId) {
        diagnosticsLog.log('pendingCreateStart', { title: title.trim(), category: category.trim(), scope: currentScopeInput() })
        let created
        try {
          created = await createDocument({
            title: title.trim(),
            category: category.trim(),
            description: description || null,
            ...currentScopeInput(),
            folder_id: folderIdFromQuery || null,
            uploaded_by_profile_id: currentProfile?.id ?? null,
          })
        } catch (err) {
          diagnosticsLog.log('pendingCreateFail', serializeError(err))
          throw err
        }
        diagnosticsLog.log('pendingCreateSuccess', { documentId: created.id })
        createdId = created.id
        setPendingDocumentId(created.id)
        if (!isEditing) {
          saveDraft(folderIdFromQuery, currentDraft('file', created.id, false))
        }
      } else {
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
      diagnosticsLog.log('uploadStart', {
        documentId: finalId,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
      })
      let path: string
      try {
        path = await uploadDocumentFile(finalId, selectedFile)
      } catch (err) {
        diagnosticsLog.log('uploadFail', serializeError(err))
        throw err
      }
      diagnosticsLog.log('uploadSuccess', { documentId: finalId, storagePath: path })

      diagnosticsLog.log('confirmDocumentStart', { documentId: finalId, storagePath: path })
      try {
        await updateDocumentStoragePath(finalId, path)
      } catch (err) {
        diagnosticsLog.log('confirmDocumentFail', serializeError(err))
        throw err
      }
      diagnosticsLog.log('confirmDocumentSuccess', { documentId: finalId })
      diagnosticsLog.log('notificationCreated', { documentId: finalId, note: 'Disparada por trigger de base al confirmar storage_path.' })
      if (!isEditing) {
        saveDraft(folderIdFromQuery, currentDraft('file', finalId, true))
      }
      setExistingStoragePath(path)
      setFileStageStatus('uploaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir el archivo. Probá de nuevo.')
      setFileStageStatus('failed')
    }
  }

  function handleChooseDifferentFile() {
    setSelectedFile(null)
    setFileStageStatus('idle')
    setError(null)
    fileInputRef.current?.click()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (fileStageStatus === 'uploading') {
      setError('Esperá a que termine de subirse el archivo antes de finalizar.')
      return
    }
    if (fileStageStatus !== 'uploaded') {
      setError(isEditing ? 'Subí un archivo antes de finalizar.' : 'Elegí y subí un archivo antes de finalizar.')
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
            <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-card-soft)', border: '1px solid var(--color-border)' }}>
              <p style={{ margin: 0, fontSize: 13 }}>{recoveryNotice}</p>
            </div>
          )}
          {fileLostNotice && (
            <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-card-soft)', border: '1px solid var(--color-warning)' }}>
              <p style={{ margin: 0, fontSize: 13 }}>{fileLostNotice}</p>
            </div>
          )}

          {/* Input real, con ref estable — nunca se le pone key dinámica ni
              se desmonta condicionalmente, y no tiene "capture" (que fuerza
              la cámara directamente, sin dejar elegir de galería/archivos —
              comportamiento distinto y más restrictivo del que se pidió) ni
              "accept" restrictivo a nivel de picker (la validación real de
              tipo pasa en handleFileInputChange, con mensaje claro si
              rechaza). Se mantiene oculto visualmente con un estilo que no
              lo saca del flujo de accesibilidad/interacción (no display:none
              ni un truco que algunos Android manejan mal) — el botón visible
              de abajo es el único punto de interacción real. */}
          <input
            ref={fileInputRef}
            id="file"
            type="file"
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
            tabIndex={-1}
            aria-hidden="true"
            disabled={fileStageStatus === 'uploading'}
            onClick={() => diagnosticsLog.log('nativeFileInputClick', {})}
            onChange={(e) => {
              const files = e.target.files
              const selected = files?.[0] ?? null
              handleFileInputChange(selected, files?.length ?? 0)
              e.target.value = ''
            }}
          />

          <div className="field">
            <label>{isEditing ? 'Reemplazar archivo (opcional)' : 'Archivo'}</label>

            {fileStageStatus === 'idle' && (
              <button type="button" className="btn btn-outlined btn-block" onClick={handleSelectFileButtonClick}>
                Seleccionar archivo
              </button>
            )}

            {(fileStageStatus === 'selected' || fileStageStatus === 'failed') && selectedFile && (
              <>
                <div style={{ fontSize: 12, padding: '8px 0', color: 'var(--color-text-secondary)' }}>
                  <div>
                    Archivo seleccionado: <strong>{selectedFile.name}</strong>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {formatBytes(selectedFile.size)} · {fileExtension(selectedFile.name)} · listo para subir
                  </div>
                </div>
                {fileStageStatus === 'failed' && error && <p className="field-error">No se pudo subir el archivo: {error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void handleUploadFile()}>
                    {fileStageStatus === 'failed' ? 'Reintentar subida' : 'Subir archivo'}
                  </button>
                  <button type="button" className="btn btn-outlined" onClick={handleChooseDifferentFile}>
                    Elegir otro
                  </button>
                </div>
              </>
            )}

            {fileStageStatus === 'uploading' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Subiendo archivo{selectedFile ? `: ${selectedFile.name}` : '…'}
              </p>
            )}

            {fileStageStatus === 'uploaded' && (
              <>
                <p style={{ fontSize: 12, color: 'var(--color-success, #16a34a)', fontWeight: 600, marginBottom: 8 }}>
                  ✓ Archivo subido correctamente{selectedFile ? `: ${selectedFile.name}` : ''}
                </p>
                <button type="button" className="btn btn-outlined" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleChooseDifferentFile}>
                  Reemplazar archivo
                </button>
              </>
            )}

            {fileStageStatus === 'idle' && !selectedFile && isEditing && existingStoragePath && existingStoragePath !== 'pending' && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Ya tiene un archivo cargado. Elegí uno nuevo solo si querés reemplazarlo (el actual queda
                en el historial de versiones).
              </p>
            )}
          </div>

          {error && fileStageStatus !== 'failed' && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || fileStageStatus !== 'uploaded'}>
            {submitting ? 'Finalizando…' : 'Finalizar'}
          </button>
          {fileStageStatus !== 'uploaded' && (
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
