import { supabase } from '../supabaseClient'
import { updateVersioned } from '../concurrency'
import type {
  Department,
  DepartmentDirectoryEntry,
  DepartmentManualMember,
  DepartmentMember,
  NotificationType,
  Profile,
  VisibleDepartment,
} from '../../types/database'

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function fetchDepartmentById(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).single()
  if (error) return null
  return data as Department
}

// Departamentos que el usuario puede ver (0103), con el coordinador, la
// cantidad de integrantes y su relación con cada uno.
export async function fetchVisibleDepartments(): Promise<VisibleDepartment[]> {
  const { data, error } = await supabase.rpc('list_visible_departments')
  if (error) throw error
  return (data ?? []) as VisibleDepartment[]
}

// Integrantes con cuenta, con nombre, cuartel y contacto, aunque sean de otro
// cuartel (profiles está limitado por cuartel). Vacío si no puede verlo.
export async function fetchDepartmentDirectory(departmentId: string): Promise<DepartmentDirectoryEntry[]> {
  const { data, error } = await supabase.rpc('department_member_directory', { p_department_id: departmentId })
  if (error) throw error
  return (data ?? []) as DepartmentDirectoryEntry[]
}

// Aviso a todo el departamento: una notificación personal por integrante.
// Devuelve a cuántas personas llegó.
export async function notifyDepartment(departmentId: string, type: NotificationType, title: string, body: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('notify_department', {
    p_department_id: departmentId,
    p_type: type,
    p_title: title,
    p_body: body,
  })
  if (error) throw error
  return (data as number | null) ?? 0
}

// De estos perfiles, cuáles coordinan algún departamento (0103). Solo responde
// por perfiles de los cuarteles del usuario, o para Informática: lo usan las
// pantallas del Jefe de Cuerpo Activo, que no gestiona coordinadores.
export async function fetchCoordinatingProfileIds(profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return []
  const { data, error } = await supabase.rpc('coordinating_profile_ids', { p_profile_ids: profileIds })
  if (error) throw error
  return ((data ?? []) as (string | { coordinating_profile_ids: string })[]).map((row) =>
    typeof row === 'string' ? row : row.coordinating_profile_ids,
  )
}

// Departamentos de una persona (ficha de usuario). Informática ve todos.
export async function fetchProfileDepartmentIds(profileId: string): Promise<{ coordinated: string[]; memberOf: string[] }> {
  const [coordinated, memberships] = await Promise.all([
    supabase.from('departments').select('id').eq('coordinator_profile_id', profileId),
    supabase.from('department_members').select('department_id').eq('profile_id', profileId),
  ])
  if (coordinated.error) throw coordinated.error
  if (memberships.error) throw memberships.error
  return {
    coordinated: (coordinated.data ?? []).map((d) => (d as { id: string }).id),
    memberOf: (memberships.data ?? []).map((m) => (m as { department_id: string }).department_id),
  }
}

// Coordinador de un departamento: lo asigna solo Informática (0097). null lo
// deja sin coordinador.
export async function setDepartmentCoordinator(departmentId: string, profileId: string | null): Promise<void> {
  const { error } = await supabase.from('departments').update({ coordinator_profile_id: profileId }).eq('id', departmentId)
  if (error) throw error
}

export async function removeDepartmentMembership(departmentId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('department_members').delete().eq('department_id', departmentId).eq('profile_id', profileId)
  if (error) throw error
}

// Aplica coordinación e integración de una persona en varios departamentos
// (alta y ficha de usuario). Solo toca los departamentos que cambian.
export async function applyProfileDepartments(
  profileId: string,
  current: { coordinated: string[]; memberOf: string[] },
  next: { coordinated: string[]; memberOf: string[] },
): Promise<void> {
  for (const id of next.coordinated.filter((d) => !current.coordinated.includes(d))) await setDepartmentCoordinator(id, profileId)
  for (const id of current.coordinated.filter((d) => !next.coordinated.includes(d))) await setDepartmentCoordinator(id, null)
  for (const id of next.memberOf.filter((d) => !current.memberOf.includes(d))) await addDepartmentMember(id, profileId)
  for (const id of current.memberOf.filter((d) => !next.memberOf.includes(d))) await removeDepartmentMembership(id, profileId)
}

// Departamentos que coordina un perfil (departments.coordinator_profile_id).
// Ser coordinador es lo que da acceso a los avales del departamento en
// Escuela (0097). Desde 0103 departments solo devuelve los departamentos que
// el usuario puede ver.
export async function fetchCoordinatedDepartments(profileId: string): Promise<Pick<Department, 'id' | 'name'>[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name')
    .eq('coordinator_profile_id', profileId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Pick<Department, 'id' | 'name'>[]
}

export interface DepartmentInput {
  name: string
  description?: string | null
  coordinator_profile_id?: string | null
  contact_info?: string | null
  is_active?: boolean
  created_by_profile_id?: string | null
}

export async function createDepartment(input: DepartmentInput): Promise<Department> {
  const { data, error } = await supabase.from('departments').insert(input).select('*').single()
  if (error) throw error
  return data as Department
}

export async function updateDepartment(id: string, input: Partial<DepartmentInput>, expectedVersion?: number | null): Promise<Department> {
  return updateVersioned<Department>('departments', id, input, expectedVersion)
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}

export interface DepartmentMemberWithProfile extends DepartmentMember {
  profile: Profile
}

export async function fetchDepartmentMembers(departmentId: string): Promise<DepartmentMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profile:profiles(*)')
    .eq('department_id', departmentId)
  if (error) throw error
  return (data ?? []) as unknown as DepartmentMemberWithProfile[]
}

export async function addDepartmentMember(departmentId: string, profileId: string): Promise<DepartmentMember> {
  const { data, error } = await supabase
    .from('department_members')
    .insert({ department_id: departmentId, profile_id: profileId })
    .select('*')
    .single()
  if (error) throw error
  return data as DepartmentMember
}

export async function removeDepartmentMember(memberRowId: string): Promise<void> {
  const { error } = await supabase.from('department_members').delete().eq('id', memberRowId)
  if (error) throw error
}

export interface DepartmentManualMemberInput {
  department_id: string
  first_name: string
  last_name: string
  station_id?: string | null
  role_function?: string | null
  contact_info?: string | null
  is_active?: boolean
  observations?: string | null
  linked_profile_id?: string | null
  created_by_profile_id?: string | null
}

export async function fetchDepartmentManualMembers(departmentId: string): Promise<DepartmentManualMember[]> {
  const { data, error } = await supabase
    .from('department_manual_members')
    .select('*')
    .eq('department_id', departmentId)
    .order('last_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as DepartmentManualMember[]
}

export async function createDepartmentManualMember(input: DepartmentManualMemberInput): Promise<DepartmentManualMember> {
  const { data, error } = await supabase.from('department_manual_members').insert(input).select('*').single()
  if (error) throw error
  return data as DepartmentManualMember
}

export async function updateDepartmentManualMember(id: string, input: Partial<DepartmentManualMemberInput>, expectedVersion?: number | null): Promise<DepartmentManualMember> {
  return updateVersioned<DepartmentManualMember>('department_manual_members', id, input, expectedVersion)
}
