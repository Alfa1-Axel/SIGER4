import { createClient } from '@supabase/supabase-js'

// Exportadas para las subidas con progreso (lib/api/storage.ts), que van
// por XMLHttpRequest al mismo endpoint de Storage que usa supabase-js.
export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SIGER4] Faltan las variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completá los valores de tu proyecto Supabase.',
  )
}

// Ingreso con passkey (huella, rostro o PIN del dispositivo, vía WebAuthn).
// En Supabase Auth es una función experimental: además de esta variable,
// tiene que estar habilitada en el proyecto (DEPLOYMENT.md sección 57.5).
// Apagada, no se muestra ninguna opción de passkey.
export const passkeysEnabled = import.meta.env.VITE_PASSKEYS_ENABLED === 'true'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(passkeysEnabled ? { experimental: { passkey: true } } : {}),
  },
})
