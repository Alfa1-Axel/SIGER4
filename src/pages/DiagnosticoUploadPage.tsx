import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

// SIGER4 - Página de diagnóstico TEMPORAL, ULTRA mínima a propósito.
//
// Objetivo único: aislar si "el navegador no devuelve archivo al input" (ver
// DEPLOYMENT.md) es un problema de la app (AppShell, CSS global, wizard de
// Documentos, lo que sea de este código) o del navegador/dispositivo en sí.
// Reporte real: la versión anterior de esta pantalla (con AppShell +
// styles.css del sistema) YA fallaba igual que el formulario de Documentos
// — mismo síntoma exacto (nativeFileInputClick sí, nativeFileInputChange
// nunca). Esta versión saca TODO lo que no sea estrictamente necesario para
// la comparación sea limpia:
//   - Sin AppShell (nada de sidebar/header/footer).
//   - Sin styles.css del sistema — estilos inline mínimos, propios.
//   - Sin router anidado, sin AppShell, sin nada más que este componente.
//   - Sigue detrás de sesión real (useAuth + isAdmin) porque no hay forma
//     segura de exponer esto sin autenticación sin abrir una superficie de
//     ataque nueva — pero ya no depende de ProtectedRoute ni de AppShell
//     para funcionar, solo del contexto de auth que ya envuelve toda la app.
//
// Se compara directo contra /raw-upload-test.html (HTML/JS vanilla, cero
// React, servido estático — ver public/). Si ESA página funciona en un
// dispositivo pero esta no, el problema está en algo de React/la app. Si
// NINGUNA de las dos funciona, el problema es 100% del navegador/SO/
// dispositivo, no de este código.
// Misma heurística que raw-upload-test.js — no hay forma 100% confiable de
// detectar mobile por userAgent, pero alcanza para avisar "esto hay que
// probarlo en el celular que falla" si alguien la abre sin querer desde PC.
function detectMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export function DiagnosticoUploadPage() {
  const { isAdmin, loading } = useAuth()
  const [entries, setEntries] = useState<string[]>([])
  const [loadTimestamp] = useState(() => new Date().toISOString())
  const isMobile = detectMobile()

  function log(line: string) {
    var stamp = new Date().toTimeString().split(' ')[0]
    setEntries((prev) => prev.concat(stamp + ' — ' + line))
  }

  if (loading) {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>Cargando…</div>
  }

  if (!isAdmin) {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>No tenés permisos para ver esta pantalla.</div>
  }

  return (
    <div style={{ padding: 16, fontFamily: '-apple-system, Roboto, Arial, sans-serif', background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Diagnóstico ultra mínimo (React, sin AppShell)</h1>
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

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="diag-file"
          style={{ display: 'inline-block', fontSize: 15, padding: '12px 20px', borderRadius: 8, background: '#d32f2f', color: '#fff', cursor: 'pointer' }}
          onClick={() => log('label click (Elegir archivo)')}
        >
          Elegir archivo
        </label>
        <input
          id="diag-file"
          type="file"
          style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
          onClick={() => log('nativeFileInputClick')}
          onChange={(e) => {
            var files = e.target.files
            var selected = files && files[0] ? files[0] : null
            if (!selected) {
              log('nativeFileInputChange — SIN ARCHIVO (files.length=' + (files ? files.length : 0) + ')')
            } else {
              log(
                'nativeFileInputChange — ARCHIVO DETECTADO — name="' + selected.name + '" · type="' + (selected.type || '(vacío)') +
                  '" · size=' + selected.size + ' bytes · lastModified=' + new Date(selected.lastModified).toISOString(),
              )
            }
            e.target.value = ''
          }}
        />
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
          <b>standalone/PWA:</b>{' '}
          {String(
            (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
              (navigator as Navigator & { standalone?: boolean }).standalone === true,
          )}
        </div>
        <div>
          <b>timestamp de carga:</b> {loadTimestamp}
        </div>
      </div>

      <h2 style={{ fontSize: 14, margin: '20px 0 8px' }}>Log ({entries.length})</h2>
      <button
        type="button"
        onClick={() => setEntries([])}
        style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: '#333', color: '#eee', border: 'none', cursor: 'pointer', marginBottom: 8 }}
      >
        Limpiar
      </button>
      <pre style={{ background: '#000', color: '#0f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {entries.length === 0 ? '(vacío)' : entries.join('\n')}
      </pre>
    </div>
  )
}
