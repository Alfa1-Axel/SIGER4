import { supabase } from '../supabaseClient'

// Convención de paths: "<id>/<archivo>" — el primer segmento del path es lo
// que las políticas de Storage usan (storage.foldername(name)[1]) para
// resolver a qué cuartel/perfil pertenece el archivo.

// Límites de subida (revisión 2026-07, ver auditoría de seguridad). El
// bucket también tiene su propio file_size_limit/allowed_mime_types server-
// side (ver migración 0033_storage_hardening.sql) — estos chequeos client-
// side son solo para dar un mensaje de error inmediato y legible, nunca la
// única línea de defensa.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024 // 20 MB
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
// Coincide con el whitelist server-side real del bucket "documents" (ver
// migración 0055_documents_mime_mobile.sql) — heic/heif son el formato por
// defecto de fotos en iPhone, webp el de capturas de pantalla en Android
// moderno; sin esto, elegir una foto desde la galería del celular fallaba
// silenciosamente (Storage lo rechazaba server-side con un error poco claro).
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
])

// Selectores de archivo de Android (Google Files, adjuntos compartidos desde
// WhatsApp/Drive/Gmail, algunos gestores de almacenamiento) frecuentemente
// devuelven file.type VACÍO, o peor, "application/octet-stream" — un MIME
// genérico real pero inútil, no vacío — para archivos Word/PDF perfectamente
// válidos. Confiar ciegamente en file.type cuando no está vacío (como hacía
// la versión anterior) rechazaba esos archivos client-side con un mensaje de
// "tipo no permitido: application/octet-stream", que en la práctica es la
// causa concreta de que Word/PDF "no subieran" desde el selector de archivos
// de Android — el navegador ya traía un tipo, solo que era el genérico, así
// que el fallback por extensión (que solo se activaba con tipo vacío) nunca
// se disparaba. Ahora la extensión manda siempre que el tipo reportado sea
// vacío o uno de los genéricos conocidos que ningún picker debería mandar
// para estos formatos. Storage igual vuelve a validar el MIME real
// server-side (0033/0055), así que esto nunca afloja la validación real,
// solo evita bloquear client-side un archivo que después sube bien.
const GENERIC_UNRELIABLE_MIME_TYPES = new Set(['application/octet-stream', 'application/binary', 'application/unknown', ''])

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

// Exportada (no solo de uso interno) para que la instrumentación de
// diagnóstico de DocumentoFormPage.tsx pueda mostrar, ANTES de intentar
// subir, el MIME real reportado por el navegador vs. el que esta app va a
// usar realmente para validar/enviar — el dato concreto que hace falta para
// diagnosticar por qué un archivo puntual falla en un dispositivo puntual.
export function inferMimeType(file: File): string {
  if (!GENERIC_UNRELIABLE_MIME_TYPES.has(file.type)) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TO_MIME[ext] ?? file.type
}

// Expone el whitelist real de "documents" para que el diagnóstico pueda
// mostrar si un archivo va a ser rechazado client-side ANTES de intentarlo,
// sin duplicar la lista en DocumentoFormPage.tsx.
export function isDocumentMimeAllowed(mimeType: string): boolean {
  return DOCUMENT_MIME_TYPES.has(mimeType)
}

// Devuelve el MIME resuelto (real o inferido por extensión) para que el
// caller lo pase explícito como contentType del upload — importante porque
// supabase-js NO usa este valor para decidir qué mandar al servidor cuando
// el body es un File/Blob: arma un FormData y el navegador usa el file.type
// ORIGINAL (el genérico/incorrecto) como Content-Type real de la parte
// multipart. Si no se fuerza explícito, Storage server-side seguiría viendo
// "application/octet-stream" y rechazando el archivo aunque esta validación
// client-side ya lo haya aprobado por su extensión — exactamente la causa
// real de que Word/PDF elegidos desde ciertos selectores de Android
// fallaran igual después de ampliar el whitelist de tipos permitidos.
function assertFileAllowed(file: File, allowedTypes: Set<string>, maxBytes: number): string {
  const mimeType = inferMimeType(file)
  if (!allowedTypes.has(mimeType)) {
    throw new Error(
      `Tipo de archivo no permitido${file.name ? ` (${file.name})` : ''}: ${mimeType || 'no se pudo determinar el tipo'}. ` +
        'Formatos aceptados: PDF, Word, Excel, PNG, JPG, WEBP, HEIC.',
    )
  }
  if (file.size > maxBytes) {
    throw new Error(`El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB).`)
  }
  return mimeType
}

// Sanitiza el nombre original del archivo para usarlo como parte de un path
// de Storage seguro: quita cualquier segmento de directorio (path traversal
// vía "../" o nombres con "/"), se queda solo con caracteres ASCII
// alfanuméricos + punto/guion/guion bajo, y acota la longitud. Nunca se debe
// usar file.name crudo en un path — puede traer "../", separadores, unicode
// raro o simplemente ser absurdamente largo.
function sanitizeFileName(originalName: string): string {
  const baseName = originalName.split(/[/\\]/).pop() ?? 'archivo'
  const extMatch = baseName.match(/\.[a-zA-Z0-9]{1,10}$/)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName
  const safeName = nameWithoutExt
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${safeName || 'archivo'}${ext}`
}

function buildSafePath(folderId: string, file: File): string {
  return `${folderId}/${Date.now()}-${sanitizeFileName(file.name)}`
}

// Extrae el path dentro del bucket a partir de una URL pública de Supabase
// Storage (".../object/public/<bucket>/<path>"). Devuelve null si la URL no
// pertenece a ese bucket (por ejemplo, un logo institucional fijo servido
// desde /public en vez de Storage) — nunca hay que intentar borrar algo que
// no se subió a este bucket.
function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length))
}

// Borra el archivo anterior de un bucket público dado su URL guardada. Nunca
// lanza: un fallo al borrar no debe bloquear el guardado del nuevo archivo,
// solo se loguea como advertencia (puede quedar un archivo huérfano, pero
// eso es preferible a romper la actualización del usuario).
async function deletePublicFileByUrl(bucket: string, url: string | null | undefined): Promise<void> {
  if (!url) return
  const path = extractStoragePath(url, bucket)
  if (!path) return
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.warn(`[SIGER4] No se pudo borrar el archivo anterior de "${bucket}" (${path}):`, error.message)
}

export async function uploadStationMedia(stationId: string, file: File): Promise<string> {
  const contentType = assertFileAllowed(file, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES)
  const path = buildSafePath(stationId, file)
  const { error } = await supabase.storage.from('station-media').upload(path, file, { upsert: true, contentType })
  if (error) throw error
  const { data } = supabase.storage.from('station-media').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteStationMedia(previousUrl: string | null | undefined): Promise<void> {
  await deletePublicFileByUrl('station-media', previousUrl)
}

export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const contentType = assertFileAllowed(file, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES)
  const path = buildSafePath(profileId, file)
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteAvatar(previousUrl: string | null | undefined): Promise<void> {
  await deletePublicFileByUrl('avatars', previousUrl)
}

// El bucket "documents" no es publico: se sube con el id real del documento
// (ya creado en la tabla) como carpeta, y se devuelve el storage_path (no una
// URL publica) — para descargar/ver el archivo hay que pedir una signed URL.
export async function uploadDocumentFile(documentId: string, file: File): Promise<string> {
  const contentType = assertFileAllowed(file, DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES)
  const path = buildSafePath(documentId, file)
  const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true, contentType })
  if (error) throw error
  return path
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60 * 10)
  if (error) throw new Error('El archivo no está disponible o fue eliminado del almacenamiento.')
  return data.signedUrl
}
