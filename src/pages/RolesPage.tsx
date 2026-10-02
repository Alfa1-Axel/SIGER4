import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../hooks/useAuth'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { fetchAvalesDepartments } from '../lib/api/schoolAvales'
import { DEPARTMENT_COORDINATOR_INFO, RETIRED_ROLE_DEFINITIONS, ROLE_DEFINITIONS, SCOPE_LEVELS, groupRolesByCategory } from '../types/roles'
import type { AvalesDepartment } from '../types/database'

// Guía de roles y permisos: todos los roles agrupados por tipo/nivel, con su
// función, su alcance y sus permisos principales. Es solo informativa (no
// asigna nada) y la puede abrir cualquier usuario. Incluye al coordinador de
// departamento, que no es un rol sino el campo "Coordinador" de la sección
// Departamentos; la lista de departamentos con su coordinador solo la ve
// quien tiene acceso a Avales.
export function RolesPage() {
  const { roles: myRoles, isAdmin, coordinatedDepartmentIds } = useAuth()
  const { hasAccess } = useSchoolAvalesAccess()
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

  // Los roles retirados solo se listan si el usuario todavía tiene uno: la
  // guía describe los roles vigentes.
  const groups = useMemo(() => groupRolesByCategory([...ROLE_DEFINITIONS, ...RETIRED_ROLE_DEFINITIONS.filter((r) => myRoles.includes(r.key))]), [myRoles])
  const isCoordinator = coordinatedDepartmentIds.length > 0

  return (
    <AppShell title="Roles y permisos">
      <h1 className="page-title">Roles y permisos</h1>
      <p className="page-subtitle">
        Qué función cumple cada rol, en qué alcance y qué puede hacer. Agrupados por tipo y nivel.
      </p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div className="kpi-label" style={{ marginBottom: 8 }}>
          Niveles de alcance
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SCOPE_LEVELS.map((level) => (
            <div key={level.label} style={{ fontSize: 13 }}>
              <strong>{level.label}:</strong> <span style={{ color: 'var(--color-text-secondary)' }}>{level.description}</span>
            </div>
          ))}
        </div>
      </div>

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
                    <strong>Alcance:</strong> {role.scopeLabel}
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

        <section aria-label="Coordinación de departamentos">
          <div className="role-group-header">
            <span className="role-group-title">Departamentos</span>
            <span className="role-group-description">Coordinación de un departamento de la sección Departamentos.</span>
          </div>
          <div className="role-group-options">
            <article className="role-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>{DEPARTMENT_COORDINATOR_INFO.label}</h3>
                {isCoordinator && <span className="badge badge-success">Tu función</span>}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{DEPARTMENT_COORDINATOR_INFO.description}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                <strong>Alcance:</strong> {DEPARTMENT_COORDINATOR_INFO.scopeLabel}
              </p>
              <ul className="role-permissions">
                {DEPARTMENT_COORDINATOR_INFO.permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </article>
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
