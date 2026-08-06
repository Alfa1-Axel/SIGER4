// SIGER4 - Carga de archivo de Documentos, vía compatible mobile.
//
// Causa real confirmada (ver DEPLOYMENT.md, sección 30-31): en el celular
// Android donde la carga normal fallaba, ni siquiera un evento "click" nativo
// llegaba al <input type="file"> cuando ese input vivía dentro de una ruta
// de React (con o sin AppShell, con o sin setState en los handlers) —
// mientras que el mismo tipo de input, en una página sin React
// (/raw-upload-test.html), sí lo recibía y devolvía el archivo real sin
// problema. En vez de seguir buscando por qué React/esa ruta puntual no deja
// pasar el toque, esta página ofrece una vía de carga alternativa: mismo
// patrón de input que raw-upload-test.html, pero como un segundo entry point
// real de Vite (ver vite.config.ts) — así puede importar el cliente real de
// Supabase y las funciones ya auditadas de storage.ts/documents.ts sin
// duplicar lógica sensible (MIME, límites, paths seguros, RLS), sin tocar
// React/AppShell/React Router en ningún punto de este archivo.
import { supabase } from '../lib/supabaseClient'
import { createDocument, updateDocument, updateDocumentStoragePath } from '../lib/api/documents'
import { inferMimeType, isDocumentMimeAllowed, uploadDocumentFile } from '../lib/api/storage'

type DocScopeTarget = 'region' | 'subsede' | 'station' | 'profile'
type FormStep = 'metadata' | 'file'

// Misma forma exacta que DocumentDraft en DocumentoFormPage.tsx — esta
// página LEE la misma clave de sessionStorage que ya escribe el formulario
// de React al llegar al Paso 2 (ver draftStorageKey allá), no inventa un
// segundo mecanismo de borrador paralelo.
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
  pendingDocumentId: string | null
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
    // sessionStorage puede fallar (modo privado, cuota agotada) — no bloquea la carga.
  }
}

function clearDraft(folderIdFromQuery: string | null): void {
  try {
    sessionStorage.removeItem(draftStorageKey(folderIdFromQuery))
  } catch {
    // Idem saveDraft.
  }
}

function returnUrl(folderIdFromQuery: string | null): string {
  return folderIdFromQuery ? `/documentos/carpetas/${folderIdFromQuery}` : '/documentos/carpetas/general'
}

const logEl = document.getElementById('log') as HTMLPreElement
const draftInfoEl = document.getElementById('draftInfo') as HTMLDivElement
const uploadSectionEl = document.getElementById('uploadSection') as HTMLDivElement
const resultSectionEl = document.getElementById('resultSection') as HTMLDivElement
const sessionErrorEl = document.getElementById('sessionError') as HTMLDivElement
const desktopWarningEl = document.getElementById('desktopWarning') as HTMLDivElement
const fileInputEl = document.getElementById('fileInput') as HTMLInputElement
const fileStatusEl = document.getElementById('fileStatus') as HTMLDivElement
const uploadBtnEl = document.getElementById('uploadBtn') as HTMLButtonElement
const cancelBtnEl = document.getElementById('cancelBtn') as HTMLButtonElement

const entries: string[] = []

function log(label: string, detail?: Record<string, unknown>) {
  const stamp = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0')
  let line = '[' + stamp + '] ' + label
  if (detail) {
    try {
      line += '\n' + JSON.stringify(detail, null, 2)
    } catch {
      line += '\n(no serializable)'
    }
  }
  entries.push(line)
  logEl.textContent = entries.join('\n\n')
}

function serializeUploadError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const extra = err as Error & { code?: string; details?: string; hint?: string; status?: number; statusCode?: string }
    return {
      message: extra.message,
      name: extra.name,
      code: extra.code,
      details: extra.details,
      hint: extra.hint,
      status: extra.status,
      statusCode: extra.statusCode,
    }
  }
  return { raw: String(err) }
}

async function fetchBuildInfo() {
  try {
    const res = await fetch('/build-info.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('build-info.json not ok')
    const info = (await res.json()) as { version: string; time: string }
    const versionEl = document.getElementById('buildVersion')
    const timeEl = document.getElementById('buildTime')
    if (versionEl) versionEl.textContent = info.version
    if (timeEl) timeEl.textContent = new Date(info.time).toLocaleString('es-AR')
  } catch (err) {
    log('build-info ERROR', { message: String(err) })
  }
}

async function main() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  if (!isMobile) desktopWarningEl.style.display = 'block'

  log('page-load', { href: window.location.href, userAgent: navigator.userAgent, isMobile })
  void fetchBuildInfo()

  const params = new URLSearchParams(window.location.search)
  const folderIdFromQuery = params.get('folderId')

  // Reutiliza la sesión ya persistida en localStorage por el cliente real de
  // Supabase (persistSession: true en supabaseClient.ts) — no hay login
  // propio acá, ni service_role, ni ninguna clave que no sea la anon pública
  // que ya usa el resto del frontend. Si no hay sesión válida, no se puede
  // seguir: se corta acá con un mensaje explícito en vez de intentar algo
  // que RLS va a rechazar de todos modos.
  const { data: sessionData, error: sessionErrorObj } = await supabase.auth.getSession()
  log('sessionCheck', { hasSession: Boolean(sessionData.session), error: sessionErrorObj?.message ?? null })
  if (!sessionData.session) {
    sessionErrorEl.style.display = 'block'
    draftInfoEl.textContent = 'No hay sesión activa.'
    return
  }
  const currentProfileId = sessionData.session.user.id

  const draft = loadDraft(folderIdFromQuery)
  log('draftLoad', { found: Boolean(draft), folderIdFromQuery, wizardStep: draft?.wizardStep ?? null, pendingDocumentId: draft?.pendingDocumentId ?? null })

  if (!draft) {
    draftInfoEl.innerHTML =
      'No encontramos los datos del documento en este navegador. ' +
      'Volvé al formulario de Documentos en SIGER4, completá el Paso 1 y elegí ' +
      '"Cargar archivo desde modo compatible mobile" desde ahí — esta página necesita ' +
      'que ese paso se haya hecho primero en la misma pestaña.'
    return
  }

  draftInfoEl.innerHTML =
    '<div class="row"><b>Título:</b> ' + escapeHtml(draft.title) + '</div>' +
    '<div class="row"><b>Tipo:</b> ' + escapeHtml(draft.category) + '</div>' +
    '<div class="row"><b>Alcance:</b> ' + escapeHtml(draft.scopeTarget) + '</div>'

  uploadSectionEl.style.display = 'block'

  let selectedFile: File | null = null

  fileInputEl.addEventListener('click', () => log('click'))
  fileInputEl.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files
    const n = files ? files.length : 0
    if (!files || !n) {
      fileStatusEl.innerHTML = '<span class="bad">change disparó, pero sin archivos (files.length = 0)</span>'
      log('change — SIN ARCHIVO', { filesLength: 0 })
      selectedFile = null
      uploadBtnEl.disabled = true
      return
    }
    const f = files[0]
    log('change — ARCHIVO DETECTADO', { filesLength: n, name: f.name, type: f.type || '(vacío)', size: f.size, lastModified: f.lastModified })

    const inferredMime = inferMimeType(f)
    if (!isDocumentMimeAllowed(inferredMime)) {
      fileStatusEl.innerHTML =
        '<span class="bad">Tipo de archivo no permitido (' +
        escapeHtml(f.name) +
        '): ' +
        escapeHtml(inferredMime || 'no se pudo determinar el tipo') +
        '. Formatos aceptados: PDF, Word, Excel, PNG, JPG, WEBP, HEIC.</span>'
      log('fileRejectedClient', { name: f.name, type: f.type, inferredMime })
      selectedFile = null
      uploadBtnEl.disabled = true
      return
    }

    selectedFile = f
    fileStatusEl.innerHTML =
      '<span class="ok">Archivo listo:</span> ' + escapeHtml(f.name) + ' · ' + inferredMime + ' · ' + formatBytes(f.size)
    uploadBtnEl.disabled = false
  })

  uploadBtnEl.addEventListener('click', () => {
    void handleUpload()
  })
  cancelBtnEl.addEventListener('click', () => {
    window.location.href = returnUrl(folderIdFromQuery)
  })

  async function handleUpload() {
    if (!selectedFile) return
    const file = selectedFile
    uploadBtnEl.disabled = true
    fileInputEl.disabled = true
    log('uploadButtonClicked', { fileName: file.name })

    try {
      let documentId = draft!.pendingDocumentId
      if (!documentId) {
        log('pendingCreateStart', { title: draft!.title, category: draft!.category })
        const created = await createDocument({
          title: draft!.title.trim(),
          category: draft!.category.trim(),
          description: draft!.description || null,
          region_id: draft!.scopeTarget === 'region' ? draft!.regionId : null,
          subsede_id: draft!.scopeTarget === 'subsede' ? draft!.subsedeId : null,
          station_id: draft!.scopeTarget === 'station' ? draft!.stationId : null,
          profile_id: draft!.scopeTarget === 'profile' ? draft!.profileId : null,
          folder_id: draft!.folderId,
          uploaded_by_profile_id: currentProfileId,
        })
        documentId = created.id
        log('pendingCreateSuccess', { documentId })
        saveDraft(folderIdFromQuery, { ...draft!, pendingDocumentId: documentId })
      }

      log('uploadStart', { documentId, fileName: file.name, fileType: file.type, fileSize: file.size })
      const path = await uploadDocumentFile(documentId, file)
      log('uploadSuccess', { documentId, storagePath: path })

      log('confirmDocumentStart', { documentId, storagePath: path })
      await updateDocumentStoragePath(documentId, path)
      log('confirmDocumentSuccess', { documentId })
      log('notificationCreated', { documentId, note: 'Disparada por trigger de base al confirmar storage_path.' })

      // Mismo alcance final que "Finalizar" en DocumentoFormPage.tsx: los
      // metadatos del Paso 1 ya están validados, solo hace falta re-guardarlos
      // por si cambiaron entre que se armó el borrador y ahora (no debería,
      // pero es la misma llamada que ya hacía el formulario real).
      await updateDocument(documentId, {
        title: draft!.title.trim(),
        category: draft!.category.trim(),
        description: draft!.description || null,
        region_id: draft!.scopeTarget === 'region' ? draft!.regionId : null,
        subsede_id: draft!.scopeTarget === 'subsede' ? draft!.subsedeId : null,
        station_id: draft!.scopeTarget === 'station' ? draft!.stationId : null,
        profile_id: draft!.scopeTarget === 'profile' ? draft!.profileId : null,
      })
      log('finalSave', { documentId })
      clearDraft(folderIdFromQuery)

      uploadSectionEl.style.display = 'none'
      resultSectionEl.style.display = 'block'
      resultSectionEl.innerHTML =
        '<p class="ok" style="margin: 0 0 12px">✓ Documento cargado correctamente.</p>' +
        '<button type="button" id="backBtn">Volver a Documentos</button>'
      document.getElementById('backBtn')?.addEventListener('click', () => {
        window.location.href = returnUrl(folderIdFromQuery)
      })
    } catch (err) {
      log('uploadFail', serializeUploadError(err))
      fileStatusEl.innerHTML = '<span class="bad">No pudimos subir el archivo: ' + escapeHtml(err instanceof Error ? err.message : String(err)) + '</span>'
      uploadBtnEl.disabled = false
      fileInputEl.disabled = false
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function escapeHtml(value: string): string {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

void main()
