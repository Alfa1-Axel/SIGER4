import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
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
