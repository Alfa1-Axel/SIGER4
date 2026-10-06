import { supabase } from '../supabaseClient'
import type { Profile, UserRole, UserScope } from '../../types/database'

export interface CurrentUserContext {
  profile: Profile
  roles: UserRole[]
  scopes: UserScope[]
  // Departamentos que coordina: figura como coordinador
  // (departments.coordinator_profile_id) y tiene el rol Coordinador de
  // Departamento (0106). Da acceso a sus informes y a sus Avales regionales.
  coordinatedDepartmentIds: string[]
  // Departamentos de los que es miembro: figura en department_members y tiene
  // el rol Miembro de Departamento (0106).
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

  // Rol + departamento (0106): figurar en un departamento sin el rol
  // Coordinador/Miembro de Departamento no da acceso. Informática no lo necesita.
  const roleKeys = ((roles ?? []) as UserRole[]).map((r) => r.role)
  const isAdmin = roleKeys.includes('informatica_r4') || roleKeys.includes('integrante_informatica')
  const coordinatesWithRole = isAdmin || roleKeys.includes('coordinador_departamento')
  const memberWithRole = isAdmin || roleKeys.includes('miembro_departamento')

  return {
    profile: profile as Profile,
    roles: (roles ?? []) as UserRole[],
    scopes: (scopes ?? []) as UserScope[],
    coordinatedDepartmentIds: coordinatesWithRole ? (coordinated ?? []).map((d) => (d as { id: string }).id) : [],
    memberDepartmentIds: memberWithRole ? (memberships ?? []).map((m) => (m as { department_id: string }).department_id) : [],
  }
}
