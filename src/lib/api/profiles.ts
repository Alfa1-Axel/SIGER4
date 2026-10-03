import { supabase } from '../supabaseClient'
import type { Profile, UserRole, UserScope } from '../../types/database'

export interface CurrentUserContext {
  profile: Profile
  roles: UserRole[]
  scopes: UserScope[]
  // Departamentos de los que el usuario es coordinador en la sección
  // Departamentos (departments.coordinator_profile_id). Es la única fuente:
  // da acceso a los Avales regionales de esos departamentos (ver 0097).
  coordinatedDepartmentIds: string[]
  // Departamentos donde es integrante con cuenta (department_members): con
  // el coordinador, ven y cargan los informes del departamento (0098).
  memberDepartmentIds: string[]
}

export async function fetchCurrentUserContext(authUserId: string): Promise<CurrentUserContext | null> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .single()

  if (profileError || !profile) {
    return null
  }

  const [{ data: roles }, { data: scopes }, { data: coordinated }, { data: memberships }] = await Promise.all([
    supabase.from('user_roles').select('*').eq('profile_id', profile.id),
    supabase.from('user_scopes').select('*').eq('profile_id', profile.id),
    supabase.from('departments').select('id').eq('coordinator_profile_id', profile.id),
    supabase.from('department_members').select('department_id').eq('profile_id', profile.id),
  ])

  return {
    profile: profile as Profile,
    roles: (roles ?? []) as UserRole[],
    scopes: (scopes ?? []) as UserScope[],
    coordinatedDepartmentIds: (coordinated ?? []).map((d) => (d as { id: string }).id),
    memberDepartmentIds: (memberships ?? []).map((m) => (m as { department_id: string }).department_id),
  }
}
