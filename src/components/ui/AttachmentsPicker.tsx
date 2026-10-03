import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Icon } from './Icon'
import { formatBytes } from '../../lib/format'
import { departmentReportMaxBytes, inferMimeType, isDepartmentReportMimeAllowed } from '../../lib/api/storage'
import { usePickerReload } from '../../hooks/usePickerReload'

// Formatos de informes de Departamentos (mismos que el bucket
// department-reports, 0098). Extensiones incluidas para los selectores de
// Android que no informan el tipo.
const ACCEPT = [
  'application/pdf,.pdf,.doc,.docx,.xls,.xlsx',
  'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif',
  'video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.m4v,.webm,.3gp',
].join(',')

export const ATTACHMENTS_FORMATS_LABEL = 'PDF, Word, Excel, fotos (JPG, PNG, WEBP, HEIC) y videos (MP4, MOV)'

function fileKind(file: File): 'documento' | 'imagen' | 'video' {
  const mime = inferMimeType(file)
  if (mime.startsWith('image/')) return 'imagen'
  if (mime.startsWith('video/')) return 'video'
  return 'documento'
}

const KIND_ICON = { documento: 'file', imagen: 'image', video: 'video' } as const

interface AttachmentsPickerProps {
  id: string
  label: string
  files: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  // Archivos que el informe ya tiene: cuentan para el máximo.
  existingCount?: number
  required?: boolean
  disabled?: boolean
  // Ayuda corta debajo del título (qué conviene adjuntar).
  hint?: string
}

// Selector de varios adjuntos para escritorio y celular: archivos de la
// galería o del almacenamiento, foto con la cámara o video. Inputs nativos
// activados por <label>, igual que FilePicker. Cada archivo se valida al
// elegirlo (tipo, tamaño, vacío); los rechazados se explican y no se suman.
export function AttachmentsPicker({
  id,
  label,
  files,
  onChange,
  maxFiles = 10,
  existingCount = 0,
  required = false,
  disabled = false,
  hint,
}: AttachmentsPickerProps) {
  const [errors, setErrors] = useState<string[]>([])
  const { reloadedWhilePicking, markOpen, clearMark } = usePickerReload(id)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    clearMark()
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (picked.length === 0) return

    const nextErrors: string[] = []
    const accepted: File[] = []
    let room = maxFiles - existingCount - files.length
    for (const file of picked) {
      const mime = inferMimeType(file)
      if (!isDepartmentReportMimeAllowed(mime)) {
        nextErrors.push(`"${file.name}" no es un formato admitido.`)
        continue
      }
      const max = departmentReportMaxBytes(mime)
      if (file.size > max) {
        nextErrors.push(`"${file.name}" pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(max)}.`)
        continue
      }
      if (file.size === 0) {
        nextErrors.push(`"${file.name}" está vacío.`)
        continue
      }
      if (files.some((f) => f.name === file.name && f.size === file.size) || accepted.some((f) => f.name === file.name && f.size === file.size)) {
        continue
      }
      if (room <= 0) {
        nextErrors.push(`Se pueden adjuntar hasta ${maxFiles} archivos por informe. "${file.name}" no se agregó.`)
        continue
      }
      accepted.push(file)
      room -= 1
    }
    setErrors(nextErrors)
    if (accepted.length > 0) onChange([...files, ...accepted])
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index))
    setErrors([])
  }

  const atLimit = existingCount + files.length >= maxFiles

  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>
        {label}
        {!required && <span className="field-label-optional"> (opcional)</span>}
      </span>
      {hint && <p className="field-help" style={{ marginBottom: 8 }}>{hint}</p>}

      {reloadedWhilePicking && files.length === 0 && (
        <div className="alert alert-warning" role="status" style={{ marginBottom: 4 }}>
          <span className="alert-content">
            El celular recargó la página mientras elegías los archivos. Elegilos de nuevo para continuar.
          </span>
        </div>
      )}

      <div className={`file-picker${files.length ? ' file-picker--selected' : ''}${disabled ? ' file-picker--disabled' : ''}`} aria-labelledby={`${id}-label`} role="group">
        {files.length > 0 ? (
          <ul className="attachment-list">
            {files.map((file, index) => {
              const kind = fileKind(file)
              return (
                <li key={`${file.name}-${file.size}-${index}`} className="attachment-item">
                  <span className="list-item-icon">
                    <Icon name={KIND_ICON[kind]} size={18} />
                  </span>
                  <span className="file-picker-name">
                    <strong>{file.name}</strong>
                    <span>{formatBytes(file.size)} · listo para subir</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm file-picker-remove"
                    onClick={() => removeAt(index)}
                    disabled={disabled}
                    aria-label={`Quitar ${file.name}`}
                    title="Quitar"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="file-picker-empty">
            <Icon name="download" size={20} />
            <span>Todavía no agregaste archivos.</span>
          </div>
        )}

        {!atLimit && (
          <div className="file-picker-actions">
            <input
              id={`${id}-files`}
              type="file"
              multiple
              className="sr-only-file-input"
              accept={ACCEPT}
              onChange={handleChange}
              onClick={markOpen}
              disabled={disabled}
            />
            <label htmlFor={`${id}-files`} className={`btn ${files.length ? 'btn-outlined' : 'btn-secondary'}`} aria-disabled={disabled}>
              <Icon name="file" size={16} />
              {files.length ? 'Agregar más' : 'Elegir archivos'}
            </label>

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

            <input
              id={`${id}-video`}
              type="file"
              className="sr-only-file-input"
              accept="video/*"
              capture="environment"
              onChange={handleChange}
              onClick={markOpen}
              disabled={disabled}
            />
            <label htmlFor={`${id}-video`} className="btn btn-outlined file-picker-camera" aria-disabled={disabled}>
              <Icon name="video" size={16} />
              Grabar video
            </label>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="field-error" role="alert">
          {errors.map((message) => (
            <p key={message} style={{ margin: 0 }}>
              {message}
            </p>
          ))}
        </div>
      )}
      <p className="field-help">
        {ATTACHMENTS_FORMATS_LABEL}. Hasta 20 MB por archivo y 50 MB por video; máximo {maxFiles} archivos.
      </p>
    </div>
  )
}
