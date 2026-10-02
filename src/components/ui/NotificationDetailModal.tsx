import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import type { Notification } from '../../types/database'

interface NotificationDetailModalProps {
  notification: Notification
  typeLabel: string
  scopeLabel: string | null
  onClose: () => void
}

// Detalle completo de una notificación — el listado (.list-item-title/
// .list-item-subtitle) recorta título y cuerpo a 2 líneas via -webkit-line-clamp,
// lo cual corta textos largos como el resumen semanal admin o los recordatorios
// institucionales. Este modal muestra el texto sin recortar. Sigue el mismo
// patrón que ReasonPromptModal.tsx (createPortal, Escape para cerrar, click
// afuera para cerrar) para mantener consistencia visual con el resto del sistema.
export function NotificationDetailModal({ notification, typeLabel, scopeLabel, onClose }: NotificationDetailModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={notification.title}
      onClick={onClose}
      className="modal-overlay"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: 12 }}>
          <h2 className="modal-title">{notification.title}</h2>
          <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="badge badge-info">{typeLabel}</span>
          <span className={`badge ${notification.is_read ? '' : 'badge-warning'}`}>
            {notification.is_read ? 'Leída' : 'No leída'}
          </span>
        </div>

        {notification.body && (
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{notification.body}</p>
        )}

        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{new Date(notification.created_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</span>
          {scopeLabel && <span>Alcance: {scopeLabel}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
