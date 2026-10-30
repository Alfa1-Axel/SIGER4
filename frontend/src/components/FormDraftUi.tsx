import { Icon } from './ui/Icon'
import type { useFormDraft } from '../hooks/useFormDraft'

// Piezas visibles del autoguardado de borradores (hook useFormDraft): el
// aviso de recuperación al abrir el formulario y la línea de estado.

type Draft<T extends object> = ReturnType<typeof useFormDraft<T>>

function formatWhen(value: string | Date | null): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatTime(value: Date | null): string {
  return value ? value.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
}

interface RecoveryProps<T extends object> {
  draft: Draft<T>
  // Cómo se llama lo que se está cargando: "un informe", "un documento", "la ficha".
  subject: string
  // Carga en el formulario el contenido recuperado.
  onApply: (payload: T) => void
  // Versión vigente del registro que se está editando (si es una edición), para avisar si cambió.
  currentVersion?: number | null
}

export function DraftRecoveryBanner<T extends object>({ draft, subject, onApply, currentVersion = null }: RecoveryProps<T>) {
  const found = draft.recovered
  if (!found) return null
  const isEdit = found.recordId !== null
  const changedSince = isEdit && found.baseVersion !== null && currentVersion !== null && found.baseVersion < currentVersion
  return (
    <div className="alert alert-info draft-recovery" role="status">
      <span aria-hidden="true">
        <Icon name="info" size={18} />
      </span>
      <div className="alert-content">
        <strong>{isEdit ? `Tenés cambios sin guardar en ${subject}.` : `Tenés un borrador de ${subject} sin publicar.`}</strong>
        <p className="draft-recovery-text">
          Se guardó {formatWhen(found.updatedAt)}
          {found.source === 'dispositivo' ? ' solo en este dispositivo: nunca llegó al servidor.' : ' como borrador.'}{' '}
          {isEdit ? 'El registro todavía no tiene estos cambios.' : 'Todavía no está publicado.'}
          {changedSince && ' Mientras tanto el registro cambió: al guardar vas a ver las diferencias.'}
        </p>
        <div className="draft-recovery-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const accepted = draft.acceptRecovered()
              if (accepted) onApply(accepted.payload)
            }}
          >
            Recuperar borrador
          </button>
          <button type="button" className="btn btn-outlined btn-sm" onClick={() => void draft.discard()}>
            Descartar
          </button>
        </div>
      </div>
    </div>
  )
}

interface StatusProps<T extends object> {
  draft: Draft<T>
  // Alta nueva (no hay registro todavía) o cambios sobre uno existente.
  isNew: boolean
  onApply: (payload: T) => void
}

export function DraftStatusLine<T extends object>({ draft, isNew, onApply }: StatusProps<T>) {
  const { status, lastSavedAt, errorMessage, conflict } = draft
  if (status === 'idle' && !lastSavedAt) return null

  if (status === 'conflict') {
    return (
      <div className="alert alert-warning draft-status draft-status--conflict" role="alert">
        <div className="alert-content">
          <strong>
            {conflict === 'gone'
              ? 'Este borrador ya se publicó o se descartó en otra pestaña o dispositivo.'
              : 'Este borrador se guardó desde otra pestaña o dispositivo.'}
          </strong>
          <p className="draft-recovery-text">Lo que escribiste acá sigue en pantalla y no se perdió. Elegí cómo seguir:</p>
          <div className="draft-recovery-actions">
            {conflict !== 'gone' && (
              <button
                type="button"
                className="btn btn-outlined btn-sm"
                onClick={async () => {
                  const other = await draft.loadOtherDraft()
                  if (other) onApply(other.payload)
                }}
              >
                Traer ese borrador
              </button>
            )}
            <button type="button" className="btn btn-outlined btn-sm" onClick={() => void draft.overwriteOtherDraft()}>
              {conflict === 'gone' ? 'Volver a guardarlo como borrador' : 'Seguir con este'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  let text: string
  let tone: 'ok' | 'wait' | 'warn' = 'wait'
  switch (status) {
    case 'dirty':
      text = 'Cambios pendientes de guardar'
      break
    case 'saving':
      text = 'Guardando borrador…'
      break
    case 'saved':
      text = `Borrador guardado a las ${formatTime(lastSavedAt)}. ${isNew ? 'Todavía no está publicado.' : 'El registro no cambia hasta que toques Guardar.'}`
      tone = 'ok'
      break
    case 'offline':
      text = 'Sin conexión: lo que escribiste está solo en este dispositivo y todavía no llegó al servidor. Se guarda solo cuando vuelva internet.'
      tone = 'warn'
      break
    case 'error':
      text = `No pudimos guardar el borrador.${errorMessage && !/^No pudimos guardar el borrador/.test(errorMessage) ? ` ${errorMessage}` : ''}${errorMessage?.includes('sigue en esta pantalla') ? '' : ' Lo escrito sigue en esta pantalla; vamos a reintentar.'}`
      tone = 'warn'
      break
    case 'unavailable':
      text = errorMessage ?? 'Los borradores del servidor todavía no están disponibles: lo que escribís se conserva solo mientras esta pestaña siga abierta.'
      tone = 'warn'
      break
    default:
      text = lastSavedAt ? `Borrador guardado a las ${formatTime(lastSavedAt)}.` : ''
      tone = 'ok'
  }

  return (
    <p className={`draft-status draft-status--${tone}`} role="status" aria-live="polite">
      {text}
      {(status === 'error' || status === 'offline') && (
        <>
          {' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => draft.retryNow()}>
            Reintentar ahora
          </button>
        </>
      )}
    </p>
  )
}
