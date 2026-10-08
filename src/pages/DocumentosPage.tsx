import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchDocuments, fetchDocumentFolders, fetchPendingDocuments, cleanupPendingDocuments } from '../lib/api/documents'
import { fetchVisibleDepartments } from '../lib/api/departments'
import type { DocumentFolder, DocumentRecord, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

// Documentos se organiza en espacios y carpetas:
//   - General: lo publicado para todos (visibilidad "Visible para todos").
//   - Un espacio por departamento: lo que cargan su coordinador e integrantes.
//   - Sin carpeta: lo de mi alcance que no está en ninguna carpeta.
//   - Las carpetas (cada una con su alcance).
// Cada tarjeta lleva a su listado; allí se ve de quién es cada documento y
// quién lo ve.
export function DocumentosPage() {
  const { isAdmin, hasRole, coordinatedDepartmentIds, memberDepartmentIds } = useAuth()
  const canManageFolders = isAdmin || hasRole('secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const hasDepartments = coordinatedDepartmentIds.length + memberDepartmentIds.length > 0

  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [pendingDocuments, setPendingDocuments] = useState<DocumentRecord[]>([])
  const [showPendingList, setShowPendingList] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  // La carga funciona desde escritorio y celular (DEPLOYMENT.md sección 56).
  // Quien trabaja en un departamento también carga documentos (en el suyo).
  const canUploadFiles = canManageFolders || hasDepartments

  const publishedCount = documents.filter((doc) => doc.visibility === 'todos').length
  const unfiledCount = documents.filter((doc) => !doc.folder_id && !doc.department_id && doc.visibility !== 'todos').length
  // Un espacio por departamento donde la persona trabaja (Informática, todos).
  const departmentSpaces = departments.filter((d) => isAdmin || Boolean(d.my_relation))

  async function reload() {
    // fetchDocuments() ya excluye storage_path='pending' (documentos sin
    // archivo real todavía, ver lib/api/documents.ts) — la lista de
    // pendientes para el banner de informática se pide aparte, y solo si
    // corresponde (no tiene sentido pedirla para un rol que no va a ver el
    // banner ni puede limpiarlos).
    const [foldersData, documentsData, pendingData, departmentsData] = await Promise.all([
      fetchDocumentFolders(),
      fetchDocuments(),
      isAdmin ? fetchPendingDocuments() : Promise.resolve([]),
      fetchVisibleDepartments().catch(() => [] as VisibleDepartment[]),
    ])
    setFolders(foldersData)
    setDocuments(documentsData)
    setDepartments(departmentsData)
    setPendingDocuments(pendingData)
  }

  useEffect(() => {
    let active = true
    reload()
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los documentos. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function handleCleanupPending() {
    setCleaningUp(true)
    setError(null)
    try {
      const removed = await cleanupPendingDocuments()
      await reload()
      if (removed === 0) setError('No había documentos pendientes hace más de 24hs para limpiar.')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos limpiar los documentos pendientes.'))
    } finally {
      setCleaningUp(false)
    }
  }

  function documentCountFor(folderId: string): number {
    return documents.filter((doc) => doc.folder_id === folderId).length
  }

  function departmentDocumentCount(departmentId: string): number {
    return documents.filter((doc) => doc.department_id === departmentId).length
  }

  return (
    <AppShell title="Documentos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">Documentación institucional: lo publicado para todos, lo de tu departamento y lo de tu alcance, en carpetas.</p>
        </div>
        {canUploadFiles && (
          <Link to="/documentos/papelera" className="btn btn-outlined btn-sm" style={{ whiteSpace: 'nowrap' }}>
            <Icon name="trash" size={14} />
            Papelera
          </Link>
        )}
      </div>

      {isAdmin && pendingDocuments.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>
              Hay {pendingDocuments.length} documento{pendingDocuments.length === 1 ? '' : 's'} sin archivo subido (carga
              interrumpida) — no son visibles para el resto de los usuarios.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-outlined btn-sm" onClick={() => setShowPendingList((prev) => !prev)}>
                {showPendingList ? 'Ocultar' : 'Ver detalle'}
              </button>
              <button type="button" className="btn btn-outlined btn-sm" disabled={cleaningUp} onClick={handleCleanupPending}>
                {cleaningUp ? 'Limpiando…' : 'Limpiar pendientes de +24hs'}
              </button>
            </div>
          </div>
          {showPendingList && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingDocuments.map((doc) => (
                <div key={doc.id} style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>
                  <strong>{doc.title}</strong> · {doc.category} · creado el{' '}
                  {new Date(doc.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando carpetas…</div>}

      {!loading && (
        <>
          <div className="section-header">
            <h2 className="section-title">Espacios</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <Link to="/documentos/carpetas/general" className="card-solid list-item">
              <span className="list-item-icon">
                <Icon name="file" size={18} />
              </span>
              <div className="list-item-body">
                <h3 className="list-item-title">General</h3>
                <p className="list-item-subtitle">Publicados para todos: circulares y material institucional común</p>
              </div>
              <span className="badge badge-info">{publishedCount}</span>
            </Link>

            {departmentSpaces.map((department) => (
              <Link key={department.id} to={`/documentos/departamentos/${department.id}`} className="card-solid list-item">
                <span className="list-item-icon">
                  <Icon name="clipboardList" size={18} />
                </span>
                <div className="list-item-body">
                  <h3 className="list-item-title">Departamento {department.name}</h3>
                  <p className="list-item-subtitle">Lo que cargan su coordinador y sus integrantes</p>
                </div>
                <span className="badge badge-info">{departmentDocumentCount(department.id)}</span>
              </Link>
            ))}

            <Link to="/documentos/carpetas/sin-carpeta" className="card-solid list-item">
              <span className="list-item-icon">
                <Icon name="file" size={18} />
              </span>
              <div className="list-item-body">
                <h3 className="list-item-title">Sin carpeta</h3>
                <p className="list-item-subtitle">Documentos de tu alcance que no están en ninguna carpeta</p>
              </div>
              <span className="badge badge-info">{unfiledCount}</span>
            </Link>
          </div>

          <div className="section-header">
            <h2 className="section-title">Carpetas</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {folders
              .filter((folder) => folder.is_active)
              .map((folder) => (
                <Link key={folder.id} to={`/documentos/carpetas/${folder.id}`} className="card-solid list-item">
                  <span className="list-item-icon">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="list-item-body">
                    <h3 className="list-item-title">{folder.name}</h3>
                    {folder.description && <p className="list-item-subtitle">{folder.description}</p>}
                  </div>
                  <span className="badge badge-info">{documentCountFor(folder.id)}</span>
                </Link>
              ))}

            {folders.filter((f) => f.is_active).length === 0 && (
              <div className="empty-state">Todavía no hay carpetas propias. Los documentos sin carpeta quedan en "Sin carpeta".</div>
            )}
          </div>
        </>
      )}

      {canUploadFiles && (
        <div className="fab-menu">
          {showAddMenu && (
            <div className="fab-menu-panel" role="menu">
              {canManageFolders && (
                <Link to="/documentos/carpetas/nueva" className="btn btn-ghost" role="menuitem" onClick={() => setShowAddMenu(false)}>
                  Crear carpeta
                </Link>
              )}
              {canUploadFiles && (
                <Link to="/documentos/nuevo" className="btn btn-ghost" role="menuitem" onClick={() => setShowAddMenu(false)}>
                  Subir documento
                </Link>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ borderRadius: 'var(--radius-full)', width: 52, height: 52, boxShadow: 'var(--shadow-md)' }}
            aria-label="Agregar"
            aria-expanded={showAddMenu}
            onClick={() => setShowAddMenu((prev) => !prev)}
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
      )}
    </AppShell>
  )
}
