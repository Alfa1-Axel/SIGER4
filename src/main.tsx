import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { reportSwUpdateAvailable } from './lib/swUpdate'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/clientErrors'

installGlobalErrorHandlers()

// Registro manual del service worker (ver vite.config.ts, injectRegister:
// false) — a diferencia del <script> que el plugin inyectaría solo, esto
// agrega el listener real de actualización. IMPORTANTE: registerType se
// cambió de 'autoUpdate' a 'prompt' en vite.config.ts — con 'autoUpdate' la
// librería manda skipWaiting() sola apenas detecta un SW nuevo instalado, y
// sin onNeedReload hace window.location.reload() apenas se activa, sin
// aviso ni posibilidad de guardar cambios en curso. Eso es lo que causaba
// recargas inesperadas y pérdida de datos/ruta al volver de background (ej.
// después de responder WhatsApp) si hubo un deploy mientras la app estaba
// en segundo plano: el navegador revalida el SW al recuperar actividad,
// detecta la versión nueva, la instala, y sin este cambio se activaba y
// recargaba todo sola. Con 'prompt', la librería NO manda skipWaiting sola:
// solo avisa (onNeedRefresh) que hay una versión nueva esperando, y queda a
// cargo del banner (SwUpdateBanner.tsx, montado en App.tsx) decidir cuándo
// llamar a updateServiceWorker() — recién ahí se activa el SW nuevo y
// recarga, con el usuario al tanto.
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    reportSwUpdateAvailable(() => updateServiceWorker(true))
  },
})

// Tipografías (Inter y JetBrains Mono): se piden DESPUÉS de dibujar la primera pantalla, con un <link> agregado desde acá. Un
// <link rel="stylesheet"> en el HTML (o un @import en el CSS) frena el primer dibujo hasta que Google responde (varias idas y
// vueltas a otro servidor); así la pantalla aparece enseguida con la letra del sistema y se cambia a Inter al llegar
// (display=swap). Mismo origen que ya permite la política de seguridad: no cambia nada ahí.
const WEB_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap'
function loadWebFonts() {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = WEB_FONTS_URL
  document.head.appendChild(link)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
window.requestAnimationFrame(loadWebFonts)
