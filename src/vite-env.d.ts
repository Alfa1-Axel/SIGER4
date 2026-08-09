/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Inyectadas por vite.config.ts (define) en tiempo de build — ver
// AjustesPage.tsx, sección de versión de build / diagnóstico.
declare const __SIGER4_BUILD_VERSION__: string
declare const __SIGER4_BUILD_TIME__: string
// Versión "humana" del sistema (ej. "1.0.0-beta.1"), tomada de package.json —
// visible a todos los usuarios en Ajustes, a diferencia del hash de build.
declare const __SIGER4_APP_VERSION__: string
