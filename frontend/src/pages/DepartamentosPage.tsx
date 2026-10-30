import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { ActionMenu } from '../components/ui/ActionMenu'
import { DEPARTMENT_REPORT_TYPE_LABEL, fetchRecentDepartmentReports } from '../lib/api/departmentReports'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { fetchDepartmentBasicDirectory, fetchVisibleDepartments } from '../lib/api/departments'
import type { DepartmentBasic, DepartmentReport, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentosPage() {
  const { isAdmin, isDepartmentOnly } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // ?todos=1: quien trabaja en un solo departamento entra directo a ese; con esto ve la lista completa.
  const showAll = searchParams.get('todos') === '1'
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  // Ficha institucional de TODOS los departamentos (0119): la ve cualquier usuario activo.
  const [directory, setDirectory] = useState<DepartmentBasic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice, noticeTone] = useNavigationNotice()
  const { hasAnyAccess, canView } = useDepartmentReportsAccess()
  const [recentReports, setRecentReports] = useState<DepartmentReport[]>([])

  // Últimos informes de los departamentos que el usuario puede ver (RLS).
  useEffect(() => {
    if (!hasAnyAccess) return
    let active = true
    fetchRecentDepartmentReports(5)
      .then((data) => active && setRecentReports(data))
      .catch(() => {
        // Es un atajo: si falla, la lista de departamentos sigue sirviendo.
      })
    return () => {
      active = false
    }
  }, [hasAnyAccess])

  useEffect(() => {
    let active = true
    Promise.all([fetchVisibleDepartments(), fetchDepartmentBasicDirectory().catch(() => [] as DepartmentBasic[])])
      .then(([data, directoryData]) => {
        if (!active) return
        setDepartments(data)
        setDirectory(directoryData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los departamentos. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  // Modo departamento con un solo departamento: la lista no aporta nada, se
  // abre directo (replace: "Atrás" vuelve a donde estaba, no a la lista).
  const onlyDepartmentId = isDepartmentOnly && !showAll && !loading && !error && departments.length === 1 ? departments[0].id : null
  useEffect(() => {
    if (onlyDepartmentId) navigate(`/departamentos/${onlyDepartmentId}`, { replace: true })
  }, [onlyDepartmentId, navigate])

  const canCreateReports = departments.some((d) => d.is_active && canView(d.id))
  // Quien coordina un departamento activo puede dar de alta miembros nuevos (0120).
  const canCreateMembers = departments.some((d) => d.is_active && d.my_relation === 'coordinador')
  // Primero los propios (coordina o es miembro); después, para quien tiene
  // visión regional, el resto.
  const mine = departments.filter((d) => d.my_relation)
  const others = departments.filter((d) => !d.my_relation)
  // Los que no puede abrir por dentro: solo su ficha institucional.
  const internalIds = new Set(departments.map((d) => d.id))
  const generalOnly = directory.filter((d) => !internalIds.has(d.id))
  const sections = [
    { key: 'mine', title: mine.length === 1 ? 'Tu departamento' : 'Tus departamentos', items: mine },
    { key: 'others', title: mine.length > 0 ? 'Otros departamentos' : 'Departamentos', items: others },
  ].filter((s) => s.items.length > 0)
  const showGeneralSection = generalOnly.length > 0
  const generalTitle = sections.length > 0 ? 'Otros departamentos de la Regional' : 'Departamentos de la Regional'

  if (onlyDepartmentId) {
    return (
      <AppShell title="Mi departamento">
        <div className="loading-state" role="status">
          Abriendo tu departamento…
        </div>
      </AppShell>
    )
  }

  const heading = isDepartmentOnly ? 'Mis departamentos' : 'Departamentos'

  return (
    <AppShell title={heading}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{heading}</h1>
          <p className="page-subtitle">
            {others.length > 0
              ? 'Áreas de la Regional 4 con su coordinador, miembros, informes y actas. Es la única lista de departamentos: Escuela → Avales regionales usa estos mismos.'
              : mine.length > 0
                ? 'Los departamentos que coordinás o de los que sos miembro, con sus miembros, informes, actas y eventos. Del resto de los departamentos ves su ficha institucional.'
                : 'Los departamentos de la Regional 4 con su coordinador y contacto. Sus miembros, informes y actas los ven solo su coordinador y sus miembros.'}
          </p>
        </div>
        {(isAdmin || canCreateReports || canCreateMembers) && (
          <div className="page-header-actions">
            {isAdmin && (
              <Link to="/departamentos/nuevo" className={`btn ${canCreateReports ? 'btn-outlined' : 'btn-primary'}`}>
                <Icon name="plus" size={16} />
                Nuevo departamento
              </Link>
            )}
            {canCreateMembers && (
              <Link to="/departamentos/miembros/nuevo" className="btn btn-outlined">
                <Icon name="plus" size={16} />
                Nuevo miembro
              </Link>
            )}
            {canCreateReports && (
              <ActionMenu
                label="Nuevo informe"
                items={[
                  {
                    to: '/departamentos/informes/nuevo?modo=cargar',
                    label: 'Cargar informe o acta',
                    description: 'Subí un PDF, Word o una foto del papel.',
                    icon: 'file',
                  },
                  {
                    to: '/departamentos/informes/nuevo?modo=redactar',
                    label: 'Redactar informe',
                    description: 'Escribilo acá y sumá fotos si querés.',
                    icon: 'edit',
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {notice && <SuccessNotice message={notice} tone={noticeTone} onClose={() => setNotice(null)} />}

      {recentReports.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Últimos informes</h2>
          </div>
          <div className="card row-list" style={{ marginBottom: 20 }}>
            {recentReports.map((r) => (
              <Link key={r.id} to={`/departamentos/informes/${r.id}`} className="row-item">
                <div style={{ minWidth: 0 }}>
                  <div className="row-item-title">{r.title}</div>
                  <div className="row-item-meta">
                    {departments.find((d) => d.id === r.department_id)?.name ?? 'Departamento'} · {r.created_by_name ?? 'usuario eliminado'}
                  </div>
                </div>
                <span className="badge badge-info" style={{ flexShrink: 0 }}>
                  {DEPARTMENT_REPORT_TYPE_LABEL[r.report_type]}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando departamentos…</div>}
      {!loading && !error && departments.length === 0 && directory.length === 0 && (
        <div className="empty-state empty-state-action">
          {isAdmin ? (
            <>
              <span>Todavía no hay departamentos cargados.</span>
              <Link to="/departamentos/nuevo" className="btn btn-primary">
                <Icon name="plus" size={16} />
                Crear el primer departamento
              </Link>
            </>
          ) : (
            <>
              <span>No coordinás ningún departamento ni sos miembro de uno.</span>
              <span style={{ fontSize: 13 }}>Si deberías estar en uno, pedile a su coordinador o a Informática y Estadística que te sume.</span>
            </>
          )}
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} style={{ marginBottom: 20 }}>
          {(sections.length > 1 || recentReports.length > 0) && (
            <div className="section-header">
              <h2 className="section-title">{section.title}</h2>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {section.items.map((department) => (
              <Link
                key={department.id}
                to={`/departamentos/${department.id}`}
                className="card-solid"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{department.name}</h3>
                  {department.description && (
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{department.description}</p>
                  )}
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {department.coordinator_profile_id ? `Coordinador: ${department.coordinator_name ?? 'asignado'}` : 'Sin coordinador'} ·{' '}
                    {department.member_count === 1 ? '1 miembro' : `${department.member_count} miembros`}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {department.my_relation === 'coordinador' && <span className="badge badge-info">Coordinás</span>}
                  {department.my_relation === 'integrante' && <span className="badge badge-info">Sos miembro</span>}
                  <span className={`badge ${department.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {department.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {!loading && showGeneralSection && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-header">
            <h2 className="section-title">{generalTitle}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {generalOnly.map((department) => (
              <Link
                key={department.id}
                to={`/departamentos/${department.id}`}
                className="card-solid"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, overflowWrap: 'anywhere' }}>{department.name}</h3>
                  {department.description && (
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{department.description}</p>
                  )}
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {department.coordinator_name ? `Coordinador: ${department.coordinator_name}` : 'Sin coordinador'}
                  </p>
                </div>
                <span className={`badge ${department.is_active ? 'badge-success' : 'badge-danger'}`} style={{ flexShrink: 0 }}>
                  {department.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}
