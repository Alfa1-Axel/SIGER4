import { Icon } from './Icon'
import type { NoticeTone } from '../../hooks/useNavigationNotice'

// Aviso de "listo" (verde) o de resultado parcial (amarillo), con botón para
// cerrarlo (ver useNavigationNotice).
export function SuccessNotice({ message, onClose, tone = 'success' }: { message: string; onClose: () => void; tone?: NoticeTone }) {
  return (
    <div className={`alert ${tone === 'warning' ? 'alert-warning' : 'alert-success'}`} role="status">
      <span className="alert-content">{message}</span>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar aviso" onClick={onClose} style={{ color: 'inherit' }}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
