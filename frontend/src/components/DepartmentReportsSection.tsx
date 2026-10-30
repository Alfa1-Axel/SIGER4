import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { DEPARTMENT_REPORT_TYPE_LABEL, DEPARTMENT_REPORT_TYPES, fetchDepartmentReports } from '../lib/api/departmentReports'
import { describeSupabaseError } from '../lib/api/errors'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import type { DepartmentReportType, DepartmentReportWithFiles } from '../types/database'

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { dateStyle: 'medium' })
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

interface Props {
  departmentId: string
  departmentActive: boolean
}

// Informes y actas de un departamento (0098), dentro de su detalle. Solo
// los ven Informática, el coordinador y los integrantes; al resto se le
// explica quién tiene acceso en lugar de mostrar una lista vacía.
export function DepartmentReportsSection({ departmentId, departmentActive }: Props) {
  const { canView } = useDepartmentReportsAccess()
  const allowed = canView(departmentId)
  const [reports, setReports] = useState<DepartmentReportWithFiles[]>([])
  const [loading, setLoading] = useState(allowed)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<DepartmentReportType | ''>('')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!allowed) return
    let active = true
    setLoading(true)
    fetchDepartmentReports(departmentId)
      .then((data) => active && setReports(data))
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los informes. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [allowed, departmentId])

  const archivedCount = reports.filter((r) => r.is_archived).length
  const visible = useMemo(
    () => reports.filter((r) => (showArchived || !r.is_archived) && (!typeFilter || r.report_type === typeFilter)),
    [reports, showArchived, typeFilter],
  )

  const newHref = (mode: 'redactar' | 'cargar') => `/departamentos/informes/nuevo?modo=${mode}&departamento=${departmentId}`

  return (
    <section aria-labelledby="informes-title" style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2 className="section-title" id="informes-title">
          Informes y actas
        </h2>
      </div>

      {!allowed ? (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="lock" size={18} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>
            Los informes y actas de este departamento los ven su coordinador, sus miembros e Informática.
          </p>
        </div>
      ) : (
        <>
          {reports.length > 0 && (
            <div className="filters-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <label className="sr-only" htmlFor="report-type-filter">
                Filtrar por tipo
              </label>
              <select
                id="report-type-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DepartmentReportType | '')}
                style={{ maxWidth: 260 }}
              >
                <option value="">Todos los tipos</option>
                {DEPARTMENT_REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DEPARTMENT_REPORT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              {archivedCount > 0 && (
                <label className="check-row" style={{ margin: 0 }}>
                  <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                  Mostrar archivados ({archivedCount})
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="alert alert-danger" role="alert">{error}</div>
          )}
          {loading && <div className="loading-state" role="status">Cargando informes…</div>}

          {!loading && !error && reports.length === 0 && (
            <div className="empty-state empty-state-action">
              <span>Todavía no hay informes. Cargá un acta o redactá el informe de una actividad.</span>
              {departmentActive ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Link to={newHref('cargar')} className="btn btn-primary">
                    <Icon name="file" size={16} />
                    Cargar informe o acta
                  </Link>
                  <Link to={newHref('redactar')} className="btn btn-outlined">
                    <Icon name="edit" size={16} />
                    Redactar informe
                  </Link>
                </div>
              ) : (
                <span style={{ fontSize: 13 }}>El departamento está inactivo: no admite informes nuevos.</span>
              )}
            </div>
          )}

          {!loading && reports.length > 0 && visible.length === 0 && (
            <div className="empty-state">Ningún informe coincide con el filtro.</div>
          )}

          {visible.length > 0 && (
            <div className="card row-list">
              {visible.map((r) => {
                const docs = r.files.filter((f) => f.file_kind === 'documento').length
                const photos = r.files.filter((f) => f.file_kind === 'imagen').length
                const videos = r.files.filter((f) => f.file_kind === 'video').length
                const parts = [
                  docs ? countLabel(docs, 'documento', 'documentos') : null,
                  photos ? countLabel(photos, 'foto', 'fotos') : null,
                  videos ? countLabel(videos, 'video', 'videos') : null,
                ].filter(Boolean)
                return (
                  <Link key={r.id} to={`/departamentos/informes/${r.id}`} className="row-item">
                    <div style={{ minWidth: 0 }}>
                      <div className="row-item-title">{r.title}</div>
                      <div className="row-item-meta">
                        {formatDate(r.report_date)} · {r.created_by_name ?? 'usuario eliminado'}
                        {parts.length > 0 && ` · ${parts.join(', ')}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {r.is_archived && <span className="badge badge-warning">Archivado</span>}
                      <span className="badge badge-info">{DEPARTMENT_REPORT_TYPE_LABEL[r.report_type]}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
