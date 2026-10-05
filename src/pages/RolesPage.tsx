import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { RoleAssignmentsList } from '../components/RoleAssignmentsList'
import { useAuth } from '../hooks/useAuth'
import { useMyRoleAssignments } from '../hooks/useMyRoleAssignments'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { fetchAvalesDepartments } from '../lib/api/schoolAvales'
import { DEPARTMENT_ROLE_DEFINITIONS, RETIRED_ROLE_DEFINITIONS, ROLE_DEFINITIONS, SCOPE_LEVELS, groupRolesByCategory, roleDivisionNeed } from '../types/roles'
import type { RoleDefinition } from '../types/roles'
import type { AvalesDepartment } from '../types/database'

// Ejemplos de rol + división -> qué ve. Mismo modelo que la base (0103).
const EXAMPLES: { role: string; division: string; result: string }[] = [
  { role: 'Coordinador de departamento', division: 'Fuego', result: 'Ve y gestiona Fuego. No ve Forestal ni FASME.' },
  { role: 'Integrante de departamento', division: 'Forestal', result: 'Ve y carga informes y eventos de Forestal.' },
  { role: 'Coordinador o Secretario de Escuela', division: 'Escuela Regional', result: 'Ve los avales de todos los departamentos.' },
  { role: 'Jefe de Cuerpo Activo', division: 'Su cuartel', result: 'Ve y edita los datos de su cuartel. No ve otros cuarteles.' },
  { role: 'Secretario Regional', division: 'Su Regional', result: 'Ve los cuarteles y departamentos de la Regional.' },
  { role: 'Informática', division: 'Todo el sistema', result: 'Ve todo. La Auditoría es solo de Dpto. Informática y Estadística R4.' },
]

function divisionText(role: RoleDefinition): string {
  const need = roleDivisionNeed(role.key)
  if (need === 'station') return 'Se asigna con un cuartel.'
  if (need === 'region') return 'Se asigna con una Regional.'
  if (!role.assignable) return 'Rol retirado.'
  return role.scope === 'system' ? 'No pide división: aplica a todo el sistema.' : 'No pide división: aplica a toda la Escuela.'
}

// Guía de roles: qué hace cada rol (rol), dónde (división) y qué datos ve
// (alcance). Solo informa: la autorización real está en la base.
export function RolesPage() {
  const { roles: myRoles, isAdmin, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const { hasAccess } = useSchoolAvalesAccess()
  const myAssignments = useMyRoleAssignments()
  const [departments, setDepartments] = useState<AvalesDepartment[]>([])

  useEffect(() => {
    if (!hasAccess) return
    let active = true
    fetchAvalesDepartments()
      .then((data) => active && setDepartments(data))
      .catch(() => active && setDepartments([]))
    return () => {
      active = false
    }
  }, [hasAccess])

  // Los roles retirados solo se listan si el usuario todavía tiene uno.
  const groups = useMemo(() => groupRolesByCategory([...ROLE_DEFINITIONS, ...RETIRED_ROLE_DEFINITIONS.filter((r) => myRoles.includes(r.key))]), [myRoles])
  const myDepartmentRoles = {
    coordinador_departamento: coordinatedDepartmentIds.length > 0,
    integrante_departamento: memberDepartmentIds.length > 0,
  }

  return (
    <AppShell title="Roles y permisos">
      <h1 className="page-title">Roles y permisos</h1>
      <p className="page-subtitle">
        El <strong>rol</strong> define qué podés hacer. La <strong>división</strong> (cuartel, Regional, Escuela o departamento) define
        dónde. Juntos deciden qué datos ves.
      </p>

      {myAssignments.length > 0 && (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="kpi-label" style={{ marginBottom: 8 }}>
            Tus roles
          </div>
          <RoleAssignmentsList assignments={myAssignments} />
        </div>
      )}

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div className="kpi-label" style={{ marginBottom: 8 }}>
          Ejemplos
        </div>
        <div className="role-examples">
          {EXAMPLES.map((e) => (
            <div key={e.role} className="role-example">
              <span className="role-example-role">{e.role}</span>
              <span className="role-example-division">{e.division}</span>
              <span className="role-example-result">{e.result}</span>
            </div>
          ))}
        </div>
      </div>

      <details className="card-solid" style={{ marginBottom: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Niveles de alcance</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {SCOPE_LEVELS.map((level) => (
            <div key={level.label} style={{ fontSize: 13 }}>
              <strong>{level.label}:</strong> <span style={{ color: 'var(--color-text-secondary)' }}>{level.description}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="role-groups">
        {groups.map(({ category, roles }) => (
          <section key={category.key} aria-label={category.label}>
            <div className="role-group-header">
              <span className="role-group-title">{category.label}</span>
              <span className="role-group-description">{category.description}</span>
            </div>
            <div className="role-group-options">
              {roles.map((role) => (
                <article key={role.key} className="role-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>{role.label}</h3>
                    {myRoles.includes(role.key) && <span className="badge badge-success">Tu rol</span>}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>{role.description}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    <strong>División:</strong> {divisionText(role)} <strong>Alcance:</strong> {role.scopeLabel}
                  </p>
                  <ul className="role-permissions">
                    {role.permissions.map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section aria-label="Departamentos">
          <div className="role-group-header">
            <span className="role-group-title">Departamentos</span>
            <span className="role-group-description">
              Roles de división: se asignan eligiendo uno o más departamentos, no como roles del sistema.
            </span>
          </div>
          <div className="role-group-options">
            {DEPARTMENT_ROLE_DEFINITIONS.map((role) => (
              <article key={role.key} className="role-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{role.label}</h3>
                  {myDepartmentRoles[role.key] && <span className="badge badge-success">Tu rol</span>}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>{role.description}</p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                  <strong>División:</strong> se asigna con uno o más departamentos. <strong>Alcance:</strong> {role.scopeLabel}
                </p>
                <ul className="role-permissions">
                  {role.permissions.map((permission) => (
                    <li key={permission}>{permission}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {departments.length > 0 && (
            <div className="card row-list" style={{ marginTop: 8 }}>
              {departments.map((department) => (
                <div key={department.id} className="row-item">
                  <div style={{ minWidth: 0 }}>
                    <div className="row-item-title">
                      {department.name}
                      {!department.is_active && (
                        <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="row-item-meta">{department.coordinator_name ? `Coordinador: ${department.coordinator_name}` : 'Sin coordinador asignado'}</div>
                  </div>
                  {isAdmin && (
                    <Link to={`/departamentos/${department.id}`} className="link-muted">
                      Ver
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
