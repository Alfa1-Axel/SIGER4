import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DocumentRow } from '../components/DocumentRow'
import { AccessDenied } from '../components/ui/AccessDenied'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import { fetchDocumentsByDepartment, trashDocument } from '../lib/api/documents'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { getDocumentSignedUrl } from '../lib/api/storage'
import { canManageDocument, canPublishToAll, documentScopeLabel } from '../lib/documentAccess'
import type { DocumentRecord, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useDocumentAccess } from '../hooks/useDocumentAccess'
import { describeSupabaseError } from '../lib/api/errors'

// Espacio documental de un departamento: lo que cargan su coordinador y sus
// integrantes. Lo ven ellos e Informática; no se mezcla con otros departamentos.
export function DocumentosDepartamentoPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, profile } = useAuth()
  const access = useDocumentAccess()

  const [department, setDepartment] = useState<VisibleDepartment | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [trashingId, setTrashingId] = useState<string | null>(null)
  const [notice, setNotice] = useNavigationNotice()

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchVisibleDepartments(), fetchDocumentsByDepartment(id)])
      .then(([departments, docs]) => {
        if (!active) return
        setDepartment(departments.find((d) => d.id === id) ?? null)
        setDocuments(docs)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(describeSupabaseError(err, 'No pudimos cargar los documentos del departamento. Reintentá en unos segundos.'))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  async function handleOpen(doc: DocumentRecord) {
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

  if (loading) {
    return (
      <AppShell title="Documentos del departamento">
        <div className="loading-state" role="status">Cargando documentos…</div>
      </AppShell>
    )
  }

  // Los documentos de un departamento son de su coordinador, sus integrantes e
  // Informática (la base no devuelve nada más): sin eso, no hay espacio para mostrar.
  const belongs = isAdmin || Boolean(department?.my_relation)
  if (!department || !belongs) {
    return (
      <AppShell title="Documentos del departamento">
        <AccessDenied
          title="No podés ver estos documentos"
          message="Los documentos de un departamento los ven su coordinador, sus integrantes e Informática y Estadística. Si trabajás en ese departamento y no los ves, consultá a Informática y Estadística."
          backTo="/documentos"
          backLabel="Volver a Documentos"
        />
      </AppShell>
    )
  }

  const canUpload = department.is_active
  const uploadHref = `/documentos/nuevo?departamento=${department.id}`
  const names = { stations: [], subsedes: [], departments: [department] }

  return (
    <AppShell title={`Documentos de ${department.name}`}>
      <Link to="/documentos" className="back-link">
        ← Volver a Documentos
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Documentos de {department.name}</h1>
          <p className="page-subtitle">
            Los ven el coordinador, los integrantes del departamento e Informática y Estadística.
            {canPublishToAll(access)
              ? ' Si algo es de interés general, podés publicarlo para todos al cargarlo o editarlo.'
              : ' Si algo es de interés general, pedile a Informática o al Secretario Regional que lo publique.'}
          </p>
        </div>
        <Link to={`/departamentos/${department.id}`} className="btn btn-outlined btn-sm">
          Ver departamento
        </Link>
      </div>

      {notice && <SuccessNotice message={notice} onClose={() => setNotice(null)} />}
      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {!department.is_active && (
        <div className="alert alert-info" role="note">Este departamento está inactivo: se pueden ver sus documentos, pero no cargar nuevos.</div>
      )}

      {documents.length === 0 && (
        <div className="empty-state empty-state-action">
          <span>Todavía no hay documentos de {department.name}.</span>
          {canUpload && (
            <Link to={uploadHref} className="btn btn-primary">
              <Icon name="plus" size={16} />
              Subir el primer documento
            </Link>
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

      {canUpload && (
        <Link to={uploadHref} className="btn btn-primary btn-icon fab" aria-label={`Subir un documento de ${department.name}`}>
          <Icon name="plus" size={20} />
          <span className="fab-label">Subir documento</span>
        </Link>
      )}
    </AppShell>
  )
}
