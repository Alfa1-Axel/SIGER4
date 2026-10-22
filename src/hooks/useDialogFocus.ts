import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Diálogos abiertos, el último es el de arriba: solo ese responde a Escape y al Tab.
const stack: symbol[] = []

function setPageInert(inert: boolean) {
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null
  if (!root) return
  if (inert) root.setAttribute('inert', '')
  else root.removeAttribute('inert')
}

// Comportamiento accesible común a los diálogos modales (montados por portal en <body>):
// lleva el foco adentro, lo mantiene ahí con Tab/Shift+Tab, cierra con Escape, deja la página de
// fondo fuera del alcance del teclado y del lector de pantalla (inert) y devuelve el foco a lo que
// lo tenía al abrir. `initialFocus` elige el control que arranca enfocado.
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
  // false: el diálogo existe pero no está en uso (p. ej. el menú lateral en escritorio o cerrado).
  enabled = true,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const container = containerRef.current
    if (!enabled || !container) return
    const id = Symbol('dialog')
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    stack.push(id)
    setPageInert(true)

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
    const first = initialFocus?.current ?? focusables()[0] ?? container
    if (first === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
    first.focus({ preventScroll: true })

    function handleKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const active = document.activeElement
      if (!container!.contains(active)) {
        event.preventDefault()
        firstItem.focus()
      } else if (event.shiftKey && active === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      const at = stack.indexOf(id)
      if (at >= 0) stack.splice(at, 1)
      if (stack.length === 0) setPageInert(false)
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
    // El contenedor y el foco inicial se fijan al activar el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
