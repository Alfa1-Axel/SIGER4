import { Icon } from './Icon'

// Aviso verde de "listo" con botón para cerrarlo (ver useNavigationNotice).
export function SuccessNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="alert alert-success" role="status">
      <span className="alert-content">{message}</span>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar aviso" onClick={onClose} style={{ color: 'inherit' }}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
