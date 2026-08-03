import { supabase } from '../supabaseClient'
import type { Profile, UserRole, UserScope, ScopeType } from '../../types/database'
import type { RoleKey } from '../../types/roles'

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Profile[]
}

export interface ProfileWithRolesAndScopes {
  profile: Profile
  roles: UserRole[]
  scopes: UserScope[]
}

export async function fetchProfileWithRoles(id: string): Promise<ProfileWithRolesAndScopes | null> {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (error || !profile) return null

  const [{ data: roles }, { data: scopes }] = await Promise.all([
    supabase.from('user_roles').select('*').eq('profile_id', id),
    supabase.from('user_scopes').select('*').eq('profile_id', id),
  ])

  return {
    profile: profile as Profile,
    roles: (roles ?? []) as UserRole[],
    scopes: (scopes ?? []) as UserScope[],
  }
}

export interface ProfileInput {
  full_name: string
  email: string
  rank?: string | null
  phone?: string | null
  position?: string | null
  seniority_start_date?: string | null
  avatar_url?: string | null
  region_id?: string | null
  station_id?: string | null
  must_change_password?: boolean
  weekly_reminder_enabled?: boolean
}

// Crea la cuenta de Auth, el perfil y sus roles/alcance en un solo paso
// server-side (Edge Function admin-create-user, requiere service_role).
// Reemplaza al flujo de auto-registro retirado por riesgo de account
// takeover (ver migración 0029_retire_self_signup_invite_flow.sql): ya no
// existen perfiles "pendientes" con auth_user_id null.
//
// Roles y scope viajan en el mismo pedido (no como addRole()/addScope()
// separados después): esas dos tablas solo aceptan escritura de
// is_informatica_r4() por RLS, así que director_escuela/jefe_cuerpo_activo
// nunca podrían asignarlos por su cuenta. La función valida server-side la
// matriz de permisos completa (quién puede crear con qué rol/alcance) — ver
// comentario en supabase/functions/admin-create-user/index.ts.
export interface CreateUserAccountInput extends ProfileInput {
  password: string
  roles: RoleKey[]
  scope: ScopeInput
}

export async function createUserAccount(input: CreateUserAccountInput): Promise<Profile> {
  const { data, error } = await supabase.functions.invoke<{ profile?: Profile; error?: string }>(
    'admin-create-user',
    { body: input },
  )
  if (error) throw error
  if (!data?.profile) throw new Error(data?.error ?? 'No se pudo crear el usuario.')
  return data.profile
}

export async function updateProfile(id: string, input: Partial<ProfileInput>): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Profile
}

export async function setProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function addRole(profileId: string, role: RoleKey): Promise<UserRole> {
  const { data, error } = await supabase
    .from('user_roles')
    .insert({ profile_id: profileId, role })
    .select('*')
    .single()
  if (error) throw error
  return data as UserRole
}

export async function removeRole(roleRowId: string): Promise<void> {
  const { error } = await supabase.from('user_roles').delete().eq('id', roleRowId)
  if (error) throw error
}

export interface ScopeInput {
  scope_type: ScopeType
  region_id?: string | null
  subsede_id?: string | null
  station_id?: string | null
}

export async function addScope(profileId: string, input: ScopeInput): Promise<UserScope> {
  const { data, error } = await supabase
    .from('user_scopes')
    .insert({ profile_id: profileId, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as UserScope
}

export async function removeScope(scopeRowId: string): Promise<void> {
  const { error } = await supabase.from('user_scopes').delete().eq('id', scopeRowId)
  if (error) throw error
}
