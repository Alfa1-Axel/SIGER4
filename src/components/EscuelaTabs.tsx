import { NavLink } from 'react-router-dom'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'

// Sub-navegación del módulo Escuela. La pestaña de Avales solo existe para
// quien tiene acceso; para el resto no se muestra ninguna pestaña (Escuela
// sigue siendo solo Cursos, como siempre).
export function EscuelaTabs() {
  const { hasAccess } = useSchoolAvalesAccess()
  if (!hasAccess) return null
  return (
    <nav className="module-tabs" aria-label="Secciones de Escuela">
      <NavLink to="/escuela" end className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}>
        Cursos
      </NavLink>
      <NavLink to="/escuela/avales" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}>
        Avales regionales
      </NavLink>
    </nav>
  )
}
