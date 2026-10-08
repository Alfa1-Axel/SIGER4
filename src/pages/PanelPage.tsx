import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { PendientesResumen } from '../components/PendientesResumen'
import { DepartmentDashboard } from '../components/DepartmentDashboard'
import { DepartmentHome } from '../components/DepartmentHome'
import { HomeAgenda } from '../components/HomeAgenda'
import { HomeResumen } from '../components/HomeResumen'
import { openGlobalSearch } from '../lib/searchControl'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { buildHomeActions } from '../lib/homeActions'
import { greeting, longToday } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { DEPARTMENT_ROLES, roleLabel } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { VisibleDepartment } from '../types/database'

const DOCUMENT_UPLOAD_ROLES: RoleKey[] = ['secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo']

// Inicio: la puerta de entrada. Saludo, accesos rápidos según el rol,
// pendientes y, a lo sumo, un resumen y los próximos eventos. Nada más: cada
// cosa tiene su pantalla. Quien solo es Coordinador o Miembro de Departamento
// tiene un Inicio propio, con su departamento (DepartmentHome).
export function PanelPage() {
  const { isDepartmentOnly } = useAuth()
  return isDepartmentOnly ? <DepartmentHome /> : <GeneralHome />
}

function GeneralHome() {
  const { profile, roles, isAdmin, isSuperAdmin, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const { canRequest, ownStationIds } = useLoanRequestAccess()
  const canUploadDocuments = isAdmin || hasRole(...DOCUMENT_UPLOAD_ROLES)

  // Departamentos que coordina o de los que es miembro, con su rol (0106).
  const [myDepartments, setMyDepartments] = useState<VisibleDepartment[]>([])
  const hasDepartments = coordinatedDepartmentIds.length > 0 || memberDepartmentIds.length > 0
  useEffect(() => {
    if (!hasDepartments) return
    let active = true
    fetchVisibleDepartments()
      .then((list) => active && setMyDepartments(list.filter((d) => d.my_relation)))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [hasDepartments, coordinatedDepartmentIds, memberDepartmentIds])
  const coordinatedNames = myDepartments.filter((d) => d.my_relation === 'coordinador').map((d) => d.name)
  const memberNames = myDepartments.filter((d) => d.my_relation === 'integrante').map((d) => d.name)

  const actions = buildHomeActions({
    isAdmin,
    isSuperAdmin,
    hasRole,
    ownStationId: ownStationIds[0] ?? null,
    canRequestLoans: canRequest,
    hasAvalesAccess,
    canUploadDocuments,
  })

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  // Los roles de departamento se muestran con su departamento ("Coordinador
  // de Fuego"), no con el nombre genérico del rol.
  const roleSummary = [
    ...roles
      .filter((r) => r !== 'administrativo' && r !== 'coordinador_departamento_escuela' && !DEPARTMENT_ROLES.includes(r))
      .map((r) => roleLabel(r)),
    ...(coordinatedNames.length ? [`Coordinador de ${coordinatedNames.join(', ')}`] : []),
    ...(memberNames.length ? [`Miembro de ${memberNames.join(', ')}`] : []),
  ]

  return (
    <AppShell title="Inicio">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="page-subtitle">
            {longToday()}
            {roleSummary.length > 0 && ` · ${roleSummary.slice(0, 2).join(' · ')}`}
          </p>
        </div>
      </div>

      <button type="button" className="home-search" onClick={openGlobalSearch}>
        <Icon name="search" size={18} />
        <span>Buscar en SIGER4: usuarios, documentos, informes, elementos…</span>
      </button>

      <nav className="quick-actions" aria-label="Accesos rápidos">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="quick-action">
            <span className="list-item-icon">
              <Icon name={a.icon} size={18} />
            </span>
            <span className="quick-action-text">
              <strong>{a.label}</strong>
              <span>{a.description}</span>
            </span>
          </Link>
        ))}
      </nav>

      <PendientesResumen />

      {myDepartments.length > 0 && <DepartmentDashboard departments={myDepartments} />}

      <HomeResumen />

      <HomeAgenda />
    </AppShell>
  )
}
