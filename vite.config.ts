import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Versión de build visible en Ajustes/diagnóstico (ver AjustesPage.tsx) —
// necesaria para poder confirmar, mirando la propia pantalla del celular,
// si el dispositivo está corriendo el JS del último deploy o uno viejo (ver
// DEPLOYMENT.md, causa real de "los fixes no se reflejan en el
// dispositivo"). VERCEL_GIT_COMMIT_SHA es la variable que Vercel expone en
// el entorno de build (no llega al cliente sin pasar por acá); en un build
// local sin ese entorno, se cae a git rev-parse directo. Si ninguno está
// disponible (build sin git, ej. un export limpio), queda "unknown" en vez
// de romper el build.
function resolveBuildVersion(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const BUILD_VERSION = resolveBuildVersion()
const BUILD_TIME = new Date().toISOString()

// public/raw-upload-test.html es un archivo estático real, servido tal cual
// sin pasar por el bundler de Vite — por diseño, para que la prueba de
// diagnóstico sea 100% ajena a React/build de la app (ver DEPLOYMENT.md).
// Eso significa que NO puede leer __SIGER4_BUILD_VERSION__ (esa constante
// solo existe dentro de módulos que Vite procesa). Este plugin mínimo
// escribe la misma info a un JSON estático en la raíz del build
// (dist/build-info.json) que raw-upload-test.js puede pedir con fetch() en
// tiempo de ejecución — así ambas pantallas de diagnóstico (la de React y
// la estática) muestran el mismo build real sin duplicar lógica de git.
function buildInfoPlugin(): Plugin {
  return {
    name: 'siger4-build-info',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({ version: BUILD_VERSION, time: BUILD_TIME }, null, 2),
      })
    },
  }
}

export default defineConfig({
  define: {
    __SIGER4_BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    __SIGER4_BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    buildInfoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // El plugin, por default, inyecta un <script> en index.html que solo
      // hace navigator.serviceWorker.register(...) a secas — sin ningún
      // listener de actualización/recarga. En modo autoUpdate eso significa
      // que un service worker nuevo puede terminar de instalarse y activarse
      // en segundo plano sin que la página ya abierta se entere: sigue
      // corriendo el JS viejo en memoria hasta que el usuario cierra y
      // reabre la app de verdad — algo que en una PWA instalada en Android
      // puede no pasar durante días (el sistema la mantine "tibia" entre
      // cambios de app en vez de matarla). Se registra a mano en main.tsx
      // usando `virtual:pwa-register`, que sí agrega el listener real de
      // "se activó una versión nueva" -> location.reload() automático.
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff2}'],
      },
      includeAssets: [
        'logos/logo-escuela.png',
        'logos/logo-informatica.png',
        'icons/manifest-icon-192.png',
        'icons/manifest-icon-512.png',
        'icons/manifest-icon-maskable-192.png',
        'icons/manifest-icon-maskable-512.png',
      ],
      manifest: {
        id: '/',
        name: 'SIGER4 - Sistema Integral de Gestion de la Regional 4',
        short_name: 'SIGER4',
        description: 'Plataforma institucional para la Regional 4 de Bomberos Voluntarios',
        theme_color: '#D32F2F',
        background_color: '#F8FAFC',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'es',
        // Tamaños estándar 192/512 explícitos (antes solo había un icono de
        // 1254x1254 sin declarar los tamaños que Android/Chrome esperan para
        // el selector de instalación y el ícono de app — un solo tamaño
        // gigante sin los estándares declarados puede hacer que el launcher
        // caiga a un ícono genérico). El "purpose: maskable" usa una versión
        // con el logo reducido al ~70% del lienzo y fondo del color de tema,
        // para que sobreviva el recorte a círculo/squircle que aplican los
        // launchers de Android sin cortar el emblema (ver
        // public/icons/manifest-icon-maskable-*.png).
        icons: [
          {
            src: '/icons/manifest-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/manifest-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/manifest-icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/manifest-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
