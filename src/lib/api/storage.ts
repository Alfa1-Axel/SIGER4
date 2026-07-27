import { supabase } from '../supabaseClient'

// Convención de paths: "<id>/<archivo>" — el primer segmento del path es lo
// que las políticas de Storage usan (storage.foldername(name)[1]) para
// resolver a qué cuartel/perfil pertenece el archivo.

export async function uploadStationMedia(stationId: string, file: File): Promise<string> {
  const path = `${stationId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('station-media').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('station-media').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const path = `${profileId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
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
