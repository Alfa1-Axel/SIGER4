import type { VisibleDepartment } from '../types/database'

interface DepartmentChecklistProps {
  id: string
  label: string
  help: string
  departments: VisibleDepartment[]
  selected: string[]
  onChange: (next: string[]) => void
  // Lista de coordinación: avisa a quién reemplaza en cada departamento
  // (cada departamento tiene un solo coordinador).
  forCoordinator?: boolean
  error?: string
}

// Departamentos de un rol de departamento: uno o más, con casillas.
export function DepartmentChecklist({ id, label, help, departments, selected, onChange, forCoordinator, error }: DepartmentChecklistProps) {
  function toggle(departmentId: string) {
    onChange(selected.includes(departmentId) ? selected.filter((d) => d !== departmentId) : [...selected, departmentId])
  }

  return (
    <fieldset className="field department-checklist" aria-describedby={error ? `${id}-error` : `${id}-help`}>
      <legend className="field-label">{label}</legend>
      <p id={`${id}-help`} className="field-help" style={{ marginTop: 0 }}>
        {help}
      </p>
      <div className="department-assignments">
        {departments.map((d) => {
          const checked = selected.includes(d.id)
          const replaces = forCoordinator && checked && d.coordinator_profile_id ? d.coordinator_name ?? 'el coordinador actual' : null
          return (
            <label key={d.id} className="department-assignment department-check">
              <span className="department-assignment-name">
                <input type="checkbox" checked={checked} onChange={() => toggle(d.id)} style={{ width: 'auto' }} />
                <span>{d.name}</span>
                {!d.is_active && <span className="badge badge-warning">Inactivo</span>}
                {replaces && <span className="department-assignment-note">Reemplaza a {replaces} como coordinador.</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
