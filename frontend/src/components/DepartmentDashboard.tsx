import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { VisibleDepartment } from '../types/database'

const SELECTED_KEY = 'siger4:inicio-departamento'

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

function saveSelected(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id)
  } catch {
    // Sin almacenamiento local: se vuelve a elegir el primero.
  }
}

// Inicio de un coordinador o miembro: su departamento y las cuatro o cinco
// cosas que hace ahí, sin listas (los informes, los eventos y los avisos están
// en sus pantallas; lo que pide atención está en Pendientes). Si tiene
// varios, los distingue con un selector.
export function DepartmentDashboard({ departments }: { departments: VisibleDepartment[] }) {
  const { hasAccess: hasAvalesAccess, canLoad: canLoadAval } = useSchoolAvalesAccess()
  // Primero los que coordina.
  const mine = [...departments.filter((d) => d.my_relation === 'coordinador'), ...departments.filter((d) => d.my_relation === 'integrante')]
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = mine.find((d) => d.id === selectedId) ?? mine.find((d) => d.id === readSelected()) ?? mine[0] ?? null
  if (!selected) return null

  function choose(id: string) {
    setSelectedId(id)
    saveSelected(id)
  }

  const isCoordinator = selected.my_relation === 'coordinador'

  return (
    <section className="dept-dashboard" aria-label="Tu departamento">
      <div className="section-header">
        <h2 className="section-title">{mine.length > 1 ? 'Tus departamentos' : 'Tu departamento'}</h2>
      </div>

      {mine.length > 1 && (
        <div className="filter-bar filter-bar--scroll" role="group" aria-label="Elegir departamento">
          {mine.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={d.id === selected.id} onClick={() => choose(d.id)}>
              {d.name}
              <span className="dept-chip-relation">{d.my_relation === 'coordinador' ? 'Coordinás' : 'Miembro'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card-solid dept-dashboard-card">
        <div className="dept-dashboard-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="dept-dashboard-title">{selected.name}</h3>
            <p className="dept-dashboard-meta">
              {isCoordinator ? 'Coordinás este departamento' : 'Sos miembro de este departamento'} ·{' '}
              {selected.member_count === 1 ? '1 miembro' : `${selected.member_count} miembros`}
              {!isCoordinator && selected.coordinator_name ? ` · Coordina ${selected.coordinator_name}` : ''}
            </p>
          </div>
          <Link to={`/departamentos/${selected.id}`} className="link-muted dept-dashboard-open">
            Ver departamento →
          </Link>
        </div>

        {selected.is_active && (
          <div className="dept-dashboard-actions">
            <Link to={`/departamentos/informes/nuevo?modo=cargar&departamento=${selected.id}`} className="btn btn-primary btn-sm">
              <Icon name="file" size={14} />
              Cargar informe
            </Link>
            <Link to={`/departamentos/${selected.id}#informes`} className="btn btn-outlined btn-sm">
              Ver informes
            </Link>
            <Link to={`/documentos/departamentos/${selected.id}`} className="btn btn-outlined btn-sm">
              Ver documentos
            </Link>
            <Link to="/calendario" className="btn btn-outlined btn-sm">
              <Icon name="calendar" size={14} />
              Ver calendario
            </Link>
            {isCoordinator && (
              <Link to={`/notificaciones/nueva?departamento=${selected.id}`} className="btn btn-outlined btn-sm">
                <Icon name="bell" size={14} />
                Avisar al departamento
              </Link>
            )}
            {isCoordinator && hasAvalesAccess && (
              <Link to={`/escuela/avales?departamento=${selected.id}`} className="btn btn-outlined btn-sm">
                <Icon name="school" size={14} />
                Ver avales
              </Link>
            )}
            {!isCoordinator && canLoadAval && (
              <Link to="/escuela/avales" className="btn btn-outlined btn-sm">
                <Icon name="school" size={14} />
                Mi aval
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
