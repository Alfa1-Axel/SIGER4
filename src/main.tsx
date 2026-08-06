import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Registro manual del service worker (ver vite.config.ts, injectRegister:
// false) — a diferencia del <script> que el plugin inyectaría solo, esto
// SÍ agrega el listener real de actualización: cuando una versión nueva del
// SW termina de activarse (event.isUpdate === true), recarga la página
// automáticamente. Sin esto, una PWA instalada que Android mantiene "tibia"
// entre cambios de app puede seguir corriendo JS de una versión vieja
// indefinidamente aunque el SW nuevo ya se haya instalado en segundo plano —
// causa real confirmada de por qué fixes ya deployados no se veían
// reflejados en el comportamiento real del dispositivo del usuario (ver
// DEPLOYMENT.md).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
