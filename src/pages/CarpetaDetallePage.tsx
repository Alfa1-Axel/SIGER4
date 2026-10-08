import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import {
  fetchDocumentsByFolder,
  fetchDocumentFolderById,
  updateDocumentFolder,
  deleteDocumentFolder,
  trashDocument,
} from '../lib/api/documents'
import { getDocumentSignedUrl } from '../lib/api/storage'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import type { DocumentFolder, DocumentRecord, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function CarpetaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasRole, profile, scopes } = useAuth()
  const isRegionalRole = hasRole('secretario_regional')
  const isStationRole = hasRole('usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null
  const isGeneral = id === 'general'

  const [folder, setFolder] = useState<DocumentFolder | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [trashingId, setTrashingId] = useState<string | null>(null)

  const [editingFolder, setEditingFolder] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // document_folders_write_admin_regional_station (migración 0047): antes
  // canManageFolders era un chequeo de rol puro, mostrando Editar/Eliminar/
  // Cargar en CUALQUIER carpeta (incluida "General", sin scope, y carpetas de
  // otras regiones/cuarteles) con solo tener el rol adecuado. Ahora se
  // revalida contra el scope real de la carpeta abierta -- "General" (sin
  // folder.region_id/station_id) solo la administra informatica_r4.
  const canManageFolders =
    isAdmin ||
    (folder
      ? (isRegionalRole &&
          Boolean(
            (folder.region_id && folder.region_id === myRegionId) ||
              (folder.station_id && stations.find((s) => s.id === folder.station_id)?.region_id === myRegionId) ||
              (folder.subsede_id && subsedes.find((s) => s.id === folder.subsede_id)?.region_id === myRegionId),
          )) ||
        (isStationRole && Boolean(folder.station_id) && folder.station_id === myStationId)
      : false)
  // La carga funciona desde escritorio y celular (DEPLOYMENT.md sección 56).
  const canUploadFiles = canManageFolders
  const [notice, setNotice] = useNavigationNotice()

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      isGeneral ? Promise.resolve(null) : fetchDocumentFolderById(id),
      fetchDocumentsByFolder(isGeneral ? null : id),
      fetchStations(),
      fetchSubsedes(),
    ])
      .then(([folderData, documentsData, stationsData, subsedesData]) => {
        if (!active) return
        setFolder(folderData)
        setDocuments(documentsData)
        setStations(stationsData)
        setSubsedes(subsedesData)
        if (folderData) {
          setName(folderData.name)
          setDescription(folderData.description ?? '')
        }
        setLoading(false)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar la carpeta. Reintentá en unos segundos.')))
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
      setError(describeSupabaseError(err, 'No pudimos abrir el documento.'))
    } finally {
      setOpeningId(null)
    }
  }

  async function handleTrash(doc: DocumentRecord) {
    if (!window.confirm(`¿Enviar "${doc.title}" a la papelera? Va a poder restaurarse durante 30 días.`)) return
    setError(null)
    setTrashingId(doc.id)
    try {
      await trashDocument(doc.id, profile?.id ?? null)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos enviar el documento a la papelera.'))
    } finally {
      setTrashingId(null)
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
      setError(describeSupabaseError(err, 'No pudimos guardar la carpeta.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteFolder() {
    if (!id || isGeneral) return
    if (!window.confirm('¿Eliminar esta carpeta? Los documentos que contiene NO se borran, quedan como "Sin carpeta".')) return
    setError(null)
    try {
      await deleteDocumentFolder(id)
      navigate('/documentos')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos eliminar la carpeta.'))
    }
  }

  if (loading) {
    return (
      <AppShell title="Carpeta">
        <div className="loading-state" role="status">Cargando carpeta…</div>
      </AppShell>
    )
  }

  if (!isGeneral && !folder) {
    return (
      <AppShell title="Carpeta">
        <div className="empty-state">No encontramos esa carpeta. Puede que la hayan eliminado.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={folder?.name ?? 'General'}>
      <Link to="/documentos" className="back-link">
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
              {saving ? 'Guardando…' : 'Guardar carpeta'}
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
              <button type="button" className="btn btn-outlined btn-sm" onClick={() => setEditingFolder(true)}>
                <Icon name="edit" size={14} />
              </button>
              <button type="button" className="btn btn-danger-outline btn-sm" onClick={handleDeleteFolder}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {notice && <SuccessNotice message={notice} onClose={() => setNotice(null)} />}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {documents.length === 0 && (
        <div className="empty-state empty-state-action">
          <span>No hay documentos en esta carpeta todavía.</span>
          {canUploadFiles && (
            <Link to={isGeneral ? '/documentos/nuevo' : `/documentos/nuevo?folderId=${id}`} className="btn btn-primary">
              <Icon name="plus" size={16} />
              Subir el primer documento
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {documents.map((doc) => (
          <div key={doc.id} className="card-solid list-item">
            <div className="list-item-body">
              <h3 className="list-item-title">{doc.title}</h3>
              {doc.description && <p className="list-item-subtitle">{doc.description}</p>}
              <div className="list-item-meta">
                <span className="badge badge-info">{doc.category}</span>
                <span>{new Date(doc.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}</span>
                {doc.storage_path === 'pending' && <span className="badge badge-warning">Subiendo…</span>}
              </div>
            </div>
            <div className="list-item-actions">
              <button
                type="button"
                className="btn btn-outlined"
                disabled={doc.storage_path === 'pending' || openingId === doc.id}
                onClick={() => handleOpen(doc)}
              >
                <Icon name="file" size={13} />
                <span className="btn-label-full">{openingId === doc.id ? 'Abriendo…' : 'Ver'}</span>
              </button>
              {canManageFolders && (
                <>
                  {canUploadFiles && (
                    <Link to={`/documentos/${doc.id}/editar`} className="btn btn-outlined btn-icon-sm" aria-label="Editar">
                      <Icon name="edit" size={14} />
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger-outline btn-icon-sm"
                    disabled={trashingId === doc.id}
                    onClick={() => handleTrash(doc)}
                    aria-label="Eliminar"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {canUploadFiles && (
        <Link
          to={isGeneral ? '/documentos/nuevo' : `/documentos/nuevo?folderId=${id}`}
          className="btn btn-primary btn-icon fab"
          aria-label="Cargar documento en esta carpeta"
        >
          <Icon name="plus" size={20} />
          <span className="fab-label">Subir documento</span>
        </Link>
      )}
    </AppShell>
  )
}
