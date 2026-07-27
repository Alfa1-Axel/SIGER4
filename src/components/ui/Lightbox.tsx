import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

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
      aria-label={alt}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="btn btn-icon btn-inverted"
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
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      />
    </div>,
    document.body,
  )
}
