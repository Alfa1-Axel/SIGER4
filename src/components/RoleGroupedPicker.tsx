import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { groupRolesByCategory } from '../types/roles'
import type { RoleDefinition, RoleKey } from '../types/roles'

interface RoleGroupedPickerProps {
  // Roles que se ofrecen (ya filtrados según quién está asignando).
  roles: RoleDefinition[]
  selected: RoleKey[]
  onToggle: (role: RoleKey) => void
  disabled?: boolean
  // Roles que se ven pero no se tocan desde acá, con el motivo (por ejemplo,
  // los de departamento en la ficha: se asignan eligiendo los departamentos).
  lockedRoles?: RoleKey[]
  lockedNote?: string
}

// Selector de roles agrupado por tipo/nivel (Informática, Escuela, Regional,
// Cuartel, Otros), con la descripción y el alcance de cada rol a la vista.
export function RoleGroupedPicker({ roles, selected, onToggle, disabled, lockedRoles = [], lockedNote }: RoleGroupedPickerProps) {
  const groups = groupRolesByCategory(roles)

  return (
    <div className="role-groups">
      {groups.map(({ category, roles: groupRoles }) => (
        <section key={category.key} aria-label={category.label}>
          <div className="role-group-header">
            <span className="role-group-title">{category.label}</span>
            <span className="role-group-description">{category.description}</span>
          </div>
          <div className="role-group-options">
            {groupRoles.map((role) => {
              const isSelected = selected.includes(role.key)
              const isLocked = lockedRoles.includes(role.key)
              return (
                <button
                  key={role.key}
                  type="button"
                  className={`role-option${isSelected ? ' role-option--selected' : ''}`}
                  aria-pressed={isSelected}
                  disabled={disabled || isLocked}
                  onClick={() => onToggle(role.key)}
                >
                  <span className="role-option-check" aria-hidden="true">
                    {isSelected && <Icon name="check" size={12} />}
                  </span>
                  <span className="role-option-body">
                    <span className="role-option-label">{role.label}</span>
                    <span className="role-option-description">{role.description}</span>
                    <span className="role-option-scope">Alcance: {role.scopeLabel}</span>
                    {isLocked && lockedNote && <span className="role-option-scope">{lockedNote}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <Link to="/roles" className="link-muted" target="_blank" rel="noopener noreferrer">
        Ver qué permite cada rol (guía de roles y permisos)
      </Link>
    </div>
  )
}
