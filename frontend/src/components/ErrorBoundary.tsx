import { Component, type ErrorInfo, type ReactNode } from 'react'
import { FallbackScreen } from './ui/FallbackScreen'
import { isChunkLoadError, logClientError, reloadOnceForNewVersion } from '../lib/clientErrors'

interface ErrorBoundaryProps {
  children: ReactNode
  // Cuando cambia (por ejemplo, la ruta), el error se limpia: ir a otra pantalla vuelve a intentar.
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

// Atrapa los errores de dibujo de lo que tiene adentro para que una pantalla rota no deje toda la app en
// blanco. Con un archivo de pantalla que no se pudo descargar (versión nueva del sistema) recarga una vez;
// con cualquier otro error muestra un mensaje con salida. No manda nada afuera: deja una línea en consola.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError('error de pantalla', error)
    // La pila de componentes ayuda a ubicar el problema y no lleva datos de personas.
    if (info.componentStack) console.error(`[SIGER4] componentes: ${info.componentStack.split('\n').slice(0, 6).join(' ').trim()}`)
    if (isChunkLoadError(error)) reloadOnceForNewVersion()
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (isChunkLoadError(error)) {
      return (
        <FallbackScreen title="Hay una versión nueva del sistema" message="Para abrir esta pantalla hace falta actualizar. Recargá la página y vas a seguir donde estabas.">
          <button type="button" className="btn btn-primary btn-block" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </FallbackScreen>
      )
    }

    return (
      <FallbackScreen title="Algo falló al cargar esta pantalla" message="Reintentá o volvé al inicio. Si sigue pasando, avisale a Informática y Estadística.">
        <button type="button" className="btn btn-primary btn-block" onClick={() => this.setState({ error: null })}>
          Reintentar
        </button>
        <a className="btn btn-outlined btn-block" href="/panel">
          Ir al inicio
        </a>
      </FallbackScreen>
    )
  }
}
