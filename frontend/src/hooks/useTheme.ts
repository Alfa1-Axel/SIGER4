import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'siger4-theme'

// El usuario elige el tema manualmente; nunca se sigue automáticamente
// prefers-color-scheme (eso oscurecía todo el sistema sin que nadie lo
// pidiera). Sin preferencia guardada, el default es siempre claro.
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = readStoredTheme()
    applyTheme(initial)
    return initial
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Si localStorage no está disponible (modo privado, cuota), el
        // tema simplemente no persiste entre sesiones — no debe romper nada.
      }
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
