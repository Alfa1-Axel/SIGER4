import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { ActionMenu } from '../components/ui/ActionMenu'
import { DEPARTMENT_REPORT_TYPE_LABEL, fetchRecentDepartmentReports } from '../lib/api/departmentReports'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { fetchVisibleDepartments } from '../lib/api/departments'
import type { DepartmentReport, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentosPage() {
  const { isAdmin } = useAuth()
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
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
    fetchVisibleDepartments()
      .then((data) => active && setDepartments(data))
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los departamentos. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const canCreateReports = departments.some((d) => d.is_active && canView(d.id))
  // Primero los propios (coordina o es miembro); después, para quien tiene
  // visión regional, el resto.
  const mine = departments.filter((d) => d.my_relation)
  const others = departments.filter((d) => !d.my_relation)
  const sections = [
    { key: 'mine', title: mine.length === 1 ? 'Tu departamento' : 'Tus departamentos', items: mine },
    { key: 'others', title: mine.length > 0 ? 'Otros departamentos' : 'Departamentos', items: others },
  ].filter((s) => s.items.length > 0)

  return (
    <AppShell title="Departamentos">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departamentos</h1>
          <p className="page-subtitle">
            {others.length > 0
              ? 'Áreas de la Regional 4 con su coordinador, miembros, informes y actas. Es la única lista de departamentos: Escuela → Avales regionales usa estos mismos.'
              : 'Los departamentos que coordinás o de los que sos miembro, con sus miembros, informes, actas y eventos.'}
          </p>
        </div>
        {(isAdmin || canCreateReports) && (
          <div className="page-header-actions">
            {isAdmin && (
              <Link to="/departamentos/nuevo" className={`btn ${canCreateReports ? 'btn-outlined' : 'btn-primary'}`}>
                <Icon name="plus" size={16} />
                Nuevo departamento
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
      {!loading && !error && departments.length === 0 && (
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
              <span style={{ fontSize: 13 }}>Si deberías estar en uno, pedile a su coordinador o a Informática que te sume.</span>
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
    </AppShell>
  )
}
