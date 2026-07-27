import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
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

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main-column">
        <AppHeader title={title} />
        {!online && (
          <div className="offline-banner">
            <Icon name="wifiOff" size={14} /> Sin conexión: mostrando datos guardados localmente
          </div>
        )}
        <main className="app-content">{children}</main>
        <Footer />
      </div>
      <BottomNav />
    </div>
  )
}
