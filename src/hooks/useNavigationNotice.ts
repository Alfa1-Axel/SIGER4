import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export type NoticeTone = 'success' | 'warning'

interface NoticeState {
  notice?: string
  noticeTone?: NoticeTone
}

function readNotice(state: unknown): string | null {
  return (state as NoticeState | null)?.notice ?? null
}

// Aviso que una pantalla le deja a la siguiente al navegar
// (navigate(to, { state: { notice, noticeTone } })), por ejemplo "Se subió el
// aval". Se lee una sola vez y se limpia del historial para que no
// reaparezca al volver atrás o recargar. noticeTone 'warning' es para un
// resultado parcial (se guardó, pero algo quedó pendiente).
export function useNavigationNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(() => readNotice(location.state))
  const [tone] = useState<NoticeTone>(() => (location.state as NoticeState | null)?.noticeTone ?? 'success')

  useEffect(() => {
    if (readNotice(location.state)) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location.pathname, location.search, location.state, navigate])

  return [notice, setNotice, tone] as const
}
