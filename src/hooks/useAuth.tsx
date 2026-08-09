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
  // true mientras se detecto que el perfil esta desactivado y se esta
  // cerrando la sesion; ProtectedRoute lo usa para mostrar un mensaje claro
  // antes de redirigir al login, en vez de un error crudo o una pantalla en
  // blanco.
  deactivated: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  hasRole: (...role: RoleKey[]) => boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [scopes, setScopes] = useState<UserScope[]>([])
  const [loading, setLoading] = useState(true)
  const [deactivated, setDeactivated] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setDeactivated(false)
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

    // Solo mostrar loading=true (spinner de pantalla completa en
    // ProtectedRoute) si todavía no hay un perfil cargado — un
    // TOKEN_REFRESHED (autoRefreshToken, disparado seguido al recuperar
    // foco/visibilidad si el token estaba por vencer) entrega un objeto
    // Session nuevo aunque sea el mismo usuario, y este efecto igual se
    // re-ejecuta (session?.user.id no cambia, pero session?.user si es una
    // referencia nueva). Antes eso ponía loading=true de nuevo cada vez,
    // haciendo parpadear el spinner sobre la pantalla actual — no era una
    // navegación real, pero contribuía a la sensación de "recarga" al
    // volver de background.
    if (!profile) setLoading(true)
    fetchCurrentUserContext(session.user.id)
      .then((ctx) => {
        if (!active) return
        if (ctx) {
          // is_active ya no es solo visual: el backend (current_profile_id())
          // deja de reconocer a un perfil inactivo para casi toda escritura y
          // lectura de scope, asi que si el frontend detecta is_active=false
          // debe cerrar la sesion de inmediato en vez de dejar al usuario
          // navegando con una app que le va a rechazar todo silenciosamente.
          if (!ctx.profile.is_active) {
            setDeactivated(true)
            setProfile(null)
            setUserRoles([])
            setScopes([])
            setLoading(false)
            void supabase.auth.signOut()
            return
          }
          setProfile(ctx.profile)
          setUserRoles(ctx.roles)
          setScopes(ctx.scopes)
        }
        setLoading(false)
      })
      .catch((err) => {
        // Sin este catch, un error de red real (fetch falla, no un {error}
        // de Postgrest) deja la promesa rechazada sin manejar: loading
        // nunca vuelve a false y ProtectedRoute queda mostrando el spinner
        // de pantalla completa para siempre, sin forma de recuperarse salvo
        // recargar manualmente. Es justo el escenario que puede darse al
        // volver de background con conectividad inestable — el mismo caso
        // que este archivo ya intenta manejar mejor en otros puntos.
        console.warn('[SIGER4] No se pudo cargar el perfil del usuario:', err)
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

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
    deactivated,
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
    async refreshProfile() {
      if (!session?.user) return
      const ctx = await fetchCurrentUserContext(session.user.id)
      if (ctx) {
        if (!ctx.profile.is_active) {
          setDeactivated(true)
          setProfile(null)
          setUserRoles([])
          setScopes([])
          await supabase.auth.signOut()
          return
        }
        setProfile(ctx.profile)
        setUserRoles(ctx.roles)
        setScopes(ctx.scopes)
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
