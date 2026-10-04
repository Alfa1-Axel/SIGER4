import { Link } from 'react-router-dom'
import { CURRENT_VERSION } from '../../config/appUpdates'
import { useAuth } from '../../hooks/useAuth'

// Pie de todas las pantallas: autoría y versión actual. Con sesión, la
// versión lleva a Novedades.
export function Footer() {
  const { session } = useAuth()
  return (
    <footer className="app-footer">
      Sistema creado por Dpto. Informática y Estadística R4 ·{' '}
      {session ? (
        <Link to="/novedades" className="app-footer-version" title="Ver qué cambió">
          v{CURRENT_VERSION}
        </Link>
      ) : (
        <span>v{CURRENT_VERSION}</span>
      )}
    </footer>
  )
}
