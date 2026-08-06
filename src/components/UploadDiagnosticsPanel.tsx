import { useEffect, useState } from 'react'
import type { UploadDiagnosticsLog, UploadDiagnosticsSnapshot } from '../lib/uploadDiagnostics'

interface UploadDiagnosticsPanelProps {
  log: UploadDiagnosticsLog
}

// Panel de diagnóstico TEMPORAL, visible solo para informatica_r4/
// integrante_informatica (gateado por isAdmin en el caller, ver
// DocumentoFormPage.tsx) — muestra en pantalla lo que hoy solo se podría ver
// abriendo la consola del navegador del celular, algo que en la práctica
// nadie del equipo puede hacer en el dispositivo real del usuario reportando
// el problema. Pensado para borrarse una vez diagnosticada la causa real de
// que la carga falle en mobile/PWA (ver DEPLOYMENT.md).
//
// Se refresca con un intervalo corto en vez de recibir el snapshot ya armado
// por props porque createUploadDiagnosticsLog() no dispara re-render al
// loguear (evitar volver a renderizar todo el formulario en cada evento) —
// este panel es el único lugar que necesita "ver" los eventos nuevos.
export function UploadDiagnosticsPanel({ log }: UploadDiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [snapshot, setSnapshot] = useState<UploadDiagnosticsSnapshot | null>(null)

  useEffect(() => {
    if (!expanded) return
    let active = true
    const refresh = () => {
      log.snapshot().then((s) => {
        if (active) setSnapshot(s)
      })
    }
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [expanded, log])

  return (
    <div className="card" style={{ marginTop: 20, border: '1px dashed var(--color-warning)' }}>
      <button
        type="button"
        className="btn btn-outlined btn-block"
        onClick={() => setExpanded((prev) => !prev)}
        style={{ fontSize: 12 }}
      >
        {expanded ? 'Ocultar' : 'Ver'} diagnóstico técnico (solo informática)
      </button>
      {expanded && snapshot && (
        <div style={{ marginTop: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          <div style={{ marginBottom: 10 }}>
            <div className="kpi-label" style={{ marginBottom: 4 }}>
              Entorno
            </div>
            <div>Mobile (user-agent): {String(snapshot.environment.isMobileUA)}</div>
            <div>PWA instalada (standalone): {String(snapshot.environment.isStandalonePWA)}</div>
            <div>Online: {String(snapshot.environment.online)}</div>
            <div>Plataforma: {snapshot.environment.platform}</div>
            <div style={{ wordBreak: 'break-all' }}>User-Agent: {snapshot.environment.userAgent}</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div className="kpi-label" style={{ marginBottom: 4 }}>
              Service Worker
            </div>
            <div>Soportado: {String(snapshot.serviceWorker.supported)}</div>
            <div>Activo: {String(snapshot.serviceWorker.active)}</div>
            {snapshot.serviceWorker.scriptURL && <div style={{ wordBreak: 'break-all' }}>Script: {snapshot.serviceWorker.scriptURL}</div>}
          </div>

          <div>
            <div className="kpi-label" style={{ marginBottom: 4 }}>
              Eventos ({snapshot.entries.length})
            </div>
            {snapshot.entries.length === 0 && <div style={{ color: 'var(--color-text-muted)' }}>Todavía no hay eventos.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {snapshot.entries.map((entry, i) => (
                <div key={i} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>
                  <div>
                    <strong>{entry.event}</strong> — {entry.timestamp.slice(11, 23)}
                  </div>
                  {entry.detail && (
                    <pre style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--color-text-secondary)' }}>
                      {JSON.stringify(entry.detail, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
