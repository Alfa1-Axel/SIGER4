import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { reportSwUpdateAvailable } from './lib/swUpdate'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
