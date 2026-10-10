import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { EscuelaHeader } from '../components/EscuelaHeader'
import { Icon } from '../components/ui/Icon'
import { ReasonPromptModal } from '../components/ui/ReasonPromptModal'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import {
  AVAL_REASON_MAX,
  AVAL_REASON_MIN,
  archiveSchoolAval,
  deleteSchoolAvalDocument,
  fetchAvalesDepartments,
  fetchSchoolAvalDocuments,
  restoreSchoolAval,
} from '../lib/api/schoolAvales'
import { getSchoolAvalSignedUrl } from '../lib/api/storage'
import { describeSupabaseError } from '../lib/api/errors'
import { formatBytes } from '../lib/format'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { AvalesDepartment, SchoolAvalDocument } from '../types/database'
import { useAuth } from '../hooks/useAuth'

type BusyAction = 'open' | 'download' | 'restore'
type ReasonModal = { kind: 'archive' | 'delete'; doc: SchoolAvalDocument } | null

const ALL_DEPARTMENTS = 'todos'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', { dateStyle: 'medium' })
}

// Año al que corresponde el aval: el de referencia, o el de carga en los avales anteriores a 0117.
function avalYear(doc: SchoolAvalDocument): number {
  return doc.reference_year ?? new Date(doc.created_at).getFullYear()
}

// Avales regionales: cada persona carga y renueva el suyo; la autoridad del área (Informática R4,
// el Coordinador de Escuela, o el coordinador de cada departamento en el suyo) ve, edita, renueva,
// archiva y elimina los de su área. Lo que se lista sale de la base (RLS): quien no es autoridad
// recibe únicamente su aval. Las acciones de administración se muestran solo en los
// departamentos donde list_school_avales_departments() dice can_manage; la base las rechaza
// igual para cualquier otra persona. Archivar y eliminar piden un motivo, que queda en la
// auditoría.
export function AvalesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthority, canLoad } = useSchoolAvalesAccess()
  const { isAdmin, profile } = useAuth()
  const myProfileId = profile?.id ?? null

  const [allDepartments, setAllDepartments] = useState<AvalesDepartment[]>([])
  const [documents, setDocuments] = useState<SchoolAvalDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useNavigationNotice()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null)
  const [reasonModal, setReasonModal] = useState<ReasonModal>(null)
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

  const departmentById = useMemo(() => new Map(allDepartments.map((d) => [d.id, d])), [allDepartments])

  // Departamentos con avales para mirar: los que la persona administra, y aquellos donde tiene un
  // aval propio. Los inactivos solo si tienen avales (se consultan, no admiten cargas nuevas).
  const departments = useMemo(
    () =>
      allDepartments.filter((d) => {
        const hasDocs = documents.some((doc) => doc.department_id === d.id)
        return (d.can_manage && (d.is_active || hasDocs)) || hasDocs
      }),
    [allDepartments, documents],
  )
  const uploadableDepartments = allDepartments.filter((d) => d.is_active)
  const showAllTab = departments.length > 1
  const requestedId = searchParams.get('departamento')
  const selectedId = requestedId ?? ALL_DEPARTMENTS
  const selectedDepartment = departments.find((d) => d.id === selectedId) ?? (showAllTab ? null : (departments[0] ?? null))
  // Pidieron un departamento que la persona no ve (por ejemplo, un enlace viejo).
  const blockedRequest = !loading && !loadError && Boolean(requestedId) && !departments.some((d) => d.id === requestedId)

  const isMine = (doc: SchoolAvalDocument): boolean =>
    myProfileId !== null &&
    (doc.person_profile_id === myProfileId ||
      (doc.person_profile_id === null && doc.person_name === null && doc.uploaded_by_profile_id === myProfileId))
  const canManageDoc = (doc: SchoolAvalDocument): boolean => departmentById.get(doc.department_id)?.can_manage === true

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
      return [doc.title, doc.description ?? '', doc.observations ?? '', doc.file_name, doc.uploaded_by_name ?? '', doc.person_name ?? '']
        .some((text) => text.toLowerCase().includes(q))
    })
  }, [documents, selectedDepartment, showArchived, query])

  // Si ya tiene un aval vigente en el departamento elegido, el botón principal lo renueva.
  const myAvalInSelected = selectedDepartment
    ? documents.find((doc) => doc.department_id === selectedDepartment.id && !doc.is_archived && isMine(doc))
    : null
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

  async function handleRestore(doc: SchoolAvalDocument) {
    if (!window.confirm(`¿Volver a activar "${doc.title}"? Vuelve a verse para su dueño y para la autoridad del área.`)) return
    setActionError(null)
    setBusy({ id: doc.id, action: 'restore' })
    try {
      const updated = await restoreSchoolAval(doc.id, null, doc.row_version)
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setNotice(`"${doc.title}" volvió a estar vigente.`)
    } catch (err) {
      setActionError(describeSupabaseError(err, 'No pudimos volver a activar el aval.'))
    } finally {
      setBusy(null)
    }
  }

  async function confirmArchive(doc: SchoolAvalDocument, reason: string) {
    const updated = await archiveSchoolAval(doc.id, reason, doc.row_version)
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setReasonModal(null)
    setNotice(`"${doc.title}" quedó archivado. El motivo se guardó en la auditoría.`)
  }

  async function confirmDelete(doc: SchoolAvalDocument, reason: string) {
    const { fileRemoved } = await deleteSchoolAvalDocument(doc, reason)
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    setReasonModal(null)
    setNotice(
      fileRemoved
        ? `"${doc.title}" fue eliminado. El motivo se guardó en la auditoría.`
        : `"${doc.title}" fue eliminado. El archivo no se pudo quitar del almacenamiento en este momento: no lo ve nadie y se puede borrar más tarde.`,
    )
  }

  function emptyMessage(): string {
    if (query.trim()) return 'No hay avales que coincidan con la búsqueda.'
    if (!isAuthority) return 'Todavía no cargaste tu aval. Elegí el departamento al que querés pertenecer o en el que querés continuar y subí el archivo.'
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
            {isAuthority
              ? 'Avales de cada departamento: los ves, renovás, archivás y eliminás en el área que administrás. También cargás el tuyo.'
              : 'Cargá tu aval o renovalo cuando haga falta. Ves solo el tuyo: la revisión queda a cargo de la autoridad del área.'}
          </p>
        </div>
        <div className="page-header-actions">
          {isAuthority && (
            <Link to="/escuela/avales/movimientos" className="btn btn-outlined">
              <Icon name="clipboardList" size={16} />
              Movimientos
            </Link>
          )}
          {isAdmin && (
            <Link to="/departamentos" className="btn btn-outlined">
              <Icon name="building" size={16} />
              Departamentos y coordinadores
            </Link>
          )}
          {!loading && canLoad && uploadableDepartments.length > 0 && (
            myAvalInSelected ? (
              <Link to={`/escuela/avales/${myAvalInSelected.id}/renovar`} className="btn btn-primary">
                <Icon name="upload" size={16} />
                Renovar mi aval
              </Link>
            ) : (
              <Link to={uploadHref} className="btn btn-primary">
                <Icon name="plus" size={16} />
                Subir mi aval
              </Link>
            )
          )}
        </div>
      </div>

      <p className="field-help aval-keep-note">
        Un aval se mantiene vigente hasta que sea actualizado o eliminado por una autoridad habilitada: no vence ni se borra al cambiar de año.
        {canLoad && ' Podés cargar tu aval, pero la revisión queda a cargo de la autoridad del área.'}
      </p>

      {notice && <SuccessNotice message={notice} onClose={() => setNotice(null)} />}

      {actionError && (
        <div className="alert alert-danger" role="alert">{actionError}</div>
      )}

      {blockedRequest && (
        <div className="alert alert-warning" role="alert">
          No tenés permiso para ver estos avales.{canLoad ? ' Te mostramos el tuyo.' : ''}
        </div>
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
          {uploadableDepartments.length > 0
            ? 'Todavía no cargaste tu aval. Elegí el departamento al que querés pertenecer o en el que querés continuar y subí el archivo.'
            : 'Todavía no hay departamentos activos. Se crean en la sección Departamentos.'}
        </div>
      )}

      {!loading && !loadError && departments.length > 0 && (
        <>
          {showAllTab && (
            <div className="filter-chips" role="group" aria-label="Filtrar por departamento">
              <button
                type="button"
                aria-pressed={!selectedDepartment}
                className="chip"
                onClick={() => selectDepartment(ALL_DEPARTMENTS)}
              >
                Todos ({documents.filter((d) => !d.is_archived).length})
              </button>
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
          )}

          {selectedDepartment && !selectedDepartment.is_active && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              Este departamento está inactivo en la sección Departamentos: sus avales se pueden consultar, pero no admite cargas nuevas.
            </p>
          )}
          {selectedDepartment?.can_manage && (
            <p className="field-help" style={{ marginBottom: 12, fontSize: 13 }}>
              {selectedDepartment.description && <>{selectedDepartment.description} · </>}
              {selectedDepartment.coordinator_name
                ? <>Coordinador: <strong>{selectedDepartment.coordinator_name}</strong>{selectedDepartment.is_my_department ? ' (vos)' : ''}</>
                : 'Sin coordinador asignado'}
              {isAdmin && (
                <>
                  {' · '}
                  <Link to={`/departamentos/${selectedDepartment.id}`} className="link-muted">
                    Cambiar en Departamentos
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="avales-toolbar">
            <div className="search-input avales-search">
              <Icon name="search" size={16} />
              <input
                placeholder="Buscar por título, persona, archivo o quién lo cargó…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar avales"
              />
            </div>
            {archivedCount > 0 && (
              <label className="check-row">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Mostrar archivados ({archivedCount})
              </label>
            )}
          </div>

          {visibleDocuments.length === 0 && <div className="empty-state">{emptyMessage()}</div>}

          <div className="avales-list">
            {visibleDocuments.map((doc) => {
              const department = departmentById.get(doc.department_id)
              const isBusy = busy?.id === doc.id
              const manage = canManageDoc(doc)
              const mine = isMine(doc)
              const person = doc.person_name ?? doc.uploaded_by_name ?? 'usuario eliminado'
              return (
                <div key={doc.id} className="card-solid list-item">
                  <span className="list-item-icon">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="list-item-body">
                    <h3 className="list-item-title">{doc.title}</h3>
                    <p className="list-item-subtitle">
                      Aval de <strong>{mine ? 'vos' : person}</strong> · año {avalYear(doc)}
                    </p>
                    {doc.description && <p className="list-item-subtitle">{doc.description}</p>}
                    {doc.observations && (
                      <p className="list-item-subtitle">
                        <strong>Observaciones:</strong> {doc.observations}
                      </p>
                    )}
                    {doc.is_archived && doc.archive_reason && (
                      <p className="list-item-subtitle">
                        <strong>Motivo del archivado:</strong> {doc.archive_reason}
                      </p>
                    )}
                    <div className="list-item-meta">
                      {!selectedDepartment && department && <span className="badge badge-info">{department.name}</span>}
                      {mine && <span className="badge badge-success">Tu aval</span>}
                      {doc.is_archived ? <span className="badge badge-warning">Archivado</span> : <span className="badge badge-success">Vigente</span>}
                      <span className="text-truncate aval-file-name" title={doc.file_name}>
                        {doc.file_name}
                      </span>
                      <span>{formatBytes(doc.file_size)}</span>
                      <span>Cargado por {doc.uploaded_by_name ?? 'usuario eliminado'} el {formatDate(doc.created_at)}</span>
                      {doc.renewed_at && (
                        <span>
                          Renovado por {doc.renewed_by_name ?? 'usuario eliminado'} el {formatDate(doc.renewed_at)}
                          {doc.renewal_count > 1 ? ` (${doc.renewal_count} veces)` : ''}
                        </span>
                      )}
                      {!doc.renewed_at && doc.updated_at !== doc.created_at && <span>Actualizado {formatDate(doc.updated_at)}</span>}
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
                    {!doc.is_archived && (mine || manage) && (
                      <Link to={`/escuela/avales/${doc.id}/renovar`} className="btn btn-outlined" aria-label="Renovar aval" title="Renovar aval: reemplaza el archivo">
                        <Icon name="upload" size={13} />
                        <span className="btn-label-full">Renovar</span>
                      </Link>
                    )}
                    {manage && (
                      <>
                        <Link to={`/escuela/avales/${doc.id}/editar`} className="btn btn-outlined btn-icon-sm" aria-label="Editar datos" title="Editar datos">
                          <Icon name="edit" size={14} />
                        </Link>
                        {doc.is_archived ? (
                          <button
                            type="button"
                            className="btn btn-outlined btn-icon-sm"
                            disabled={isBusy}
                            onClick={() => handleRestore(doc)}
                            aria-label="Volver a activar"
                            title="Volver a activar"
                          >
                            <Icon name="archive" size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outlined btn-icon-sm"
                            disabled={isBusy}
                            onClick={() => setReasonModal({ kind: 'archive', doc })}
                            aria-label="Archivar"
                            title="Archivar (pide un motivo)"
                          >
                            <Icon name="archive" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-icon-sm"
                          disabled={isBusy}
                          onClick={() => setReasonModal({ kind: 'delete', doc })}
                          aria-label="Eliminar definitivamente"
                          title="Eliminar definitivamente (pide un motivo)"
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

      {reasonModal?.kind === 'archive' && (
        <ReasonPromptModal
          title={`Archivar "${reasonModal.doc.title}"`}
          description="Deja de verse para su dueño y su archivo deja de poder descargarse; solo la autoridad del área lo sigue viendo. Contanos por qué: el motivo queda en la auditoría junto con tu nombre y la fecha."
          confirmLabel="Archivar"
          minLength={AVAL_REASON_MIN}
          maxLength={AVAL_REASON_MAX}
          onConfirm={(reason) => confirmArchive(reasonModal.doc, reason)}
          onClose={() => setReasonModal(null)}
        />
      )}
      {reasonModal?.kind === 'delete' && (
        <ReasonPromptModal
          title={`Eliminar "${reasonModal.doc.title}"`}
          description="Se borran el registro y el archivo, y no se puede deshacer. Contanos por qué: el motivo queda en la auditoría junto con tu nombre y la fecha."
          confirmLabel="Eliminar"
          minLength={AVAL_REASON_MIN}
          maxLength={AVAL_REASON_MAX}
          onConfirm={(reason) => confirmDelete(reasonModal.doc, reason)}
          onClose={() => setReasonModal(null)}
        />
      )}
    </AppShell>
  )
}
