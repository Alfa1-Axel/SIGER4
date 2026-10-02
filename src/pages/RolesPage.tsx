import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../hooks/useAuth'
import { fetchSchoolDepartmentMembers, fetchSchoolDepartments } from '../lib/api/schoolAvales'
import { fetchProfiles } from '../lib/api/users'
import { RETIRED_ROLE_DEFINITIONS, ROLE_DEFINITIONS, SCOPE_LEVELS, groupRolesByCategory } from '../types/roles'
import type { SchoolDepartment, SchoolDepartmentMember } from '../types/database'

// Guía de roles y permisos: todos los roles agrupados por tipo/nivel, con su
// función, su alcance y sus permisos principales. Es solo informativa (no
// asigna nada) y la puede abrir cualquier usuario. El listado de
// departamentos internos de Escuela sale de RLS: solo lo ve quien tiene
// acceso a Avales; los coordinadores asignados, solo Informática.
export function RolesPage() {
  const { roles: myRoles, isAdmin } = useAuth()
  const [departments, setDepartments] = useState<SchoolDepartment[]>([])
  const [members, setMembers] = useState<SchoolDepartmentMember[]>([])
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let active = true
    Promise.all([
      fetchSchoolDepartments().catch(() => []),
      isAdmin ? fetchSchoolDepartmentMembers().catch(() => []) : Promise.resolve([]),
      isAdmin ? fetchProfiles().catch(() => []) : Promise.resolve([]),
    ]).then(([departmentsData, membersData, profilesData]) => {
      if (!active) return
      setDepartments(departmentsData)
      setMembers(membersData)
      setProfileNames(new Map(profilesData.map((p) => [p.id, p.full_name])))
    })
    return () => {
      active = false
    }
  }, [isAdmin])

  // Los roles retirados solo se listan si alguien los tiene (hoy, nadie
  // debería): la guía describe los roles vigentes.
  const groups = useMemo(() => groupRolesByCategory([...ROLE_DEFINITIONS, ...RETIRED_ROLE_DEFINITIONS.filter((r) => myRoles.includes(r.key))]), [myRoles])

  function coordinatorsOf(departmentId: string): string {
    const names = members.filter((m) => m.department_id === departmentId).map((m) => profileNames.get(m.profile_id) ?? 'Usuario')
    return names.length > 0 ? names.join(', ') : 'Sin coordinador asignado'
  }

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

            {category.key === 'departamento_escuela' && departments.length > 0 && (
              <div className="card" style={{ marginTop: 8 }}>
                <div className="kpi-label" style={{ marginBottom: 6 }}>
                  Departamentos internos de Escuela
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {departments.map((department) => (
                    <div key={department.id} style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                      <strong>{department.name}</strong>
                      {!department.is_active && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Inactivo</span>}
                      {isAdmin && <span style={{ color: 'var(--color-text-secondary)' }}> · {coordinatorsOf(department.id)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </AppShell>
  )
}
