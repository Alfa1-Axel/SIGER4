import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Icon } from './Icon'
import { formatBytes } from '../../lib/format'
import { inferMimeType } from '../../lib/api/storage'

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

const PICKER_FLAG_PREFIX = 'siger4:picker-open:'

function readPickerFlag(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(PICKER_FLAG_PREFIX + id)
    if (!raw) return false
    sessionStorage.removeItem(PICKER_FLAG_PREFIX + id)
    return Date.now() - Number(raw) < 15 * 60 * 1000
  } catch {
    return false
  }
}

function setPickerFlag(id: string, open: boolean) {
  try {
    if (open) sessionStorage.setItem(PICKER_FLAG_PREFIX + id, String(Date.now()))
    else sessionStorage.removeItem(PICKER_FLAG_PREFIX + id)
  } catch {
    // Sin sessionStorage (modo privado): solo se pierde el aviso de recarga.
  }
}

// Selector de archivos para escritorio y celular.
//
// Usa inputs nativos activados por <label> (sin click() programático), el
// camino más compatible con los selectores de Android e iOS. El input queda
// oculto visualmente pero accesible con teclado.
//
// Android puede cerrar la app en segundo plano mientras el selector está
// abierto y recargarla al volver (ver DEPLOYMENT.md, sección 19): el archivo
// elegido se pierde. Para que no sea un misterio, al abrir el selector se
// deja una marca en sessionStorage; si la página vuelve a cargar con la marca
// todavía puesta, se avisa que hay que elegir el archivo de nuevo.
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
  const [reloadedWhilePicking] = useState(() => readPickerFlag(id))

  // Al volver del selector sin recarga (eligiendo o cancelando), la ventana
  // recupera el foco: se limpia la marca.
  useEffect(() => {
    const clear = () => setPickerFlag(id, false)
    window.addEventListener('focus', clear)
    return () => {
      window.removeEventListener('focus', clear)
      // Salir del formulario dentro de la app no es una recarga.
      clear()
    }
  }, [id])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setPickerFlag(id, false)
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

  const markOpen = () => setPickerFlag(id, true)

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
