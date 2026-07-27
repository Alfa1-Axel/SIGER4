import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/siger4-icon.svg', 'logos/logo-escuela.png', 'logos/logo-informatica.png'],
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
        icons: [
          {
            src: '/logos/logo-informatica.png',
            sizes: '1254x1254',
            type: 'image/png',
          },
          {
            src: '/logos/logo-informatica.png',
            sizes: '1254x1254',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'siger4-supabase-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'siger4-image-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
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
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
