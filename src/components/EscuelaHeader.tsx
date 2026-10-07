import { NavLink } from 'react-router-dom'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { useAuth } from '../hooks/useAuth'
import logoEscuela from '../assets/Logo escuela.png'

// Identidad del módulo Escuela, común a todas sus pantallas: logo de la
// Escuela Regional, nombre y sub-navegación. La pestaña de Avales solo
// existe para quien tiene acceso; para el resto no se muestran pestañas
// (Escuela sigue siendo solo Cursos).
//
// El logo es el archivo original "Logo escuela.png" (300x300, PNG con
// transparencia), sin recortar ni deformar: object-fit contain dentro de un
// cuadro fijo, y se muestra a 48-56px, muy por debajo de su resolución, así
// que se ve nítido también en pantallas de alta densidad.
export function EscuelaHeader() {
  const { hasAccess } = useSchoolAvalesAccess()
  // Modo departamento: Avales es lo único de Escuela que abre (Cursos no), así
  // que no hay pestañas entre las que elegir.
  const { isDepartmentOnly } = useAuth()
  return (
    <div className="module-header">
      <div className="module-identity">
        <img src={logoEscuela} alt="Logo Escuela" className="module-identity-logo" width={56} height={56} decoding="async" />
        <div style={{ minWidth: 0 }}>
          <div className="module-identity-name">Escuela Regional de Bomberos</div>
          <div className="module-identity-meta">Regional 4 · Escuela de Capacitación</div>
        </div>
      </div>
      {hasAccess && !isDepartmentOnly && (
        <nav className="tabs" aria-label="Secciones de Escuela">
          <NavLink to="/escuela" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            Cursos
          </NavLink>
          <NavLink to="/escuela/avales" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            Avales regionales
          </NavLink>
        </nav>
      )}
    </div>
  )
}
