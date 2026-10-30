import { passkeysEnabled, supabase } from '../supabaseClient'

// ---------------- Email recordado ----------------
// Solo el email, y solo si la persona lo pide ("Recordar mi email en este
// dispositivo"). La contraseña nunca se guarda en la app: la guarda, si el
// usuario quiere, el gestor de contraseñas del navegador (que en el celular
// la completa con huella o rostro).
const REMEMBERED_EMAIL_KEY = 'siger4:remembered-email'

export function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveRememberedEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY)
  } catch {
    // Sin localStorage (modo privado): simplemente no se recuerda.
  }
}

// ---------------- Gestor de contraseñas del navegador ----------------
// Credential Management API (Chrome, Edge, Android): le ofrece al usuario
// guardar el acceso en el gestor del navegador. Es el navegador el que
// guarda, cifra y pide confirmación; la app no retiene la contraseña. En
// navegadores sin esta API, el gestor detecta el formulario por los
// atributos autocomplete.
type StoredCredential = Parameters<typeof navigator.credentials.store>[0]
type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => StoredCredential

export async function offerToSaveCredential(email: string, password: string): Promise<void> {
  const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential
  if (!Ctor || !navigator.credentials?.store) return
  try {
    await navigator.credentials.store(new Ctor({ id: email, password, name: email }))
  } catch {
    // Si el usuario lo rechaza o el navegador no lo permite, no pasa nada.
  }
}

// ---------------- Errores de inicio de sesión ----------------
export function describeSignInError(result: { error: string | null; code?: string; status?: number }): string {
  const code = result.code ?? ''
  const message = (result.error ?? '').toLowerCase()
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos. Revisalos y volvé a intentar.'
  }
  if (code === 'over_request_rate_limit' || result.status === 429 || message.includes('rate limit')) {
    return 'Demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.'
  }
  if (code === 'email_not_confirmed') return 'Tu cuenta todavía no está confirmada. Consultá a Informática y Estadística para que la revisen.'
  if (code === 'user_banned') return 'Tu cuenta está desactivada. Consultá a Informática y Estadística.'
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|load failed|networkerror|fetch/i.test(message)) {
    return 'No hay conexión con el servidor. Revisá tu conexión a internet y volvé a intentar.'
  }
  return 'No pudimos iniciar sesión. Reintentá en unos segundos.'
}

// ---------------- Passkeys (huella, rostro o PIN) ----------------
// WebAuthn a través de Supabase Auth (función experimental, ver
// supabaseClient.ts y DEPLOYMENT.md 57.5). La clave privada queda en el
// dispositivo o en el gestor de passkeys del sistema; el servidor solo
// guarda la clave pública.
export function passkeysAvailable(): boolean {
  return passkeysEnabled && typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

export function describePasskeyError(err: unknown): string {
  const e = err as { code?: string; name?: string; message?: string } | null
  if (e?.code === 'ERROR_CEREMONY_ABORTED' || e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
    return 'Se canceló la verificación. Volvé a intentar o ingresá con email y contraseña.'
  }
  if (e?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'Este dispositivo ya está registrado.'
  if (e?.code === 'ERROR_INVALID_DOMAIN' || e?.code === 'ERROR_INVALID_RP_ID') {
    return 'El ingreso con passkey no está configurado para esta dirección. Consultá a Informática y Estadística.'
  }
  return 'No pudimos completar el ingreso con passkey. Ingresá con email y contraseña.'
}

export async function signInWithPasskey(): Promise<void> {
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) throw error
}

export interface PasskeyItem {
  id: string
  friendly_name?: string
  created_at: string
  last_used_at?: string
}

export async function listPasskeys(): Promise<PasskeyItem[]> {
  const { data, error } = await supabase.auth.passkey.list()
  if (error) throw error
  return data ?? []
}

export async function registerPasskey(): Promise<void> {
  const { error } = await supabase.auth.registerPasskey()
  if (error) throw error
}

export async function deletePasskey(passkeyId: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error) throw error
}
