import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { Footer } from './Footer'
import { Icon } from '../ui/Icon'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

interface AppShellProps {
  title: string
  children: ReactNode
}

export function AppShell({ title, children }: AppShellProps) {
  const online = useOnlineStatus()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // body.drawer-open habilita reglas CSS globales (ver styles.css) que
  // apagan pointer-events en contenido con su propio manejo de gestos
  // táctiles (ej. pan/zoom de Leaflet en /mapa) mientras el drawer está
  // abierto -- el backdrop ya lo cubre visualmente e intercepta clicks
  // simples, pero un mapa Leaflet debajo puede seguir respondiendo a
  // gestos touch si el navegador no lo trata como "tapado".
  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen)
    return () => document.body.classList.remove('drawer-open')
  }, [drawerOpen])

  return (
    <div className="app-shell">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div
        className={`sidebar-drawer-backdrop${drawerOpen ? ' open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <div className="app-main-column">
        <AppHeader title={title} onOpenMenu={() => setDrawerOpen(true)} />
        {!online && (
          <div className="offline-banner">
            <Icon name="wifiOff" size={14} /> Sin conexión: mostrando datos guardados localmente
          </div>
        )}
        <main className="app-content">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
