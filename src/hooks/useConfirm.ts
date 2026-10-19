import { createContext, useContext, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  // Texto del botón que confirma: un verbo concreto ("Eliminar informe"), nunca "Aceptar".
  confirmLabel?: string
  cancelLabel?: string
  // 'danger' para lo que no se puede deshacer: el foco arranca en el botón que NO confirma.
  tone?: 'default' | 'danger'
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

// Sin ConfirmProvider (por ejemplo en una prueba aislada) se cae a la confirmación del navegador.
const nativeConfirm: ConfirmFn = async ({ title, message }) =>
  window.confirm(typeof message === 'string' && message ? `${title} ${message}` : title)

// Confirmación propia del sistema, en lugar de window.confirm:
//   const confirm = useConfirm()
//   if (!(await confirm({ title: '¿Eliminar este evento?', confirmLabel: 'Eliminar evento', tone: 'danger' }))) return
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? nativeConfirm
}
