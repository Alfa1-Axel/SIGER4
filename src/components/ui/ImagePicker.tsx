import { useEffect, useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Icon } from './Icon'
import { formatBytes } from '../../lib/format'
import { inferMimeType } from '../../lib/api/storage'

interface ImagePickerProps {
  label: string
  currentUrl: string | null | undefined
  onFileSelected: (file: File | null) => void
  shape?: 'circle' | 'rounded'
  width?: number
  height?: number
  // Mismos límites que el bucket de destino (avatars / station-media, ver
  // 0033_storage_hardening.sql): validar acá da un error claro al elegir la
  // foto, en vez de un rechazo de Storage recién al guardar.
  allowedTypes?: string[]
  maxBytes?: number
}

const DEFAULT_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/svg+xml': 'SVG',
}

// "JPG, PNG o WEBP" a partir de los tipos admitidos.
function formatsLabel(types: string[]): string {
  const labels = [...new Set(types.map((t) => TYPE_LABELS[t] ?? t))].sort((a, b) =>
    a === 'JPG' ? -1 : b === 'JPG' ? 1 : 0,
  )
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} o ${labels[labels.length - 1]}` : labels.join('')
}

// Selector de imagen con vista previa inmediata del archivo elegido (antes de
// guardar), para que el usuario vea cómo va a quedar centrada/recortada en
// vez de recién enterarse después de guardar. object-fit: cover asegura que
// nunca se vea deformada, solo recortada de forma centrada. En el celular,
// "Cambiar imagen" abre el selector del sistema (galería o cámara).
export function ImagePicker({
  label,
  currentUrl,
  onFileSelected,
  shape = 'circle',
  width = 96,
  height = 96,
  allowedTypes = DEFAULT_TYPES,
  maxBytes = 5 * 1024 * 1024,
}: ImagePickerProps) {
  const inputId = useId()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const formats = formatsLabel(allowedTypes)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    const mimeType = inferMimeType(file)
    if (!allowedTypes.includes(mimeType)) {
      const isHeic = /hei[cf]/i.test(mimeType) || /\.hei[cf]$/i.test(file.name)
      setError(
        isHeic
          ? 'Las fotos HEIC de iPhone no se admiten acá. Elegí una en JPG o PNG (en iPhone: Ajustes → Cámara → Formatos → Más compatible).'
          : `"${file.name}" no es una imagen admitida. Usá ${formats}.`,
      )
      return
    }
    if (file.size > maxBytes) {
      setError(`La imagen pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(maxBytes)}. Elegí una más liviana.`)
      return
    }
    setError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    onFileSelected(file)
  }

  const displayUrl = previewUrl ?? currentUrl

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width,
            height,
            borderRadius: shape === 'circle' ? '50%' : 'var(--radius-lg)',
            overflow: 'hidden',
            flexShrink: 0,
            background: 'var(--color-surface-hover)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-border)',
          }}
        >
          {displayUrl ? (
            <img src={displayUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          ) : (
            <Icon name="user" size={Math.round(Math.min(width, height) * 0.4)} />
          )}
        </div>
        <input id={inputId} type="file" accept={allowedTypes.join(',')} className="sr-only-file-input" onChange={handleChange} />
        <label htmlFor={inputId} className="btn btn-outlined btn-sm">
          <Icon name="edit" size={14} />
          {displayUrl ? 'Cambiar imagen' : 'Elegir imagen'}
        </label>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-help">
          {formats}. Máximo {formatBytes(maxBytes)}.
        </p>
      )}
    </div>
  )
}
