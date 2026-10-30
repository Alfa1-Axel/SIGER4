import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { fetchAvalesDepartments, fetchSchoolAvalMovements } from '../lib/api/schoolAvales'
import { describeSupabaseError } from '../lib/api/errors'
import type { AvalesDepartment, SchoolAvalMovement } from '../types/database'

const ALL = 'todos'

const ACTION_LABEL: Record<string, string> = {
  insert: 'Carga',
  renew: 'Renovación',
  update: 'Edición de datos',
  archive: 'Archivado',
  unarchive: 'Reactivación',
  delete: 'Eliminación',
}

const ACTION_BADGE: Record<string, string> = {
  insert: 'badge-success',
  renew: 'badge-info',
  update: 'badge-info',
  archive: 'badge-warning',
  unarchive: 'badge-success',
  delete: 'badge-danger',
}

const FIELD_LABEL: Record<string, string> = {
  title: 'el título',
  description: 'la descripción',
  observations: 'las observaciones',
  department_id: 'el departamento',
  reference_year: 'el año',
  person_name: 'el nombre de la persona',
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Lo que pasó, en una frase: "Ana Pérez renovó el aval de Juan Gómez."
function describeMovement(m: SchoolAvalMovement): string {
  const actor = m.actor_name ?? 'El sistema'
  const person = m.person_name ?? m.aval_title ?? 'una persona'
  switch (m.action) {
    case 'insert':
      return `${actor} cargó el aval de ${person}.`
    case 'renew':
      return `${actor} renovó el aval de ${person}: reemplazó ${m.previous_file_name ? `"${m.previous_file_name}"` : 'el archivo'} por "${m.file_name ?? 'archivo nuevo'}".`
    case 'update': {
      const fields = (m.changed_fields ?? []).map((f) => FIELD_LABEL[f] ?? f)
      return fields.length > 0 ? `${actor} cambió ${fields.join(', ')} del aval de ${person}.` : `${actor} actualizó el aval de ${person}.`
    }
    case 'archive':
      return `${actor} archivó el aval de ${person}.`
    case 'unarchive':
      return `${actor} volvió a activar el aval de ${person}.`
    case 'delete':
      return `${actor} eliminó el aval de ${person}${m.file_name ? ` ("${m.file_name}")` : ''}.`
    default:
      return `${actor} hizo un cambio en el aval de ${person}.`
  }
}

// Movimientos de Avales de las áreas que la persona audita: Informática R4 y el Coordinador de Escuela
// ven todas; el coordinador de un departamento, la suya. Es la auditoría de Avales en forma legible:
// quién hizo qué, cuándo y con qué motivo. La base entrega solo lo que corresponde (RLS).
export function AvalMovimientosPage() {
  const [movements, setMovements] = useState<SchoolAvalMovement[]>([])
  const [departments, setDepartments] = useState<AvalesDepartment[]>([])
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    Promise.all([fetchSchoolAvalMovements(departmentId === ALL ? null : departmentId), fetchAvalesDepartments()])
      .then(([rows, deps]) => {
        if (!active) return
        setMovements(rows)
        setDepartments(deps)
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los movimientos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [departmentId])

  const auditedDepartments = useMemo(() => departments.filter((d) => d.can_manage), [departments])

  return (
    <AppShell title="Movimientos de avales">
      <EscuelaHeader />
      <Link to="/escuela/avales" className="back-link">
        ← Volver a Avales
      </Link>
      <h1 className="page-title">Movimientos de avales</h1>
      <p className="page-subtitle">
        Cargas, renovaciones, ediciones, archivados y eliminaciones de las áreas que administrás, con quién las hizo y el motivo. Es el registro
        de auditoría de Avales; no incluye otras secciones ni áreas ajenas.
      </p>

      {auditedDepartments.length > 1 && (
        <div className="filter-chips" role="group" aria-label="Filtrar por departamento">
          <button type="button" className="chip" aria-pressed={departmentId === ALL} onClick={() => setDepartmentId(ALL)}>
            Todos
          </button>
          {auditedDepartments.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={departmentId === d.id} onClick={() => setDepartmentId(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="loading-state" role="status">Cargando movimientos…</div>}

      {!loading && loadError && (
        <div className="alert alert-danger" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && movements.length === 0 && <div className="empty-state">Todavía no hay movimientos para mostrar.</div>}

      {!loading && !loadError && movements.length > 0 && (
        <div className="avales-list">
          {movements.map((m) => (
            <div key={m.id} className="card-solid list-item aval-movement">
              <div className="list-item-body">
                <h3 className="list-item-title">{describeMovement(m)}</h3>
                {m.reason && (
                  <p className="list-item-subtitle">
                    <strong>Motivo:</strong> {m.reason}
                  </p>
                )}
                <div className="list-item-meta">
                  <span className={`badge ${ACTION_BADGE[m.action] ?? 'badge-info'}`}>{ACTION_LABEL[m.action] ?? m.action}</span>
                  {m.department_name && <span className="badge badge-info">{m.department_name}</span>}
                  {m.aval_title && <span className="aval-movement-title">{m.aval_title}</span>}
                  {m.reference_year && <span>Año {m.reference_year}</span>}
                  <span>{formatDateTime(m.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
