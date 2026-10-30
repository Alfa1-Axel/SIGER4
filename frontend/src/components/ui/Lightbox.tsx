import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { useDialogFocus } from '../../hooks/useDialogFocus'

interface LightboxProps {
  src: string
  alt: string
  onClose: () => void
}

// Modal simple para ampliar una imagen: fondo oscuro, imagen centrada sin
// deformar (object-fit: contain), botón de cierre, click afuera y Escape
// también cierran. Pensado para reutilizarse en cualquier imagen del sistema
// (cuartel, documentos, perfiles), no solo en el detalle de cuartel.
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose)

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-overlay-strong)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 24,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="btn btn-icon btn-outlined"
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 101 }}
      >
        <Icon name="close" size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
      />
    </div>,
    document.body,
  )
}
