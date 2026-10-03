import { useEffect, useState } from 'react'
import { Icon } from './ui/Icon'
import { deletePasskey, describePasskeyError, listPasskeys, registerPasskey } from '../lib/auth/loginHelpers'
import type { PasskeyItem } from '../lib/auth/loginHelpers'

// Alta y baja de passkeys del usuario (huella, rostro o PIN del
// dispositivo). Solo se muestra si están habilitadas (passkeysAvailable()).
export function PasskeysSection() {
  const [items, setItems] = useState<PasskeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    try {
      setItems(await listPasskeys())
    } catch {
      setError('No pudimos cargar tus dispositivos registrados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleRegister() {
    setError(null)
    setNotice(null)
    setBusy('register')
    try {
      await registerPasskey()
      setNotice('Listo: la próxima vez podés ingresar con la huella, el rostro o el PIN de este dispositivo.')
      await reload()
    } catch (err) {
      setError(describePasskeyError(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(item: PasskeyItem) {
    if (!window.confirm('¿Quitar este dispositivo? Ya no va a poder ingresar con passkey.')) return
    setError(null)
    setNotice(null)
    setBusy(item.id)
    try {
      await deletePasskey(item.id)
      setItems((prev) => prev.filter((p) => p.id !== item.id))
    } catch {
      setError('No pudimos quitar el dispositivo. Reintentá en unos segundos.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">Ingreso con huella o rostro</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <p className="field-help" style={{ marginBottom: 12 }}>
          Registrá este celular o computadora para entrar sin escribir la contraseña. La verificación la hace el
          dispositivo: SIGER4 nunca recibe tu huella ni tu rostro.
        </p>
        {loading ? (
          <div className="loading-state" role="status">Cargando…</div>
        ) : items.length > 0 ? (
          <ul className="attachment-list" style={{ marginBottom: 12 }}>
            {items.map((item) => (
              <li key={item.id} className="attachment-item">
                <span className="list-item-icon">
                  <Icon name="fingerprint" size={18} />
                </span>
                <span className="file-picker-name">
                  <strong>{item.friendly_name || 'Dispositivo registrado'}</strong>
                  <span>
                    Registrado el {new Date(item.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                    {item.last_used_at && ` · último uso ${new Date(item.last_used_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}`}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(item)} disabled={busy !== null}>
                  {busy === item.id ? 'Quitando…' : 'Quitar'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>Todavía no registraste ningún dispositivo.</p>
        )}
        {notice && (
          <div className="alert alert-success" role="status">{notice}</div>
        )}
        {error && (
          <div className="alert alert-danger" role="alert">{error}</div>
        )}
        <button type="button" className="btn btn-outlined btn-block" onClick={handleRegister} disabled={busy !== null}>
          <Icon name="fingerprint" size={16} />
          {busy === 'register' ? 'Esperando la verificación…' : 'Registrar este dispositivo'}
        </button>
      </div>
    </>
  )
}
