import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchDocuments, fetchDocumentFolders, cleanupPendingDocuments } from '../lib/api/documents'
import type { DocumentFolder, DocumentRecord } from '../types/database'
import { useAuth } from '../hooks/useAuth'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const pendingCount = documents.filter((doc) => doc.storage_path === 'pending').length
  const unfiledCount = documents.filter((doc) => !doc.folder_id).length

  async function reload() {
    const [foldersData, documentsData] = await Promise.all([fetchDocumentFolders(), fetchDocuments()])
    setFolders(foldersData)
    setDocuments(documentsData)
  }

  useEffect(() => {
    let active = true
    reload()
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar documentos'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  async function handleCleanupPending() {
    setCleaningUp(true)
    setError(null)
    try {
      const removed = await cleanupPendingDocuments()
      await reload()
      if (removed === 0) setError('No había documentos pendientes hace más de 24hs para limpiar.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos limpiar los documentos pendientes.')
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
          <Link to="/documentos/papelera" className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
            <Icon name="trash" size={14} />
            Papelera
          </Link>
        )}
      </div>

      {isAdmin && pendingCount > 0 && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            Hay {pendingCount} documento{pendingCount === 1 ? '' : 's'} sin archivo subido (carga interrumpida).
          </span>
          <button type="button" className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12 }} disabled={cleaningUp} onClick={handleCleanupPending}>
            {cleaningUp ? 'Limpiando…' : 'Limpiar pendientes de +24hs'}
          </button>
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando carpetas…</div>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link
            to="/documentos/carpetas/general"
            className="card-solid"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <Icon name="file" size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>General</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>Documentos sin carpeta asignada</p>
            </div>
            <span className="badge badge-info">{unfiledCount}</span>
          </Link>

          {folders
            .filter((folder) => folder.is_active)
            .map((folder) => (
              <Link
                key={folder.id}
                to={`/documentos/carpetas/${folder.id}`}
                className="card-solid"
                style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
              >
                <Icon name="file" size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{folder.name}</h3>
                  {folder.description && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>{folder.description}</p>
                  )}
                </div>
                <span className="badge badge-info">{documentCountFor(folder.id)}</span>
              </Link>
            ))}

          {folders.filter((f) => f.is_active).length === 0 && (
            <div className="empty-state">Todavía no hay carpetas creadas (aparte de "General").</div>
          )}
        </div>
      )}

      {canManageFolders && (
        <div style={{ position: 'fixed', bottom: 24, right: 24 }}>
          {showAddMenu && (
            <div className="card-solid" style={{ marginBottom: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link to="/documentos/carpetas/nueva" className="btn btn-outlined" style={{ justifyContent: 'flex-start' }} onClick={() => setShowAddMenu(false)}>
                Crear carpeta
              </Link>
              <Link to="/documentos/nuevo" className="btn btn-outlined" style={{ justifyContent: 'flex-start' }} onClick={() => setShowAddMenu(false)}>
                Cargar archivo
              </Link>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ borderRadius: '50%', width: 56, height: 56 }}
            aria-label="Agregar"
            onClick={() => setShowAddMenu((prev) => !prev)}
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
      )}
    </AppShell>
  )
}
