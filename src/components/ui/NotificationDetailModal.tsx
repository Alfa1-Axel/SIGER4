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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        className="card-solid"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.35 }}>{notification.title}</h2>
          <button type="button" className="btn btn-icon btn-outlined" style={{ padding: 4, flexShrink: 0 }} onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="badge badge-info">{typeLabel}</span>
          <span className={`badge ${notification.is_read ? 'badge-info' : 'badge-warning'}`}>
            {notification.is_read ? 'Leída' : 'No leída'}
          </span>
        </div>

        {notification.body && (
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{notification.body}</p>
        )}

        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{new Date(notification.created_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</span>
          {scopeLabel && <span>Alcance: {scopeLabel}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
