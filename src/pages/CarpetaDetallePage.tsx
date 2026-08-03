import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import {
  fetchDocumentsByFolder,
  fetchDocumentFolderById,
  updateDocumentFolder,
  deleteDocumentFolder,
} from '../lib/api/documents'
import { getDocumentSignedUrl } from '../lib/api/storage'
import type { DocumentFolder, DocumentRecord } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export function CarpetaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasRole } = useAuth()
  const canManageFolders = isAdmin || hasRole('secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const isGeneral = id === 'general'

  const [folder, setFolder] = useState<DocumentFolder | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const [editingFolder, setEditingFolder] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([isGeneral ? Promise.resolve(null) : fetchDocumentFolderById(id), fetchDocumentsByFolder(isGeneral ? null : id)])
      .then(([folderData, documentsData]) => {
        if (!active) return
        setFolder(folderData)
        setDocuments(documentsData)
        if (folderData) {
          setName(folderData.name)
          setDescription(folderData.description ?? '')
        }
        setLoading(false)
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar la carpeta'))
    return () => {
      active = false
    }
  }, [id, isGeneral])

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

  async function handleSaveFolder(event: FormEvent) {
    event.preventDefault()
    if (!id || isGeneral) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateDocumentFolder(id, { name, description: description || null })
      setFolder(updated)
      setEditingFolder(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar la carpeta.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteFolder() {
    if (!id || isGeneral) return
    if (!window.confirm('¿Eliminar esta carpeta? Los documentos que contiene NO se borran, quedan como "Sin carpeta".')) return
    await deleteDocumentFolder(id)
    navigate('/documentos')
  }

  if (loading) {
    return (
      <AppShell title="Carpeta">
        <div className="empty-state">Cargando carpeta…</div>
      </AppShell>
    )
  }

  if (!isGeneral && !folder) {
    return (
      <AppShell title="Carpeta">
        <div className="empty-state">No se encontró la carpeta solicitada.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={folder?.name ?? 'General'}>
      <Link to="/documentos" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Documentos
      </Link>

      {editingFolder && folder ? (
        <form onSubmit={handleSaveFolder} className="card-solid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => setEditingFolder(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 className="page-title">{folder?.name ?? 'General'}</h1>
            <p className="page-subtitle">{folder?.description ?? 'Documentos sin carpeta asignada.'}</p>
          </div>
          {canManageFolders && folder && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-outlined" style={{ padding: '6px 10px' }} onClick={() => setEditingFolder(true)}>
                <Icon name="edit" size={14} />
              </button>
              <button type="button" className="btn btn-outlined" style={{ padding: '6px 10px' }} onClick={handleDeleteFolder}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {documents.length === 0 && <div className="empty-state">No hay documentos en esta carpeta todavía.</div>}

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
              {canManageFolders && (
                <Link to={`/documentos/${doc.id}/editar`} className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12 }}>
                  <Icon name="edit" size={14} />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManageFolders && (
        <Link
          to={isGeneral ? '/documentos/nuevo' : `/documentos/nuevo?folderId=${id}`}
          className="btn btn-primary btn-icon fab"
          aria-label="Cargar documento en esta carpeta"
        >
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
