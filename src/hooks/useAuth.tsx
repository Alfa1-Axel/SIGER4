import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { fetchCurrentUserContext } from '../lib/api/profiles'
import type { Profile, UserRole, UserScope } from '../types/database'
import type { RoleKey } from '../types/roles'
import { ADMIN_ROLES } from '../types/roles'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  roles: RoleKey[]
  scopes: UserScope[]
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  hasRole: (...role: RoleKey[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [scopes, setScopes] = useState<UserScope[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setUserRoles([])
        setScopes([])
        setLoading(false)
      }
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!session?.user) return

    setLoading(true)
    fetchCurrentUserContext(session.user.id).then((ctx) => {
      if (!active) return
      if (ctx) {
        setProfile(ctx.profile)
        setUserRoles(ctx.roles)
        setScopes(ctx.scopes)
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [session?.user])

  const roles = useMemo(() => userRoles.map((r) => r.role), [userRoles])
  const isAdmin = useMemo(() => roles.some((r) => ADMIN_ROLES.includes(r)), [roles])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    scopes,
    loading,
    isAdmin,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
    hasRole(...checked) {
      return checked.some((r) => roles.includes(r))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
