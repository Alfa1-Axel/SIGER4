import { useEffect, useState } from 'react'

const PICKER_FLAG_PREFIX = 'siger4:picker-open:'

function readPickerFlag(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(PICKER_FLAG_PREFIX + id)
    if (!raw) return false
    sessionStorage.removeItem(PICKER_FLAG_PREFIX + id)
    return Date.now() - Number(raw) < 15 * 60 * 1000
  } catch {
    return false
  }
}

function setPickerFlag(id: string, open: boolean) {
  try {
    if (open) sessionStorage.setItem(PICKER_FLAG_PREFIX + id, String(Date.now()))
    else sessionStorage.removeItem(PICKER_FLAG_PREFIX + id)
  } catch {
    // Sin sessionStorage (modo privado): solo se pierde el aviso de recarga.
  }
}

// Android puede cerrar la app en segundo plano mientras el selector de
// archivos está abierto y recargarla al volver (DEPLOYMENT.md, sección 19):
// lo elegido se pierde. Al abrir el selector se deja una marca en
// sessionStorage; si la página vuelve a cargar con la marca puesta,
// reloadedWhilePicking avisa que hay que elegir de nuevo.
export function usePickerReload(id: string) {
  const [reloadedWhilePicking] = useState(() => readPickerFlag(id))

  // Al volver del selector sin recarga (eligiendo o cancelando), la ventana
  // recupera el foco: se limpia la marca.
  useEffect(() => {
    const clear = () => setPickerFlag(id, false)
    window.addEventListener('focus', clear)
    return () => {
      window.removeEventListener('focus', clear)
      // Salir del formulario dentro de la app no es una recarga.
      clear()
    }
  }, [id])

  return {
    reloadedWhilePicking,
    markOpen: () => setPickerFlag(id, true),
    clearMark: () => setPickerFlag(id, false),
  }
}
