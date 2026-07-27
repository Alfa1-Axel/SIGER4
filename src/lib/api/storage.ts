import { supabase } from '../supabaseClient'

// Convención de paths: "<id>/<archivo>" — el primer segmento del path es lo
// que las políticas de Storage usan (storage.foldername(name)[1]) para
// resolver a qué cuartel/perfil pertenece el archivo.

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
  const path = `${stationId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('station-media').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('station-media').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteStationMedia(previousUrl: string | null | undefined): Promise<void> {
  await deletePublicFileByUrl('station-media', previousUrl)
}

export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const path = `${profileId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
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
  const path = `${documentId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
  if (error) throw error
  return path
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
