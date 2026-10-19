import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { NAV_ITEMS, NAV_SECTIONS, isNavItemVisible, navItemLabel } from './navigation'
import type { NavContext } from './navigation'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'
import { useDialogFocus } from '../../hooks/useDialogFocus'

function UserAvatar({ avatarUrl }: { avatarUrl: string | null | undefined }) {
  if (avatarUrl) return <img src={avatarUrl} alt="" className="avatar" style={{ width: 28, height: 28 }} />
  return (
    <span className="avatar avatar-placeholder" style={{ width: 28, height: 28 }} aria-hidden="true">
      <Icon name="user" size={14} />
    </span>
  )
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  // true cuando es el menú desplegable del celular (no la columna fija de escritorio).
  modal?: boolean
}

// En desktop (≥900px) el sidebar es una columna fija de la grilla, siempre
// visible: "open"/"onClose" no tienen efecto ahí (el CSS ignora .open en ese
// breakpoint). En mobile/tablet es un drawer off-canvas que se desliza según
// la clase "open"; se cierra solo al elegir una opción, tocar el botón de
// cierre, o el backdrop (manejado por AppShell).
export function Sidebar({ open, onClose, modal = false }: SidebarProps) {
  const { profile, signOut, isAdmin, isSuperAdmin, isDepartmentOnly, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const departmentCount = new Set([...coordinatedDepartmentIds, ...memberDepartmentIds]).size
  const navContext: NavContext = { isAdmin, isSuperAdmin, hasRole, hasDepartments: departmentCount > 0, departmentCount, departmentOnly: isDepartmentOnly }
  const visibleItems = NAV_ITEMS.filter((item) => isNavItemVisible(item, navContext))
  const navRef = useRef<HTMLElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()

  // Menú del celular cerrado: queda fuera de la pantalla y también fuera del alcance del teclado y del
  // lector de pantalla (antes el Tab entraba a enlaces que no se veían).
  useEffect(() => {
    const aside = asideRef.current
    if (!aside) return
    if (modal && !open) aside.setAttribute('inert', '')
    else aside.removeAttribute('inert')
  }, [modal, open])

  // Va después del efecto de arriba: al abrir, primero se le quita el inert y recién ahí se le da el foco.
  // Menú del celular abierto: Escape lo cierra, el foco queda adentro y vuelve al botón que lo abrió.
  useDialogFocus(asideRef, onClose, closeRef, modal && open)

  // Con muchos ítems (Informática) el menú scrollea: si el ítem activo quedó
  // fuera de vista, se lo centra moviendo solo el menú, no la página.
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('.sidebar-link.active')
    if (!nav || !active) return
    const navBox = nav.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    if (box.top < navBox.top || box.bottom > navBox.bottom) {
      nav.scrollTop += box.top - navBox.top - (navBox.height - box.height) / 2
    }
  }, [pathname, open])

  return (
    <aside
      ref={asideRef}
      className={`app-sidebar${open ? ' open' : ''}`}
      {...(modal && open ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menú' } : {})}
    >
      <div className="sidebar-brand-row">
        <Link to="/panel" className="sidebar-brand" aria-label="SIGER4: ir al inicio" onClick={onClose}>
          <img src="/logos/logo-escuela.png" alt="" />
          <span>SIGER4</span>
        </Link>
        <button ref={closeRef} type="button" className="btn btn-icon btn-ghost sidebar-close-button" onClick={onClose} aria-label="Cerrar menú">
          <Icon name="close" size={18} />
        </button>
      </div>

      <nav ref={navRef} className="sidebar-nav" aria-label="Menú principal">
        {NAV_SECTIONS.map((section) => {
          const items = visibleItems.filter((item) => item.section === section)
          if (items.length === 0) return null
          return (
            <div key={section} className="sidebar-section">
              <span className="sidebar-section-title">{section}</span>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  // end: un ítem cuya ruta es prefijo de otro ítem (Usuarios /
                  // Nuevo usuario) no debe quedar activo en la ruta del otro.
                  end={NAV_ITEMS.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`))}
                  onClick={onClose}
                  // Pendientes se abre desde el Inicio y no está en el menú: el Inicio sigue marcado.
                  className={({ isActive }) => `sidebar-link${isActive || (item.to === '/panel' && pathname === '/pendientes') ? ' active' : ''}`}
                >
                  <Icon name={item.icon} size={18} />
                  {navItemLabel(item, navContext)}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <Link to="/ajustes" className="sidebar-user" aria-label={`${profile?.full_name ?? 'Usuario'}: ir a mi perfil`} onClick={onClose}>
          <UserAvatar avatarUrl={profile?.avatar_url} />
          <span className="sidebar-user-name">{profile?.full_name ?? 'Usuario'}</span>
        </Link>
        <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
          <Icon name="logout" size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
