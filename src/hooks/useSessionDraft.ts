import { useCallback, useEffect, useRef } from 'react'

const PREFIX = 'siger4:draft:'

// Borrador de un formulario en sessionStorage (solo esta pestaña, se borra al
// cerrarla). Pensado para los formularios con carga de archivo: si Android
// recarga la app mientras el selector de archivos está abierto, el usuario
// vuelve al formulario con lo que ya había escrito y solo tiene que elegir
// el archivo de nuevo.
//
// - readDraft(): devuelve el borrador guardado (o null) una sola vez, al
//   montar el formulario.
// - El valor actual se guarda solo mientras enabled sea true.
// - clearDraft(): llamar al guardar con éxito o al descartar.
export function useSessionDraft<T>(key: string, value: T, enabled: boolean) {
  const storageKey = PREFIX + key
  const initial = useRef<T | null | undefined>(undefined)

  if (initial.current === undefined) {
    try {
      const raw = sessionStorage.getItem(storageKey)
      initial.current = raw ? (JSON.parse(raw) as T) : null
    } catch {
      initial.current = null
    }
  }

  useEffect(() => {
    if (!enabled) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Sin sessionStorage (modo privado, cuota): el formulario funciona igual.
    }
  }, [storageKey, value, enabled])

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // ignorar
    }
  }, [storageKey])

  const readDraft = useCallback(() => initial.current ?? null, [])

  return { readDraft, clearDraft }
}
