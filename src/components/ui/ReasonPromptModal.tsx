import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { describeSupabaseError } from '../../lib/api/errors'

interface ReasonPromptModalProps {
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: (reason: string) => Promise<void> | void
  onClose: () => void
}

// Modal generico para acciones que exigen un motivo obligatorio antes de
// confirmarse (ej. dar de baja/vender/transferir un vehículo, cambiar el
// estado de un integrante a renuncia/baja/pase). No confirma con el motivo
// vacío; muestra el error de la acción si falla.
export function ReasonPromptModal({ title, description, confirmLabel = 'Confirmar', onConfirm, onClose }: ReasonPromptModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('El motivo es obligatorio.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos completar la acción.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="modal-overlay"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>
        {description && (
          <p className="modal-body" style={{ marginTop: 0, marginBottom: 12 }}>{description}</p>
        )}
        <div className="field">
          <label htmlFor="reason">Motivo</label>
          <textarea id="reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outlined" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
