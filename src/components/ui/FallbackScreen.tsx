import type { ReactNode } from 'react'

interface FallbackScreenProps {
  title: string
  message: string
  // Botones de la pantalla (el primero es la salida principal).
  children?: ReactNode
}

// Pantalla completa para cuando algo salió mal y no hay una pantalla del sistema que mostrar: error de
// una pantalla, perfil que no cargó. No depende del router ni de la sesión, así que también sirve si lo
// que falló es justo eso. Reutiliza el marco del ingreso.
export function FallbackScreen({ title, message, children }: FallbackScreenProps) {
  return (
    <div className="login-page">
      <div className="login-card" role="alert">
        <h1 className="fallback-title">{title}</h1>
        <p className="fallback-message">{message}</p>
        {children && <div className="fallback-actions">{children}</div>}
      </div>
    </div>
  )
}
