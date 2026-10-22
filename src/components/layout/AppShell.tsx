import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { Footer } from './Footer'
import { Icon } from '../ui/Icon'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

interface AppShellProps {
  title: string
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Mismo breakpoint que .app-sidebar en styles.css (max-width: 899px) donde
// el sidebar pasa de columna fija de la grilla a drawer off-canvas.
const MOBILE_DRAWER_QUERY = '(max-width: 899px)'

export function AppShell({ title, children }: AppShellProps) {
  const online = useOnlineStatus()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_DRAWER_QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_DRAWER_QUERY)
    const handleChange = (e: { matches: boolean }) => setIsMobile(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  // body.drawer-open habilita reglas CSS globales (ver styles.css) que
  // apagan por completo el mapa Leaflet (pointer-events + visibility)
  // mientras el drawer está abierto -- cinturón de seguridad además del
  // portal de abajo, no la única defensa.
  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen)
    return () => document.body.classList.remove('drawer-open')
  }, [drawerOpen])

  // Títulos: el encabezado ya dice dónde está la persona. Si el título de la pantalla repite lo mismo,
  // se deja solo para el lector de pantalla (no se ve dos veces el mismo texto uno debajo del otro); y si la
  // pantalla no trae título propio (los formularios), se agrega uno oculto para que tenga su <h1>.
  const mainRef = useRef<HTMLElement>(null)
  const [needsHeading, setNeedsHeading] = useState(false)
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const normalize = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    let frame = 0
    const sync = () => {
      frame = 0
      const own = main.querySelector('h1:not([data-shell-heading])')
      setNeedsHeading(!own)
      if (own) own.classList.toggle('page-title--same-as-header', normalize(own.textContent) === normalize(title))
      // Una pantalla que scrollea y no tiene nada a lo que llegar con el Tab no se podría recorrer con el teclado:
      // el contenedor pasa a ser enfocable para poder moverse con las flechas.
      const scrolls = main.scrollHeight > main.clientHeight + 1
      if (scrolls && !main.querySelector(FOCUSABLE)) main.setAttribute('tabindex', '0')
      else if (main.getAttribute('tabindex') === '0') main.removeAttribute('tabindex')
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync)
    }
    sync()
    const observer = new window.MutationObserver(schedule)
    observer.observe(main, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [title])

  const sidebarAndBackdrop = (
    <>
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} modal={isMobile} />
      <div
        className={`sidebar-drawer-backdrop${drawerOpen ? ' open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
    </>
  )

  // En mobile (<900px) el sidebar es un drawer off-canvas (position:fixed):
  // se monta vía portal directo a document.body, NO como hijo de
  // .app-shell -- fix real de la superposición con el mapa. Antes, aunque
  // .app-sidebar/.sidebar-drawer-backdrop tenían z-index alto, seguían
  // siendo descendientes de .app-shell, el mismo ancestro que envuelve al
  // mapa Leaflet; si CUALQUIER elemento en ese árbol compartido generaba
  // su propio stacking context (Leaflet aplica transform inline a sus
  // panes al hacer pan/zoom, lo cual crea uno), el z-index del drawer
  // podía terminar comparándose dentro de ese contexto en vez de contra
  // la página entera, dependiendo del navegador -- exactamente el tipo de
  // bug "funciona en desktop, se rompe en mobile real" y no reproducible
  // de forma confiable. Con portal a document.body, drawer y backdrop son
  // hermanos directos del <body>: no comparten ancestro con el mapa, así
  // que ningún stacking context del contenido puede encerrarlos.
  //
  // En desktop (>=900px) el sidebar es una columna normal DENTRO del flex
  // de .app-shell (ver styles.css .app-shell{display:flex}) -- portarlo
  // ahí rompería el layout (dejaría de reservar espacio como columna), y
  // tampoco hace falta: en desktop no es position:fixed, no compite con
  // nada.
  return (
    <div className="app-shell">
      {isMobile ? createPortal(sidebarAndBackdrop, document.body) : sidebarAndBackdrop}
      <div className="app-main-column">
        <AppHeader title={title} onOpenMenu={() => setDrawerOpen(true)} />
        {!online && (
          <div className="offline-banner">
            <Icon name="wifiOff" size={14} /> Sin conexión: mostrando datos guardados localmente
          </div>
        )}
        <main className="app-content" ref={mainRef}>
          {needsHeading && (
            <h1 className="sr-only" data-shell-heading="">
              {title}
            </h1>
          )}
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
