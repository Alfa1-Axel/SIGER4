import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { describeSupabaseError } from '../../lib/api/errors'

interface DeleteUserConfirmModalProps {
  fullName: string
  onConfirm: () => Promise<void>
  onClose: () => void
}

// Confirmación reforzada para el borrado directo de un usuario: a diferencia
// de ReasonPromptModal (motivo obligatorio, usado para bajas reversibles como
// vehículos/personal), esta acción es irreversible y borra la cuenta de Auth
// — exige tipear el nombre completo exacto del usuario, no solo un motivo
// libre, para reducir el riesgo de confirmar sin leer.
export function DeleteUserConfirmModal({ fullName, onConfirm, onClose }: DeleteUserConfirmModalProps) {
  const [typedName, setTypedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const matches = typedName.trim() === fullName.trim()

  async function handleConfirm() {
    if (!matches) {
      setError('El nombre no coincide.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos eliminar el usuario.'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Eliminar usuario"
      onClick={onClose}
      className="modal-overlay"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Eliminar usuario</h2>
          <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="modal-body" style={{ marginTop: 0, marginBottom: 8 }}>
          Esta acción eliminará el usuario del sistema: cuenta de acceso, roles y alcances. No se puede deshacer. Si el
          usuario tenía documentos personales dirigidos a él, esos documentos también se eliminan (el resto de los
          registros institucionales que lo referencian se preserva, sin el vínculo).
        </p>
        <p className="modal-body" style={{ marginTop: 0, marginBottom: 12 }}>
          Para confirmar, escribí el nombre completo del usuario: <strong>{fullName}</strong>
        </p>
        <div className="field">
          <label htmlFor="confirmName">Nombre completo</label>
          <input id="confirmName" required value={typedName} onChange={(e) => setTypedName(e.target.value)} autoFocus autoComplete="off" />
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outlined" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" disabled={submitting || !matches} onClick={handleConfirm}>
            {submitting ? 'Eliminando…' : 'Eliminar usuario'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
