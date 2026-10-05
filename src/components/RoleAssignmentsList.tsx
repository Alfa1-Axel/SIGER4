import { Icon } from './ui/Icon'
import type { RoleAssignment } from '../lib/roleAssignments'

// Roles con su división, en lenguaje de todos los días: "Jefe de Cuerpo
// Activo · Cuartel Villa del Rosario". Marca los que no tienen la división
// que necesitan.
export function RoleAssignmentsList({ assignments }: { assignments: RoleAssignment[] }) {
  if (assignments.length === 0) return <p className="field-help">Sin roles asignados.</p>
  return (
    <ul className="role-assignments">
      {assignments.map((a) => (
        <li key={a.key} className={`role-assignment${a.missing ? ' role-assignment--missing' : ''}`}>
          <span className="role-assignment-role">{a.role}</span>
          <span className="role-assignment-division">
            {a.missing && <Icon name="info" size={14} />}
            {a.division}
          </span>
        </li>
      ))}
    </ul>
  )
}
