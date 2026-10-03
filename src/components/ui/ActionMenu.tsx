import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export interface ActionMenuItem {
  to: string
  label: string
  description?: string
  icon?: string
}

interface ActionMenuProps {
  label: string
  items: ActionMenuItem[]
  icon?: string
  variant?: 'primary' | 'outlined'
}

// Botón con opciones (ej. "+ Nuevo informe" → Redactar / Cargar). Se cierra
// al elegir, al tocar afuera o con Escape; con teclado, Escape devuelve el
// foco al botón.
export function ActionMenu({ label, items, icon = 'plus', variant = 'primary' }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<'left' | 'right'>('right')
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-outlined'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          // Se abre hacia el lado con lugar: en el celular el botón suele
          // quedar a la izquierda y el menú se saldría de la pantalla.
          const rect = buttonRef.current?.getBoundingClientRect()
          if (rect) setAlign(window.innerWidth - rect.left >= 260 ? 'left' : 'right')
          setOpen((v) => !v)
        }}
      >
        <Icon name={icon} size={16} />
        {label}
      </button>
      {open && (
        <ul id={menuId} className={`action-menu-list action-menu-list--${align}`} role="menu">
          {items.map((item) => (
            <li key={item.to} role="none">
              <Link to={item.to} className="action-menu-item" role="menuitem" onClick={() => setOpen(false)}>
                {item.icon && <Icon name={item.icon} size={18} />}
                <span>
                  {item.label}
                  {item.description && <small>{item.description}</small>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
