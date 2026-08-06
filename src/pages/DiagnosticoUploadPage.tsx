import { useRef, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../hooks/useAuth'

// SIGER4 - Página de diagnóstico TEMPORAL, mínima a propósito.
//
// Objetivo único: aislar si el problema de "el navegador no devuelve
// archivo al input" (ver DEPLOYMENT.md, diagnóstico de carga de documentos
// en mobile/PWA) es del formulario de Documentos en sí (wizard, estado de
// React, lo que sea) o del navegador/PWA — un <input type="file"> real,
// sin ningún wizard ni metadatos alrededor, es la prueba más simple posible.
// Si ACÁ tampoco dispara "change" en un dispositivo puntual, el problema es
// 100% del navegador/PWA de ese dispositivo, no de este código.
//
// Nunca crea nada en la base, nunca sube nada a Storage — solo muestra en
// pantalla lo que el input real devuelve (o no devuelve). Visible
// únicamente para informatica_r4/integrante_informatica (mismo criterio que
// el resto de las herramientas de diagnóstico/administración).
export function DiagnosticoUploadPage() {
  const { isAdmin } = useAuth()
  const [log, setLog] = useState<string[]>([])
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function appendLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString('es-AR')} — ${line}`])
  }

  if (!isAdmin) {
    return (
      <AppShell title="Diagnóstico">
        <div className="empty-state">No tenés permisos para ver esta pantalla.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Diagnóstico de carga">
      <h1 className="page-title">Diagnóstico de input de archivo</h1>
      <p className="page-subtitle">
        Pantalla mínima temporal, sin wizard ni metadatos — solo confirma si el navegador devuelve un
        archivo real al elegir uno. No crea ni sube nada.
      </p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <label htmlFor="diag-file" className="btn btn-primary btn-block">
          Elegir archivo
        </label>
        <input
          ref={inputRef}
          id="diag-file"
          type="file"
          className="sr-only-file-input"
          onClick={() => {
            appendLog('nativeFileInputClick')
            setAwaitingSince(Date.now())
          }}
          onChange={(e) => {
            const files = e.target.files
            const selected = files?.[0] ?? null
            setAwaitingSince(null)
            if (!selected) {
              appendLog(`nativeFileInputChange: files.length=${files?.length ?? 0}, sin archivo`)
            } else {
              appendLog(
                `nativeFileInputChange: files.length=${files?.length ?? 0} · name="${selected.name}" · ` +
                  `type="${selected.type || '(vacío)'}" · size=${selected.size} bytes · lastModified=${new Date(selected.lastModified).toISOString()}`,
              )
            }
            e.target.value = ''
          }}
        />
        {awaitingSince && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Esperando respuesta del selector…
          </p>
        )}
      </div>

      <div className="card-solid">
        <div className="kpi-label" style={{ marginBottom: 8 }}>
          Log ({log.length})
        </div>
        {log.length === 0 && <p className="empty-state">Todavía no hay eventos. Tocá "Elegir archivo" arriba.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {log.map((line, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : undefined, paddingTop: i > 0 ? 6 : 0 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
