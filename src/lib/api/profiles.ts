import { supabase } from '../supabaseClient'
import type { Profile, UserRole, UserScope } from '../../types/database'

export interface CurrentUserContext {
  profile: Profile
  roles: UserRole[]
  scopes: UserScope[]
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

  const [{ data: roles }, { data: scopes }] = await Promise.all([
    supabase.from('user_roles').select('*').eq('profile_id', profile.id),
    supabase.from('user_scopes').select('*').eq('profile_id', profile.id),
  ])

  return {
    profile: profile as Profile,
    roles: (roles ?? []) as UserRole[],
    scopes: (scopes ?? []) as UserScope[],
  }
}
