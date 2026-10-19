import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from '../../hooks/useConfirm'
import { useDialogFocus } from '../../hooks/useDialogFocus'

interface PendingConfirm {
  id: number
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

function ConfirmDialogView({ options, onResult }: { options: ConfirmOptions; onResult: (confirmed: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()
  const danger = options.tone === 'danger'

  // Lo irreversible arranca con el foco en "cancelar": un Enter distraído no borra nada.
  useDialogFocus(dialogRef, () => onResult(false), danger ? cancelRef : confirmRef)

  return createPortal(
    <div className="modal-overlay" onClick={() => onResult(false)}>
      <div
        ref={dialogRef}
        className="modal"
        role={danger ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {options.title}
          </h2>
        </div>
        {options.message && (
          <p id={messageId} className="modal-body confirm-message">
            {options.message}
          </p>
        )}
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-outlined" onClick={() => onResult(false)}>
            {options.cancelLabel ?? 'Cancelar'}
          </button>
          <button ref={confirmRef} type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => onResult(true)}>
            {options.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Monta una sola confirmación a la vez. Si se pide otra con una abierta, la anterior se da por cancelada.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const activeRef = useRef<PendingConfirm | null>(null)
  const seqRef = useRef(0)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      activeRef.current?.resolve(false)
      seqRef.current += 1
      const next = { id: seqRef.current, options, resolve }
      activeRef.current = next
      setPending(next)
    })
  }, [])

  const finish = useCallback((confirmed: boolean) => {
    const current = activeRef.current
    activeRef.current = null
    setPending(null)
    current?.resolve(confirmed)
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current?.resolve(false)
      activeRef.current = null
    }
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialogView key={pending.id} options={pending.options} onResult={finish} />}
    </ConfirmContext.Provider>
  )
}
