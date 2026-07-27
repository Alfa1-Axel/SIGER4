import { useEffect, useState } from 'react'
import { Icon } from './Icon'

interface ImagePickerProps {
  label: string
  currentUrl: string | null | undefined
  onFileSelected: (file: File | null) => void
  shape?: 'circle' | 'rounded'
  width?: number
  height?: number
}

// Selector de imagen con vista previa inmediata del archivo elegido (antes de
// guardar), para que el usuario vea cómo va a quedar centrada/recortada en
// vez de recién enterarse después de guardar. object-fit: cover asegura que
// nunca se vea deformada, solo recortada de forma centrada.
export function ImagePicker({ label, currentUrl, onFileSelected, shape = 'circle', width = 96, height = 96 }: ImagePickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleChange(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
    onFileSelected(file)
  }

  const displayUrl = previewUrl ?? currentUrl

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width,
            height,
            borderRadius: shape === 'circle' ? '50%' : 8,
            overflow: 'hidden',
            flexShrink: 0,
            background: 'var(--color-border)',
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
        <label className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          <Icon name="edit" size={14} />
          Cambiar imagen
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </div>
  )
}
