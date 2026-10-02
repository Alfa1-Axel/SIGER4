import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function readNotice(state: unknown): string | null {
  return (state as { notice?: string } | null)?.notice ?? null
}

// Aviso de éxito que una pantalla le deja a la siguiente al navegar
// (navigate(to, { state: { notice } })), por ejemplo "Se subió el aval".
// Se lee una sola vez y se limpia del historial para que no reaparezca al
// volver atrás o recargar.
export function useNavigationNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(() => readNotice(location.state))

  useEffect(() => {
    if (readNotice(location.state)) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location.pathname, location.search, location.state, navigate])

  return [notice, setNotice] as const
}
