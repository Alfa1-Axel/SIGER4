import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { DOCUMENT_VISIBILITY_LABEL } from '../lib/documentAccess'
import type { DocumentRecord } from '../types/database'

interface DocumentRowProps {
  doc: DocumentRecord
  // "Cuartel Villa del Rosario", "Departamento Fuego", "Regional"…
  scopeLabel: string
  canManage: boolean
  opening: boolean
  trashing: boolean
  onOpen: () => void
  onTrash: () => void
}

// Un documento en una lista: título, tipo, fecha, de quién es y quién lo ve, y
// sus acciones (ver; editar y enviar a la papelera para quien lo administra).
export function DocumentRow({ doc, scopeLabel, canManage, opening, trashing, onOpen, onTrash }: DocumentRowProps) {
  return (
    <div className="card-solid list-item">
      <div className="list-item-body">
        <h3 className="list-item-title">{doc.title}</h3>
        {doc.description && <p className="list-item-subtitle">{doc.description}</p>}
        <div className="list-item-meta">
          <span className="badge badge-info">{doc.category}</span>
          <span>{new Date(doc.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}</span>
          <span>{scopeLabel}</span>
          {doc.visibility === 'todos' && <span className="badge badge-success">{DOCUMENT_VISIBILITY_LABEL.todos}</span>}
          {doc.visibility === 'restringido' && <span className="badge badge-warning">{DOCUMENT_VISIBILITY_LABEL.restringido}</span>}
          {doc.storage_path === 'pending' && <span className="badge badge-warning">Subiendo…</span>}
        </div>
      </div>
      <div className="list-item-actions">
        <button type="button" className="btn btn-outlined" disabled={doc.storage_path === 'pending' || opening} onClick={onOpen}>
          <Icon name="file" size={13} />
          <span className="btn-label-full">{opening ? 'Abriendo…' : 'Ver'}</span>
        </button>
        {canManage && (
          <>
            <Link to={`/documentos/${doc.id}/editar`} className="btn btn-outlined btn-icon-sm" aria-label="Editar">
              <Icon name="edit" size={14} />
            </Link>
            <button type="button" className="btn btn-danger-outline btn-icon-sm" disabled={trashing} onClick={onTrash} aria-label="Eliminar">
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
