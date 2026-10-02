import { Link } from 'react-router-dom'
import { Icon } from './Icon'

interface AccessDeniedProps {
  title?: string
  // Por qué no tiene acceso y qué puede hacer, en lenguaje de usuario.
  message: string
  backTo?: string
  backLabel?: string
}

// Mensaje común para pantallas a las que el usuario no tiene acceso. Se usa
// en vez de redirigir en silencio: la persona entiende qué pasó y a dónde
// volver. La protección real está siempre en la base (RLS), esto es solo la
// explicación.
export function AccessDenied({ title = 'No tenés acceso a esta sección', message, backTo = '/panel', backLabel = 'Volver al inicio' }: AccessDeniedProps) {
  return (
    <div className="access-denied" role="status">
      <span className="access-denied-icon" aria-hidden="true">
        <Icon name="lock" size={22} />
      </span>
      <h1 className="access-denied-title">{title}</h1>
      <p className="access-denied-message">{message}</p>
      <Link to={backTo} className="btn btn-outlined">
        {backLabel}
      </Link>
    </div>
  )
}
