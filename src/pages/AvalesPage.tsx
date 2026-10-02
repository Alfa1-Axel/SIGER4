import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { Icon } from '../components/ui/Icon'
import { deleteSchoolAvalDocument, fetchAvalesDepartments, fetchSchoolAvalDocuments, setSchoolAvalArchived } from '../lib/api/schoolAvales'
import { getSchoolAvalSignedUrl } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { formatBytes } from '../lib/format'
import { isMobileUserAgent } from '../lib/device'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { Department, SchoolAvalDocument } from '../types/database'

type BusyAction = 'open' | 'download' | 'archive' | 'delete'

const ALL_DEPARTMENTS = 'todos'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', { dateStyle: 'medium' })
}

// Avales regionales de la Escuela: documentos organizados por departamento
// (Fuego, Forestal, FASME...). Los departamentos son los de la tabla única
// departments, la misma de la sección Departamentos. Lo que se lista sale de
// la base: un
// coordinador de departamento recibe solo su departamento, Informática y
// coordinador/secretario de Escuela reciben todos, y solo informatica_r4
// recibe además los archivados. Las acciones de edición/archivo/eliminación
// solo se muestran a informatica_r4 (la base las rechaza para el resto).
export function AvalesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { canViewAll, canManage } = useSchoolAvalesAccess()
  const isMobile = isMobileUserAgent()

  const [allDepartments, setAllDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<SchoolAvalDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(() => (location.state as { notice?: string } | null)?.notice ?? null)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    Promise.all([fetchAvalesDepartments(), fetchSchoolAvalDocuments()])
      .then(([departmentsData, documentsData]) => {
        if (!active) return
        setAllDepartments(departmentsData)
        setDocuments(documentsData)
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar los avales.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reloadKey])

  // El aviso de "documento cargado" llega por state de navegación: se limpia
  // del historial para que no reaparezca al volver atrás.
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location.pathname, location.search, location.state, navigate])

  // Los departamentos inactivos (desactivados en la sección Departamentos)
  // solo se muestran si tienen avales: se pueden consultar, no admiten
  // cargas nuevas.
  const departments = useMemo(
    () => allDepartments.filter((d) => d.is_active || documents.some((doc) => doc.department_id === d.id)),
    [allDepartments, documents],
  )
  const departmentById = useMemo(() => new Map(allDepartments.map((d) => [d.id, d])), [allDepartments])
  const showAllTab = departments.length > 1
  const selectedId = searchParams.get('departamento') ?? ALL_DEPARTMENTS
  const selectedDepartment =
    departments.find((d) => d.id === selectedId) ?? (showAllTab ? null : (departments[0] ?? null))

  const activeCountByDepartment = useMemo(() => {
    const counts = new Map<string, number>()
    for (const doc of documents) {
      if (doc.is_archived) continue
      counts.set(doc.department_id, (counts.get(doc.department_id) ?? 0) + 1)
    }
    return counts
  }, [documents])
  const archivedCount = documents.filter((doc) => doc.is_archived).length

  const visibleDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((doc) => {
      if (doc.is_archived && !showArchived) return false
      if (selectedDepartment && doc.department_id !== selectedDepartment.id) return false
      if (!q) return true
      return [doc.title, doc.description ?? '', doc.observations ?? '', doc.file_name, doc.uploaded_by_name ?? '']
        .some((text) => text.toLowerCase().includes(q))
    })
  }, [documents, selectedDepartment, showArchived, query])

  // Un departamento visible y activo es un departamento donde se puede
  // cargar (misma regla que can_upload_school_avales_department()).
  const uploadableDepartments = departments.filter((d) => d.is_active)
  const uploadTarget = selectedDepartment && selectedDepartment.is_active ? selectedDepartment : null
  const uploadHref = uploadTarget ? `/escuela/avales/nuevo?departamento=${uploadTarget.id}` : '/escuela/avales/nuevo'

  function selectDepartment(departmentId: string) {
    setActionError(null)
    if (departmentId === ALL_DEPARTMENTS) setSearchParams({}, { replace: true })
    else setSearchParams({ departamento: departmentId }, { replace: true })
  }

  async function handleOpen(doc: SchoolAvalDocument) {
    setActionError(null)
    setBusy({ id: doc.id, action: 'open' })
    try {
      const url = await getSchoolAvalSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos abrir el documento.'))
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload(doc: SchoolAvalDocument) {
    setActionError(null)
    setBusy({ id: doc.id, action: 'download' })
    try {
      // La URL firmada con "download" responde con Content-Disposition:
      // attachment y el nombre original: el navegador descarga sin salir de
      // la pantalla (y sin depender de un popup).
      const url = await getSchoolAvalSignedUrl(doc.storage_path, doc.file_name)
      const link = document.createElement('a')
      link.href = url
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos descargar el documento.'))
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleArchive(doc: SchoolAvalDocument) {
    const archiving = !doc.is_archived
    const message = archiving
      ? `¿Archivar "${doc.title}"? Deja de verse para el resto de los usuarios (solo Informática R4 lo sigue viendo) y su archivo deja de poder descargarse.`
      : `¿Desarchivar "${doc.title}"? Vuelve a verse para quienes tienen acceso a su departamento.`
    if (!window.confirm(message)) return
    setActionError(null)
    setBusy({ id: doc.id, action: 'archive' })
    try {
      const updated = await setSchoolAvalArchived(doc.id, archiving)
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setNotice(archiving ? `"${doc.title}" quedó archivado.` : `"${doc.title}" volvió a estar activo.`)
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos cambiar el estado del documento.'))
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(doc: SchoolAvalDocument) {
    if (!window.confirm(`¿Eliminar definitivamente "${doc.title}"? Se borran el registro y el archivo. No se puede deshacer.`)) return
    setActionError(null)
    setBusy({ id: doc.id, action: 'delete' })
    try {
      await deleteSchoolAvalDocument(doc)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      setNotice(`"${doc.title}" fue eliminado.`)
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos eliminar el documento.'))
    } finally {
      setBusy(null)
    }
  }

  function emptyMessage(): string {
    if (query.trim()) return 'No hay documentos que coincidan con la búsqueda.'
    if (selectedDepartment) return `Todavía no hay avales cargados en ${selectedDepartment.name}.`
    return 'Todavía no hay avales cargados.'
  }

  return (
    <AppShell title="Avales regionales">
      <EscuelaHeader />

      <div className="page-header">
        <div>
          <h1 className="page-title">Avales regionales</h1>
          <p className="page-subtitle">
            Documentos de avales organizados por departamento. Son los mismos departamentos de la sección Departamentos.
            {!canViewAll && ' Ves solo los departamentos que coordinás.'}
          </p>
        </div>
        <div className="page-header-actions">
          {canManage && (
            <Link to="/escuela/avales/coordinadores" className="btn btn-outlined">
              <Icon name="user" size={16} />
              Coordinadores
            </Link>
          )}
          {!loading && uploadableDepartments.length > 0 && !isMobile && (
            <Link to={uploadHref} className="btn btn-primary">
              <Icon name="plus" size={16} />
              Cargar documento
            </Link>
          )}
        </div>
      </div>

      {!loading && uploadableDepartments.length > 0 && isMobile && (
        <p className="field-help" style={{ marginBottom: 16 }}>
          La carga de documentos está disponible solo desde PC. Desde el celular podés ver y descargar.
        </p>
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          <span className="alert-content">{notice}</span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar aviso" onClick={() => setNotice(null)} style={{ color: 'inherit' }}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-danger" role="alert">{actionError}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando avales…</div>}

      {!loading && loadError && (
        <div className="empty-state">
          <p className="field-error" style={{ marginBottom: 12 }}>
            {loadError}
          </p>
          <button type="button" className="btn btn-outlined" onClick={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {!loading && !loadError && departments.length === 0 && (
        <div className="empty-state">
          {canViewAll
            ? 'Todavía no hay departamentos activos. Se crean en la sección Departamentos.'
            : 'No tenés departamentos asignados en Avales. Pedile a Informática R4 que te asigne como coordinador de tu departamento.'}
        </div>
      )}

      {!loading && !loadError && departments.length > 0 && (
        <>
          <div className="filter-chips" role="group" aria-label="Filtrar por departamento">
            {showAllTab && (
              <button
                type="button"
                aria-pressed={!selectedDepartment}
                className="chip"
                onClick={() => selectDepartment(ALL_DEPARTMENTS)}
              >
                Todos ({documents.filter((d) => !d.is_archived).length})
              </button>
            )}
            {departments.map((department) => {
              const isSelected = selectedDepartment?.id === department.id
              return (
                <button
                  key={department.id}
                  type="button"
                  aria-pressed={isSelected}
                  className="chip"
                  onClick={() => selectDepartment(department.id)}
                >
                  {department.name} ({activeCountByDepartment.get(department.id) ?? 0})
                  {!department.is_active && ' · inactivo'}
                </button>
              )
            })}
          </div>

          {selectedDepartment && !selectedDepartment.is_active && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              Este departamento está inactivo en la sección Departamentos: sus avales se pueden consultar, pero no admite cargas nuevas.
            </p>
          )}
          {selectedDepartment?.description && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 0 }}>{selectedDepartment.description}</p>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
              <Icon name="search" size={16} />
              <input
                placeholder="Buscar por título, descripción, archivo o quién lo cargó…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar avales"
              />
            </div>
            {canManage && (
              <label className="check-row">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Mostrar archivados ({archivedCount})
              </label>
            )}
          </div>

          {visibleDocuments.length === 0 && <div className="empty-state">{emptyMessage()}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleDocuments.map((doc) => {
              const department = departmentById.get(doc.department_id)
              const isBusy = busy?.id === doc.id
              return (
                <div key={doc.id} className="card-solid list-item">
                  <span className="list-item-icon">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="list-item-body">
                    <h3 className="list-item-title">{doc.title}</h3>
                    {doc.description && <p className="list-item-subtitle">{doc.description}</p>}
                    {doc.observations && (
                      <p className="list-item-subtitle">
                        <strong>Observaciones:</strong> {doc.observations}
                      </p>
                    )}
                    <div className="list-item-meta">
                      {!selectedDepartment && department && <span className="badge badge-info">{department.name}</span>}
                      {doc.is_archived && <span className="badge badge-warning">Archivado</span>}
                      <span className="text-truncate" style={{ maxWidth: 220 }} title={doc.file_name}>
                        {doc.file_name}
                      </span>
                      <span>{formatBytes(doc.file_size)}</span>
                      <span>Cargado por {doc.uploaded_by_name ?? 'usuario eliminado'}</span>
                      <span>{formatDate(doc.created_at)}</span>
                      {doc.updated_at !== doc.created_at && <span>Actualizado {formatDate(doc.updated_at)}</span>}
                    </div>
                  </div>
                  <div className="list-item-actions">
                    <button type="button" className="btn btn-outlined" disabled={isBusy} onClick={() => handleOpen(doc)} aria-label="Ver documento">
                      <Icon name="file" size={13} />
                      <span className="btn-label-full">{isBusy && busy?.action === 'open' ? 'Abriendo…' : 'Ver'}</span>
                    </button>
                    <button type="button" className="btn btn-outlined" disabled={isBusy} onClick={() => handleDownload(doc)} aria-label="Descargar documento">
                      <Icon name="download" size={13} />
                      <span className="btn-label-full">{isBusy && busy?.action === 'download' ? 'Descargando…' : 'Descargar'}</span>
                    </button>
                    {canManage && (
                      <>
                        <Link to={`/escuela/avales/${doc.id}/editar`} className="btn btn-outlined btn-icon-sm" aria-label="Editar datos" title="Editar datos">
                          <Icon name="edit" size={14} />
                        </Link>
                        <button
                          type="button"
                          className="btn btn-outlined btn-icon-sm"
                          disabled={isBusy}
                          onClick={() => handleToggleArchive(doc)}
                          aria-label={doc.is_archived ? 'Desarchivar' : 'Archivar'}
                          title={doc.is_archived ? 'Desarchivar' : 'Archivar'}
                        >
                          <Icon name="archive" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-icon-sm"
                          disabled={isBusy}
                          onClick={() => handleDelete(doc)}
                          aria-label="Eliminar definitivamente"
                          title="Eliminar definitivamente"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </AppShell>
  )
}
