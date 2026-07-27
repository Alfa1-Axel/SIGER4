import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchDocuments } from '../lib/api/documents'
import { getDocumentSignedUrl } from '../lib/api/storage'
import type { DocumentRecord } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export function DocumentosPage() {
  const { isAdmin, hasRole } = useAuth()
  const canCreate = isAdmin || hasRole('secretario_regional', 'presidente_cuartel', 'usuario_carga_cuartel', 'secretario_comision')
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchDocuments()
      .then((data) => active && setDocuments(data))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar documentos'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  async function handleOpen(doc: DocumentRecord) {
    if (doc.storage_path === 'pending') return
    setOpeningId(doc.id)
    try {
      const url = await getDocumentSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos abrir el documento.')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <AppShell title="Documentos">
      <h1 className="page-title">Documentos</h1>
      <p className="page-subtitle">Documentación institucional: circulares, actas, manuales y más.</p>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando documentos…</div>}
      {!loading && documents.length === 0 && <div className="empty-state">No hay documentos cargados todavía.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {documents.map((doc) => (
          <div key={doc.id} className="card-solid" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="badge badge-info">{doc.category}</span>
              <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{doc.title}</h3>
              {doc.description && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{doc.description}</p>
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {new Date(doc.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-outlined"
                style={{ padding: '6px 12px', fontSize: 12 }}
                disabled={doc.storage_path === 'pending' || openingId === doc.id}
                onClick={() => handleOpen(doc)}
              >
                {openingId === doc.id ? 'Abriendo…' : 'Ver / Descargar'}
              </button>
              {canCreate && (
                <Link to={`/documentos/${doc.id}/editar`} className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12 }}>
                  <Icon name="edit" size={14} />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {canCreate && (
        <Link
          to="/documentos/nuevo"
          className="btn btn-primary btn-icon fab"
          aria-label="Nuevo documento"
        >
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
