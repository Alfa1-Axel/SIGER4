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
