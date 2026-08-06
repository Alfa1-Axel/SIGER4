import { useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'

// SIGER4 - Página de diagnóstico TEMPORAL, ULTRA mínima a propósito.
//
// Resultado ronda anterior: /raw-upload-test.html (sin React) detecta click +
// change + archivo real en el celular Android que falla. La versión anterior
// de esta página (React, onClick/onChange declarativos, sin setState
// síncrono en el click — ya corregido ese problema) tampoco funcionó: el log
// solo mostraba "page-load", ni siquiera "click". Eso mueve la sospecha de
// "el setState interfiere con el picker" a algo más temprano: el toque ni
// siquiera está llegando al input, o los synthetic events de React no están
// enganchando en esta pantalla en particular (ver DEPLOYMENT.md).
//
// Esta versión agrega listeners NATIVOS (addEventListener, no depende de
// React) sobre el mismo input real, en paralelo a los handlers declarativos
// de React — así se puede ver, evento por evento, si el DOM recibe el toque
// (nativo) aunque React no lo reporte (synthetic), o si ninguno de los dos
// lo recibe (entonces el problema es de layout/overlay/CSS, no de React).
//
//   - pointerdown/touchstart/mousedown/click/change nativos, vía
//     addEventListener en un useEffect — logueados con event.type,
//     target.tagName, isTrusted.
//   - Los mismos eventos también como props de React (onPointerDown,
//     onClick, onChange) — logueados por separado, con el prefijo "React:".
//   - El log sigue sin usar useState: useRef + escritura directa a
//     textContent, para que ni siquiera un re-render por click pueda
//     interferir con la cadena nativa del picker (causa confirmada en la
//     ronda anterior).
//   - Debug visual del propio input: boundingClientRect, computed
//     pointer-events/display/visibility/opacity, disabled, tabIndex, y qué
//     elemento devuelve document.elementFromPoint() en el centro del input
//     — si no es el input mismo, hay algo tapándolo.
export function DiagnosticoUploadPage() {
  const { isAdmin, loading } = useAuth()
  const logRef = useRef<HTMLPreElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const debugRef = useRef<HTMLPreElement>(null)
  const entriesRef = useRef<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

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

  function logNativeEvent(e: Event) {
    var target = e.target as HTMLElement | null
    log('NATIVE:' + e.type, {
      targetTagName: target ? target.tagName : null,
      isTrusted: 'isTrusted' in e ? e.isTrusted : undefined,
    })
  }

  function renderDebugInfo() {
    var el = inputRef.current
    if (!el || !debugRef.current) return
    var rect = el.getBoundingClientRect()
    var cs = window.getComputedStyle(el)
    var centerX = rect.left + rect.width / 2
    var centerY = rect.top + rect.height / 2
    var elAtPoint = document.elementFromPoint(centerX, centerY)
    var info = {
      boundingClientRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      computedPointerEvents: cs.pointerEvents,
      computedDisplay: cs.display,
      computedVisibility: cs.visibility,
      computedOpacity: cs.opacity,
      disabled: el.disabled,
      tabIndex: el.tabIndex,
      elementFromPointAtCenter: elAtPoint ? elAtPoint.tagName + (elAtPoint.id ? '#' + elAtPoint.id : '') : null,
      elementFromPointIsInput: elAtPoint === el,
    }
    debugRef.current.textContent = JSON.stringify(info, null, 2)
  }

  useEffect(() => {
    log('page-load', { href: window.location.href, userAgent: navigator.userAgent })

    const el = inputRef.current
    if (!el) return

    var onPointerDown = (e: Event) => logNativeEvent(e)
    var onTouchStart = (e: Event) => logNativeEvent(e)
    var onMouseDown = (e: Event) => logNativeEvent(e)
    var onClick = (e: Event) => logNativeEvent(e)
    var onChange = (e: Event) => {
      logNativeEvent(e)
      var files = (e.target as HTMLInputElement).files
      var n = files ? files.length : 0
      if (!files || !n) {
        log('NATIVE:change — SIN ARCHIVO', { filesLength: 0 })
        return
      }
      var f = files[0]
      log('NATIVE:change — ARCHIVO DETECTADO', {
        filesLength: n,
        name: f.name,
        type: f.type || '(vacío)',
        size: f.size,
      })
    }

    // passive: false en pointerdown/touchstart no hace falta (no se llama
    // preventDefault en ninguno) — se dejan pasivos a propósito para no
    // interferir de ningún modo con el comportamiento nativo del navegador.
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('mousedown', onMouseDown, { passive: true })
    el.addEventListener('click', onClick)
    el.addEventListener('change', onChange)

    renderDebugInfo()
    var debugInterval = window.setInterval(renderDebugInfo, 1000)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('click', onClick)
      el.removeEventListener('change', onChange)
      window.clearInterval(debugInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Diagnóstico — React synthetic vs. native listeners</h1>
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

      {/* Input real, visible, sin label custom, sin wrappers, sin overlay,
          sin CSS del sistema, pointer-events/z-index explícitos, no
          disabled. onClick/onChange/onPointerDown de React CONVIVEN acá con
          los listeners nativos agregados por useEffect más arriba — mismo
          nodo DOM, dos formas distintas de escuchar el mismo evento. */}
      <div style={{ marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="file"
          style={{ position: 'static', width: 'auto', height: 'auto', opacity: 1, pointerEvents: 'auto', zIndex: 1, display: 'block' }}
          onPointerDown={() => log('REACT:onPointerDown')}
          onClick={() => log('REACT:onClick')}
          onChange={(e) => {
            var files = e.target.files
            var n = files ? files.length : 0
            if (!files || !n) {
              if (statusRef.current) statusRef.current.textContent = 'REACT change disparó, pero sin archivos (files.length = 0)'
              log('REACT:onChange — SIN ARCHIVO', { filesLength: 0 })
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
            if (statusRef.current) statusRef.current.textContent = 'REACT change disparó correctamente — ver detalle abajo'
            log('REACT:onChange — ARCHIVO DETECTADO', detail)
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

      <h2 style={{ fontSize: 14, margin: '20px 0 8px' }}>Debug visual del input (se actualiza cada 1s)</h2>
      <pre
        ref={debugRef}
        style={{ background: '#000', color: '#38bdf8', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        (cargando…)
      </pre>

      <h2 style={{ fontSize: 14, margin: '20px 0 8px' }}>Log de eventos (NATIVE: = addEventListener directo · REACT: = prop synthetic)</h2>
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
