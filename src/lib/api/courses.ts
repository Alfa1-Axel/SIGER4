import { supabase } from '../supabaseClient'
import type { Course, CourseStatus, Profile } from '../../types/database'

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
