import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Icon } from './Icon'
import { formatBytes } from '../../lib/format'
import { inferMimeType } from '../../lib/api/storage'
import { usePickerReload } from '../../hooks/usePickerReload'

interface FilePickerProps {
  id: string
  label: string
  file: File | null
  onChange: (file: File | null) => void
  // Atributo accept del selector "Elegir archivo".
  accept: string
  // Validación real del tipo (MIME inferido, ver inferMimeType()).
  isAllowedType: (mimeType: string) => boolean
  maxBytes: number
  // Texto corto de formatos aceptados, para la ayuda y los errores.
  formatsLabel: string
  // Agrega "Sacar foto" (cámara trasera). Para documentos en papel: un aval
  // firmado, un acta. No reemplaza a "Elegir archivo": la galería sigue
  // disponible desde ese botón.
  allowCamera?: boolean
  disabled?: boolean
}

// Selector de archivos para escritorio y celular.
//
// Usa inputs nativos activados por <label> (sin click() programático), el
// camino más compatible con los selectores de Android e iOS. El input queda
// oculto visualmente pero accesible con teclado.
//
// Si Android recarga la página con el selector abierto, se avisa que hay
// que elegir el archivo de nuevo (usePickerReload).
export function FilePicker({
  id,
  label,
  file,
  onChange,
  accept,
  isAllowedType,
  maxBytes,
  formatsLabel,
  allowCamera = false,
  disabled = false,
}: FilePickerProps) {
  const [error, setError] = useState<string | null>(null)
  const { reloadedWhilePicking, markOpen, clearMark } = usePickerReload(id)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    clearMark()
    const selected = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!selected) return
    const mimeType = inferMimeType(selected)
    if (!isAllowedType(mimeType)) {
      const isHeic = /hei[cf]/i.test(mimeType) || /\.hei[cf]$/i.test(selected.name)
      setError(
        isHeic
          ? `El formato HEIC de "${selected.name}" no se admite acá. Elegí la foto en JPG o PNG (en iPhone: Ajustes → Cámara → Formatos → Más compatible).`
          : `"${selected.name}" no es un formato admitido. Formatos aceptados: ${formatsLabel}.`,
      )
      onChange(null)
      return
    }
    if (selected.size > maxBytes) {
      setError(`"${selected.name}" pesa ${formatBytes(selected.size)} y el máximo es ${formatBytes(maxBytes)}. Elegí un archivo más liviano.`)
      onChange(null)
      return
    }
    if (selected.size === 0) {
      setError(`"${selected.name}" está vacío. Elegí otro archivo.`)
      onChange(null)
      return
    }
    setError(null)
    onChange(selected)
  }

  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>

      {reloadedWhilePicking && !file && (
        <div className="alert alert-warning" role="status" style={{ marginBottom: 4 }}>
          <span className="alert-content">
            El celular recargó la página mientras elegías el archivo. Elegilo de nuevo para continuar.
          </span>
        </div>
      )}

      <div className={`file-picker${file ? ' file-picker--selected' : ''}${disabled ? ' file-picker--disabled' : ''}`} aria-labelledby={`${id}-label`} role="group">
        {file ? (
          <div className="file-picker-selected">
            <span className="list-item-icon">
              <Icon name="file" size={18} />
            </span>
            <span className="file-picker-name">
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)} · listo para subir</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm file-picker-remove"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={`Quitar ${file.name}`}
              title="Quitar archivo"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ) : (
          <div className="file-picker-empty">
            <Icon name="download" size={20} />
            <span>Todavía no elegiste un archivo.</span>
          </div>
        )}

        <div className="file-picker-actions">
          <input
            id={id}
            type="file"
            className="sr-only-file-input"
            accept={accept}
            onChange={handleChange}
            onClick={markOpen}
            disabled={disabled}
          />
          <label htmlFor={id} className={`btn ${file ? 'btn-outlined' : 'btn-secondary'}`} aria-disabled={disabled}>
            <Icon name="file" size={16} />
            {file ? 'Cambiar archivo' : 'Elegir archivo'}
          </label>

          {allowCamera && (
            <>
              <input
                id={`${id}-camera`}
                type="file"
                className="sr-only-file-input"
                accept="image/*"
                capture="environment"
                onChange={handleChange}
                onClick={markOpen}
                disabled={disabled}
              />
              <label htmlFor={`${id}-camera`} className="btn btn-outlined file-picker-camera" aria-disabled={disabled}>
                <Icon name="camera" size={16} />
                Sacar foto
              </label>
            </>
          )}

        </div>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-help">
          {formatsLabel}. Máximo {formatBytes(maxBytes)}.
        </p>
      )}
    </div>
  )
}
