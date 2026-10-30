import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'

// Ruta que no existe: un enlace viejo, una dirección mal escrita. Se explica en vez de mandar a la
// persona al Inicio sin aviso. Está dentro de la sesión, así que conserva el menú.
export function NotFoundPage() {
  return (
    <AppShell title="Página no encontrada">
      <div className="access-denied" role="status">
        <span className="access-denied-icon" aria-hidden="true">
          <Icon name="search" size={22} />
        </span>
        <h1 className="access-denied-title">No encontramos esa página</h1>
        <p className="access-denied-message">Puede que el enlace esté desactualizado o que la dirección tenga un error. Volvé al inicio o usá el menú para seguir.</p>
        <Link to="/panel" className="btn btn-primary">
          Ir al inicio
        </Link>
      </div>
    </AppShell>
  )
}
