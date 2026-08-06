import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchInventoryItemById } from '../lib/api/inventory'
import { createLoanRequest } from '../lib/api/inventoryLoanRequests'
import { INVENTORY_CATEGORY_LABEL } from './InventarioPage'
import type { InventoryItem } from '../types/database'
import { useAuth } from '../hooks/useAuth'

// requesting_station_id se completa solo desde el cuartel del propio
// usuario (profile.station_id o un user_scopes de tipo 'station', mismo
// criterio que my_station_ids() en la base) -- nunca es un <select> editable:
// un cuartel solo puede solicitar para si mismo (ver RLS de
// inventory_loan_requests, migracion 0057).
export function SolicitudPrestamoFormPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasRole, profile, scopes } = useAuth()
  const canRequest = isAdmin || hasRole('secretario_regional', 'jefe_cuerpo_activo', 'presidente_cuartel', 'usuario_carga_cuartel')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''

  const [item, setItem] = useState<InventoryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [requestReason, setRequestReason] = useState('')
  const [expectedReturnAt, setExpectedReturnAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!itemId) return
    let active = true
    fetchInventoryItemById(itemId).then((data) => {
      if (!active) return
      setItem(data)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [itemId])

  if (!canRequest) {
    return (
      <AppShell title="Inventario Regional">
        <div className="empty-state">No tenés permisos para solicitar elementos del inventario.</div>
      </AppShell>
    )
  }

  if (!myStationId) {
    return (
      <AppShell title="Inventario Regional">
        <div className="empty-state">Tu perfil no tiene un cuartel asignado — no se puede solicitar sin un cuartel de destino.</div>
      </AppShell>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!item || !profile) return
    if (item.status !== 'disponible') {
      setError('Este elemento ya no está disponible para solicitar.')
      return
    }

    setSubmitting(true)
    try {
      const created = await createLoanRequest({
        inventory_item_id: item.id,
        requesting_station_id: myStationId,
        requested_by_profile_id: profile.id,
        request_reason: requestReason || null,
        expected_return_at: expectedReturnAt ? new Date(expectedReturnAt).toISOString() : null,
        notes: notes || null,
      })
      navigate(`/inventario/solicitudes/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos registrar la solicitud.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Solicitar préstamo">
      {item && (
        <Link to={`/inventario/${item.id}`} className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
          ← Volver al elemento
        </Link>
      )}
      <h1 className="page-title">Solicitar préstamo</h1>
      <p className="page-subtitle">{item ? item.name : 'Inventario Regional'}</p>

      {loading ? (
        <div className="empty-state">Cargando…</div>
      ) : !item ? (
        <div className="empty-state">No se encontró el elemento solicitado.</div>
      ) : item.status !== 'disponible' ? (
        <div className="card">
          <p className="field-error" style={{ margin: 0 }}>
            Este elemento no está disponible para solicitar en este momento.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          <div className="field">
            <label>Elemento</label>
            <p style={{ margin: 0, fontSize: 13 }}>
              {item.name} · {item.category === 'otros' ? item.category_other_label : INVENTORY_CATEGORY_LABEL[item.category]}
            </p>
          </div>

          <div className="field">
            <label htmlFor="requestReason">Motivo de la solicitud (opcional)</label>
            <textarea id="requestReason" value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label htmlFor="expectedReturnAt">Fecha de devolución estimada (opcional)</label>
            <input id="expectedReturnAt" type="date" value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="notes">Notas adicionales (opcional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
