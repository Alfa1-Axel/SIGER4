import type { VisibleDepartment } from '../types/database'

type Relation = 'none' | 'integrante' | 'coordinador'

interface DepartmentAssignmentPickerProps {
  departments: VisibleDepartment[]
  coordinates: string[]
  memberOf: string[]
  onChange: (next: { coordinates: string[]; memberOf: string[] }) => void
  // Perfil que se está editando: para no avisar "reemplaza a" cuando ya es
  // el coordinador.
  profileId?: string
  disabled?: boolean
}

const OPTIONS: { value: Relation; label: string }[] = [
  { value: 'none', label: 'No' },
  { value: 'integrante', label: 'Integrante' },
  { value: 'coordinador', label: 'Coordinador' },
]

// Coordinación e integración de una persona en cada departamento. Cada
// departamento tiene un solo coordinador: elegir a esta persona reemplaza al
// actual (se avisa en la fila).
export function DepartmentAssignmentPicker({ departments, coordinates, memberOf, onChange, profileId, disabled }: DepartmentAssignmentPickerProps) {
  function relationOf(id: string): Relation {
    if (coordinates.includes(id)) return 'coordinador'
    if (memberOf.includes(id)) return 'integrante'
    return 'none'
  }

  function setRelation(id: string, relation: Relation) {
    const withoutCoord = coordinates.filter((d) => d !== id)
    const withoutMember = memberOf.filter((d) => d !== id)
    if (relation === 'coordinador') onChange({ coordinates: [...withoutCoord, id], memberOf })
    else if (relation === 'integrante') onChange({ coordinates: withoutCoord, memberOf: [...withoutMember, id] })
    else onChange({ coordinates: withoutCoord, memberOf: withoutMember })
  }

  return (
    <div className="department-assignments">
      {departments.map((d) => {
        const relation = relationOf(d.id)
        const replaces = relation === 'coordinador' && d.coordinator_profile_id && d.coordinator_profile_id !== profileId ? d.coordinator_name ?? 'el coordinador actual' : null
        return (
          <div key={d.id} className="department-assignment">
            <div className="department-assignment-name">
              <span>{d.name}</span>
              {!d.is_active && <span className="badge badge-warning">Inactivo</span>}
              {replaces && <span className="department-assignment-note">Reemplaza a {replaces} como coordinador.</span>}
            </div>
            <div className="department-assignment-options" role="group" aria-label={`Relación con ${d.name}`}>
              {OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="chip"
                  aria-pressed={relation === option.value}
                  disabled={disabled}
                  onClick={() => setRelation(d.id, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
