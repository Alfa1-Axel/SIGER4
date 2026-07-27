import { supabase } from '../supabaseClient'
import type { Course, CourseStatus, Profile, Station } from '../../types/database'

export async function fetchCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from('courses').select('*').order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Course[]
}

export async function fetchCourseById(id: string): Promise<Course | null> {
  const { data, error } = await supabase.from('courses').select('*').eq('id', id).single()
  if (error) return null
  return data as Course
}

export interface CourseInput {
  region_id: string
  title: string
  category: string
  status?: CourseStatus
  start_date?: string | null
  end_date?: string | null
  instructor_profile_id?: string | null
  hours?: number | null
  days?: number | null
  attendees_count?: number | null
  speakers?: string | null
}

export async function createCourse(input: CourseInput): Promise<Course> {
  const { data, error } = await supabase.from('courses').insert(input).select('*').single()
  if (error) throw error
  return data as Course
}

export async function updateCourse(id: string, input: Partial<CourseInput>): Promise<Course> {
  const { data, error } = await supabase.from('courses').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Course
}

// Candidatos a instructor: perfiles con rol director_escuela o instructor.
export async function fetchInstructorCandidates(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('profile_id, role, profiles(*)')
    .in('role', ['director_escuela', 'instructor'])
  if (error) throw error

  const seen = new Set<string>()
  const profiles: Profile[] = []
  for (const row of (data ?? []) as unknown as { profiles: Profile | null }[]) {
    const profile = row.profiles
    if (profile && !seen.has(profile.id)) {
      seen.add(profile.id)
      profiles.push(profile)
    }
  }
  return profiles
}

export async function fetchParticipatingStations(courseId: string): Promise<Station[]> {
  const { data, error } = await supabase
    .from('course_stations')
    .select('station_id, stations(*)')
    .eq('course_id', courseId)
  if (error) throw error

  return (data ?? [])
    .map((row: unknown) => (row as { stations: Station | null }).stations)
    .filter((s): s is Station => s !== null)
}

// Reemplaza por completo los cuarteles participantes de un curso: borra todas
// las filas existentes y vuelve a insertar el set actual. Aceptable para listas
// de baja cardinalidad como cuarteles participantes de una actividad.
export async function setParticipatingStations(courseId: string, stationIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('course_stations').delete().eq('course_id', courseId)
  if (deleteError) throw deleteError
  if (stationIds.length === 0) return
  const { error: insertError } = await supabase
    .from('course_stations')
    .insert(stationIds.map((station_id) => ({ course_id: courseId, station_id })))
  if (insertError) throw insertError
}
