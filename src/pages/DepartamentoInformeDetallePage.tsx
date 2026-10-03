import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { fetchDepartmentById } from '../lib/api/departments'
import {
  DEPARTMENT_REPORT_TYPE_LABEL,
  deleteDepartmentReport,
  fetchDepartmentReport,
  setDepartmentReportArchived,
} from '../lib/api/departmentReports'
import { getDepartmentReportFileUrl, getDepartmentReportFileUrls } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { formatBytes } from '../lib/format'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import type { Department, DepartmentReportFile, DepartmentReportWithFiles } from '../types/database'

// Fotos que el navegador puede mostrar como miniatura (HEIC no, salvo Safari).
const PREVIEWABLE_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatDate(value: string): string {
  // report_date viene como YYYY-MM-DD: se arma en hora local para que no
  // se corra un día por la zona horaria.
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { dateStyle: 'long' })
}

export function DepartamentoInformeDetallePage() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const { canManage, canDelete } = useDepartmentReportsAccess()
  const [notice, setNotice, noticeTone] = useNavigationNotice()

  const [report, setReport] = useState<DepartmentReportWithFiles | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    let active = true
    setLoading(true)
    fetchDepartmentReport(reportId)
      .then(async (data) => {
        if (!active) return
        setReport(data)
        if (!data) return
        const [dep, urls] = await Promise.all([
          fetchDepartmentById(data.department_id),
          getDepartmentReportFileUrls(
            data.files.filter((f) => (f.file_kind === 'imagen' && PREVIEWABLE_IMAGES.has(f.mime_type)) || f.file_kind === 'video').map((f) => f.storage_path),
          ),
        ])
        if (!active) return
        setDepartment(dep)
        setMediaUrls(urls)
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar el informe. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reportId])

  async function handleOpen(file: DepartmentReportFile, download: boolean) {
    setActionError(null)
    setBusy(`${download ? 'download' : 'open'}:${file.id}`)
    try {
      const url = await getDepartmentReportFileUrl(file.storage_path, download ? file.file_name : undefined)
      if (download) {
        const link = document.createElement('a')
        link.href = url
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos abrir el archivo. Reintentá en unos segundos.'))
    } finally {
      setBusy(null)
    }
  }

  async function handleArchive() {
    if (!report) return
    setActionError(null)
    setBusy('archive')
    try {
      const updated = await setDepartmentReportArchived(report.id, !report.is_archived)
      setReport({ ...report, ...updated })
      setNotice(updated.is_archived ? 'Informe archivado. Sigue disponible con "Mostrar archivados".' : 'El informe volvió a la lista.')
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos actualizar el informe.'))
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    if (!report) return
    const filesNote = report.files.length ? ` y sus ${report.files.length} archivo(s)` : ''
    if (!window.confirm(`¿Eliminar "${report.title}"${filesNote}? No se puede deshacer.`)) return
    setActionError(null)
    setBusy('delete')
    try {
      await deleteDepartmentReport(report)
      navigate(`/departamentos/${report.department_id}`, { state: { notice: `Se eliminó el informe "${report.title}".` } })
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos eliminar el informe.'))
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <AppShell title="Informe">
        <div className="loading-state" role="status">Cargando informe…</div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell title="Informe">
        <div className="alert alert-danger" role="alert">{loadError}</div>
      </AppShell>
    )
  }

  if (!report) {
    return (
      <AppShell title="Informe">
        <AccessDenied
          title="No encontramos el informe"
          message="Puede que lo hayan eliminado o que no tengas acceso: los informes los ven el coordinador del departamento, sus integrantes e Informática."
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  const documents = report.files.filter((f) => f.file_kind === 'documento')
  const images = report.files.filter((f) => f.file_kind === 'imagen')
  const videos = report.files.filter((f) => f.file_kind === 'video')
  const manageable = canManage(report)
  const deletable = canDelete(report)

  return (
    <AppShell title="Informe">
      <Link to={`/departamentos/${report.department_id}`} className="back-link">
        ← {department ? `Volver a ${department.name}` : 'Volver al departamento'}
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{report.title}</h1>
        </div>
        {(manageable || deletable) && (
          <div className="page-header-actions">
            {manageable && (
              <Link to={`/departamentos/informes/${report.id}/editar`} className="btn btn-outlined">
                <Icon name="edit" size={16} />
                Editar
              </Link>
            )}
            {manageable && (
              <button type="button" className="btn btn-ghost" onClick={handleArchive} disabled={busy !== null}>
                <Icon name="archive" size={16} />
                {busy === 'archive' ? 'Guardando…' : report.is_archived ? 'Desarchivar' : 'Archivar'}
              </button>
            )}
            {deletable && (
              <button type="button" className="btn btn-danger-outline" onClick={handleDelete} disabled={busy !== null}>
                <Icon name="trash" size={16} />
                {busy === 'delete' ? 'Eliminando…' : 'Eliminar'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="report-meta">
        <span className="badge badge-info">{DEPARTMENT_REPORT_TYPE_LABEL[report.report_type]}</span>
        {report.is_archived && <span className="badge badge-warning">Archivado</span>}
        <span>{formatDate(report.report_date)}</span>
        {department && <span>{department.name}</span>}
        <span>
          Cargado por {report.created_by_name ?? 'usuario eliminado'} el{' '}
          {new Date(report.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
        </span>
      </div>

      {notice && <SuccessNotice message={notice} tone={noticeTone} onClose={() => setNotice(null)} />}
      {actionError && (
        <div className="alert alert-danger" role="alert">{actionError}</div>
      )}

      <div className="card-solid" style={{ marginBottom: 20 }}>
        {report.body ? (
          <p className="report-body">{report.body}</p>
        ) : (
          <p className="field-help" style={{ margin: 0 }}>
            Este informe no tiene texto: el contenido está en los archivos adjuntos.
          </p>
        )}
        {report.observations && (
          <>
            <h2 className="section-title" style={{ marginTop: 20, marginBottom: 6 }}>
              Observaciones
            </h2>
            <p className="report-body" style={{ fontSize: 14 }}>
              {report.observations}
            </p>
          </>
        )}
      </div>

      {report.files.length === 0 ? (
        <div className="empty-state empty-state-action">
          <span>Sin archivos adjuntos.</span>
          {manageable && (
            <Link to={`/departamentos/informes/${report.id}/editar`} className="btn btn-outlined">
              <Icon name="plus" size={16} />
              Agregar fotos o archivos
            </Link>
          )}
        </div>
      ) : (
        <>
          {documents.length > 0 && (
            <>
              <div className="section-header">
                <h2 className="section-title">Documentos ({documents.length})</h2>
              </div>
              <div className="card row-list" style={{ marginBottom: 20 }}>
                {documents.map((f) => (
                  <div key={f.id} className="row-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span className="list-item-icon">
                        <Icon name="file" size={18} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="row-item-title" style={{ overflowWrap: 'anywhere' }}>{f.file_name}</div>
                        <div className="row-item-meta">{formatBytes(f.file_size)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" className="btn btn-outlined btn-sm" onClick={() => handleOpen(f, false)} disabled={busy !== null}>
                        {busy === `open:${f.id}` ? 'Abriendo…' : 'Ver'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => handleOpen(f, true)}
                        disabled={busy !== null}
                        aria-label={`Descargar ${f.file_name}`}
                        title="Descargar"
                      >
                        <Icon name="download" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {images.length > 0 && (
            <>
              <div className="section-header">
                <h2 className="section-title">Fotos ({images.length})</h2>
              </div>
              <div className="photo-grid" style={{ marginBottom: 20 }}>
                {images.map((f) => {
                  const url = mediaUrls.get(f.storage_path)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="photo-tile"
                      onClick={() => handleOpen(f, false)}
                      aria-label={`Abrir ${f.file_name}`}
                      title={f.file_name}
                      style={{ padding: 0, cursor: 'pointer' }}
                    >
                      {url ? (
                        <img src={url} alt={f.file_name} loading="lazy" />
                      ) : (
                        <span className="photo-tile-fallback">
                          <Icon name="image" size={22} />
                          {f.file_name}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {videos.length > 0 && (
            <>
              <div className="section-header">
                <h2 className="section-title">Videos ({videos.length})</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                {videos.map((f) => {
                  const url = mediaUrls.get(f.storage_path)
                  return (
                    <div key={f.id} className="card-solid video-item">
                      {url && <video src={url} controls preload="metadata" playsInline />}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span className="row-item-meta" style={{ overflowWrap: 'anywhere' }}>
                          {f.file_name} · {formatBytes(f.file_size)}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleOpen(f, true)} disabled={busy !== null}>
                          <Icon name="download" size={14} />
                          Descargar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  )
}
