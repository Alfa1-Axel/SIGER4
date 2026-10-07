import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchDocuments, fetchDocumentFolders, fetchPendingDocuments, cleanupPendingDocuments } from '../lib/api/documents'
import type { DocumentFolder, DocumentRecord } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

// Vista por carpetas: cada carpeta activa es una tarjeta que lleva a
// /documentos/carpetas/:id (CarpetaDetallePage), donde vive el listado de
// documentos de esa carpeta y el formulario de carga. Los documentos sin
// carpeta (folder_id null — históricos previos a este módulo, o cargados
// directo) se agrupan en la carpeta pseudo "General".
export function DocumentosPage() {
  const { isAdmin, hasRole } = useAuth()
  const canManageFolders = isAdmin || hasRole('secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')

  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [pendingDocuments, setPendingDocuments] = useState<DocumentRecord[]>([])
  const [showPendingList, setShowPendingList] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  // La carga funciona desde escritorio y celular (DEPLOYMENT.md sección 56).
  const canUploadFiles = canManageFolders

  const unfiledCount = documents.filter((doc) => !doc.folder_id).length

  async function reload() {
    // fetchDocuments() ya excluye storage_path='pending' (documentos sin
    // archivo real todavía, ver lib/api/documents.ts) — la lista de
    // pendientes para el banner de informática se pide aparte, y solo si
    // corresponde (no tiene sentido pedirla para un rol que no va a ver el
    // banner ni puede limpiarlos).
    const [foldersData, documentsData, pendingData] = await Promise.all([
      fetchDocumentFolders(),
      fetchDocuments(),
      isAdmin ? fetchPendingDocuments() : Promise.resolve([]),
    ])
    setFolders(foldersData)
    setDocuments(documentsData)
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

  return (
    <AppShell title="Documentos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">Documentación institucional organizada por carpetas: circulares, actas, manuales y más.</p>
        </div>
        {canManageFolders && (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link to="/documentos/carpetas/general" className="card-solid list-item">
            <span className="list-item-icon">
              <Icon name="file" size={18} />
            </span>
            <div className="list-item-body">
              <h3 className="list-item-title">General</h3>
              <p className="list-item-subtitle">Documentos sin carpeta asignada</p>
            </div>
            <span className="badge badge-info">{unfiledCount}</span>
          </Link>

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
            <div className="empty-state">Todavía no hay carpetas propias. Los documentos sin carpeta quedan en "General".</div>
          )}
        </div>
      )}

      {canManageFolders && (
        <div className="fab-menu">
          {showAddMenu && (
            <div className="fab-menu-panel" role="menu">
              <Link to="/documentos/carpetas/nueva" className="btn btn-ghost" role="menuitem" onClick={() => setShowAddMenu(false)}>
                Crear carpeta
              </Link>
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
