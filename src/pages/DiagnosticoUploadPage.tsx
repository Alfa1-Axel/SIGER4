import { useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'

// SIGER4 - Página de diagnóstico TEMPORAL, ULTRA mínima a propósito.
//
// Resultado confirmado en el celular Android que falla: /raw-upload-test.html
// (HTML/JS vanilla, sin React) SÍ detecta click + change + archivo real. La
// versión anterior de esta página (React, con onClick/onChange declarativos
// que llamaban setState en cada evento) NO detectaba nada — log vacío. Eso
// aísla el bug a algo de React/el binding declarativo, no del navegador/SO/
// dispositivo/CSP/dominio (ver DEPLOYMENT.md).
//
// Sospecha concreta: en raw-upload-test.js, "loguear un evento" es una
// escritura de DOM directa y síncrona (textContent = ...), cero overhead de
// framework. Acá, el onClick del label/input original llamaba setEntries()
// -> el batching automático de React 18 dispara un re-render antes de que
// el navegador termine la cadena nativa "click en label -> click reenviado
// al input -> abrir selector" — en algunos WebView/Chrome de Android eso
// corta esa cadena antes de que el selector nativo llegue a abrirse.
//
// Esta versión copia el patrón de raw-upload-test.html lo más literal
// posible en React:
//   - Input file REAL y VISIBLE (no oculto con label custom, no click
//     programático) — si esto también fallara, el problema volvería a
//     estar abierto a input oculto/label, pero ya no hace falta probar eso
//     primero.
//   - onChange va directo en el input (como en raw), sin passthrough por
//     ningún wrapper.
//   - El log NO usa useState/setState: escribe directo al DOM vía useRef +
//     textContent, igual que raw, para sacar de la ecuación cualquier
//     re-render de React como posible interferencia.
//   - Sin AppShell, sin styles.css del sistema, sin form, sin
//     preventDefault, sin sessionStorage.
export function DiagnosticoUploadPage() {
  const { isAdmin, loading } = useAuth()
  const logRef = useRef<HTMLPreElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<string[]>([])

  function log(label: string, detail?: Record<string, unknown>) {
    var stamp = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0')
    var line = '[' + stamp + '] ' + label
    if (detail) {
      try {
        line += '\n' + JSON.stringify(detail, null, 2)
      } catch {
        line += '\n(no serializable)'
      }
    }
    entriesRef.current.push(line)
    if (logRef.current) logRef.current.textContent = entriesRef.current.join('\n\n')
  }

  useEffect(() => {
    log('page-load', { href: window.location.href, userAgent: navigator.userAgent })
  }, [])

  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  var isStandalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  if (loading) {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>Cargando…</div>
  }

  if (!isAdmin) {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>No tenés permisos para ver esta pantalla.</div>
  }

  return (
    <div style={{ padding: 16, fontFamily: '-apple-system, Roboto, Arial, sans-serif', background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Diagnóstico ultra mínimo (React, input real y visible)</h1>
      <p style={{ fontSize: 12, color: '#999', margin: '0 0 20px' }}>
        Comparar contra <code>/raw-upload-test.html</code> (sin React). No crea ni sube nada.
      </p>

      {!isMobile && (
        <div style={{ background: '#78350f', color: '#fde68a', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          ⚠️ Esta prueba debe hacerse en el celular que falla.
        </div>
      )}

      <div style={{ fontSize: 11, color: '#666', marginBottom: 16 }}>
        build: {__SIGER4_BUILD_VERSION__} · compilado: {new Date(__SIGER4_BUILD_TIME__).toLocaleString('es-AR')}
      </div>

      {/* Input real, visible, sin label custom ni click programático — igual
          que rawFile en raw-upload-test.html. onChange directo, sin
          passthrough. */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="file"
          onClick={() => log('click')}
          onChange={(e) => {
            var files = e.target.files
            var n = files ? files.length : 0
            if (!files || !n) {
              if (statusRef.current) statusRef.current.textContent = 'change disparó, pero sin archivos (files.length = 0)'
              log('change — SIN ARCHIVO', { filesLength: 0 })
              return
            }
            var f = files[0]
            var detail = {
              filesLength: n,
              name: f.name,
              type: f.type || '(vacío)',
              size: f.size,
              lastModified: f.lastModified,
              lastModifiedISO: new Date(f.lastModified).toISOString(),
            }
            if (statusRef.current) statusRef.current.textContent = 'change disparó correctamente — ver detalle abajo'
            log('change — ARCHIVO DETECTADO', detail)
            e.target.value = ''
          }}
        />
      </div>

      <div ref={statusRef} style={{ fontSize: 13, marginBottom: 16 }}>
        Esperando selección…
      </div>

      <div style={{ fontSize: 12, marginBottom: 16 }}>
        <div style={{ wordBreak: 'break-all' }}>
          <b>userAgent:</b>
          <br />
          {navigator.userAgent}
        </div>
        <div>
          <b>mobile (heurística):</b> <span style={{ color: isMobile ? '#4ade80' : '#f87171' }}>{String(isMobile)}</span>
        </div>
        <div>
          <b>standalone/PWA:</b> {String(isStandalone)}
        </div>
        <div>
          <b>timestamp de carga:</b> {new Date().toISOString()}
        </div>
      </div>

      <h2 style={{ fontSize: 14, margin: '20px 0 8px' }}>Log de eventos</h2>
      <button
        type="button"
        onClick={() => {
          entriesRef.current = []
          if (logRef.current) logRef.current.textContent = '(vacío)'
          if (statusRef.current) statusRef.current.textContent = 'Esperando selección…'
        }}
        style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: '#333', color: '#eee', border: 'none', cursor: 'pointer', marginBottom: 8 }}
      >
        Limpiar
      </button>
      <pre
        ref={logRef}
        style={{ background: '#000', color: '#0f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        (vacío)
      </pre>
    </div>
  )
}
