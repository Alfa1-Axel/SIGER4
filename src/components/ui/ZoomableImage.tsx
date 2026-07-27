import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import { Lightbox } from './Lightbox'

interface ZoomableImageProps {
  src: string
  alt: string
  style?: CSSProperties
  className?: string
  children?: never
}

// Envoltorio reutilizable: cualquier imagen del sistema (cuartel, documentos,
// perfiles) puede ampliarse en un lightbox con solo envolverla en este
// componente. Muestra un ícono de lupa al pasar el mouse como pista visual de
// que la imagen se puede abrir, y funciona igual con click/tap.
export function ZoomableImage({ src, alt, style, className }: ZoomableImageProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ampliar imagen: ${alt}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen(true)
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={className}
        style={{ position: 'relative', cursor: 'zoom-in', ...style }}
      >
        <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
        {hovered && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Icon name="zoomIn" size={22} />
          </div>
        )}
      </div>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}
