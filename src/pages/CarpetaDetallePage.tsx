import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DocumentRow } from '../components/DocumentRow'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import {
  fetchDocumentsByFolder,
  fetchDocumentFolderById,
  fetchPublishedDocuments,
  fetchUnfiledDocuments,
  updateDocumentFolder,
  deleteDocumentFolder,
  trashDocument,
} from '../lib/api/documents'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { getDocumentSignedUrl } from '../lib/api/storage'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { canManageDocument, canPublishToAll, documentScopeLabel } from '../lib/documentAccess'
import type { DocumentFolder, DocumentRecord, Station, Subsede, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useDocumentAccess } from '../hooks/useDocumentAccess'
import { describeSupabaseError } from '../lib/api/errors'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { isEditConflict } from '../lib/concurrency'
import type { RowSnapshot } from '../lib/concurrency'

// Una carpeta, o uno de los dos espacios que no son carpeta:
//   "general"      lo publicado para todos (visibilidad "Visible para todos").
//   "sin-carpeta"  lo de mi alcance que no está en ninguna carpeta.
export function CarpetaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasRole, profile, scopes } = useAuth()
  const isRegionalRole = hasRole('secretario_regional')
  const isStationRole = hasRole('usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null
  const isGeneral = id === 'general'
  const isUnfiled = id === 'sin-carpeta'
  const isSpace = isGeneral || isUnfiled

  const [folder, setFolder] = useState<DocumentFolder | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [trashingId, setTrashingId] = useState<string | null>(null)

  const [editingFolder, setEditingFolder] = useState(false)
  // Otra persona cambió la carpeta mientras se editaba: lo que se intentó guardar.
  const [folderConflict, setFolderConflict] = useState<{ mine: Record<string, unknown> } | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const access = useDocumentAccess(stations, subsedes)
  const canUploadAnywhere = access.isAdmin || access.isRegional || access.isStationRole

  // document_folders_write_admin_regional_station (migración 0047): la carpeta
  // se administra según su propio alcance, no por el rol a secas.
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
  // Dónde se ofrece "Subir documento": en General solo a quien puede publicar
  // para todos; en "Sin carpeta" a quien carga documentos; en una carpeta, a
  // quien la administra.
  const canUploadHere = isGeneral ? canPublishToAll(access) : isUnfiled ? canUploadAnywhere : canManageFolders
  const uploadHref = isGeneral ? '/documentos/nuevo?visibilidad=todos' : isUnfiled ? '/documentos/nuevo' : `/documentos/nuevo?folderId=${id}`
  const [notice, setNotice] = useNavigationNotice()

  useEffect(() => {
    if (!id) return
    let active = true
    const documentsRequest = isGeneral ? fetchPublishedDocuments() : isUnfiled ? fetchUnfiledDocuments() : fetchDocumentsByFolder(id)
    Promise.all([isSpace ? Promise.resolve(null) : fetchDocumentFolderById(id), documentsRequest, fetchStations(), fetchSubsedes(), fetchVisibleDepartments().catch(() => [])])
      .then(([folderData, documentsData, stationsData, subsedesData, departmentsData]) => {
        if (!active) return
        setFolder(folderData)
        setDocuments(documentsData)
        setStations(stationsData)
        setSubsedes(subsedesData)
        setDepartments(departmentsData)
        if (folderData) {
          setName(folderData.name)
          setDescription(folderData.description ?? '')
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(describeSupabaseError(err, 'No pudimos cargar la carpeta. Reintentá en unos segundos.'))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, isGeneral, isUnfiled, isSpace])

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
    if (!id || isSpace) return
    setSaving(true)
    setError(null)
    const input = { name, description: description || null }
    try {
      const updated = await updateDocumentFolder(id, input, folder?.row_version)
      setFolder(updated)
      setEditingFolder(false)
    } catch (err) {
      if (isEditConflict(err)) {
        setFolderConflict({ mine: input })
      } else {
        setError(describeSupabaseError(err, 'No pudimos guardar la carpeta.'))
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteFolder() {
    if (!id || isSpace) return
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

  if (!isSpace && !folder) {
    return (
      <AppShell title="Carpeta">
        <div className="empty-state">No encontramos esa carpeta. Puede que la hayan eliminado.</div>
      </AppShell>
    )
  }

  const title = isGeneral ? 'General' : isUnfiled ? 'Sin carpeta' : folder?.name ?? 'Carpeta'
  const subtitle = isGeneral
    ? 'Lo publicado para todos: circulares y material institucional común. Lo ve cualquier persona con usuario de SIGER4.'
    : isUnfiled
      ? 'Documentos de tu alcance que no están en ninguna carpeta.'
      : folder?.description ?? ''
  const names = { stations, subsedes, departments }

  return (
    <AppShell title={title}>
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
          {folderConflict && id && (
            <EditConflictPanel
              table="document_folders"
              recordId={id}
              base={folder as unknown as RowSnapshot}
              mine={folderConflict.mine}
              onSave={(patch, version) => updateDocumentFolder(id, patch as Parameters<typeof updateDocumentFolder>[1], version)}
              onResolved={(saved) => {
                setFolder(saved as typeof folder)
                setFolderConflict(null)
                setEditingFolder(false)
              }}
              onDiscard={() => window.location.reload()}
              onClose={() => setFolderConflict(null)}
            />
          )}
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
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
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
          <span>
            {isGeneral
              ? 'Todavía no hay nada publicado para todos.'
              : isUnfiled
                ? 'No hay documentos sin carpeta.'
                : 'No hay documentos en esta carpeta todavía.'}
          </span>
          {canUploadHere ? (
            <Link to={uploadHref} className="btn btn-primary">
              <Icon name="plus" size={16} />
              {isGeneral ? 'Publicar un documento' : 'Subir el primer documento'}
            </Link>
          ) : (
            isGeneral && <span>Para publicar algo acá, pedíselo a Informática o al Secretario Regional.</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            scopeLabel={documentScopeLabel(doc, names)}
            canManage={canManageDocument(doc, access)}
            opening={openingId === doc.id}
            trashing={trashingId === doc.id}
            onOpen={() => void handleOpen(doc)}
            onTrash={() => void handleTrash(doc)}
          />
        ))}
      </div>

      {canUploadHere && (
        <Link to={uploadHref} className="btn btn-primary btn-icon fab" aria-label={isGeneral ? 'Publicar un documento en General' : 'Cargar documento en esta carpeta'}>
          <Icon name="plus" size={20} />
          <span className="fab-label">{isGeneral ? 'Publicar documento' : 'Subir documento'}</span>
        </Link>
      )}
    </AppShell>
  )
}
