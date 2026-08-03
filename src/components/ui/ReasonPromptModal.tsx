import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

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
      setError(err instanceof Error ? err.message : 'No pudimos completar la acción.')
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
        style={{ maxWidth: 420, width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
          <button type="button" className="btn btn-icon btn-outlined" style={{ padding: 4 }} onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>{description}</p>
        )}
        <div className="field">
          <label htmlFor="reason">Motivo</label>
          <textarea id="reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        {error && <p className="field-error">{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Guardando…' : confirmLabel}
          </button>
          <button type="button" className="btn btn-outlined" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
