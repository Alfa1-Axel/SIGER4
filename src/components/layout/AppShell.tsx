import type { ReactNode } from 'react'
import { useState } from 'react'
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
