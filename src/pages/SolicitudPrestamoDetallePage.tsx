import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ContactLink } from '../components/ui/ContactLink'
import {
  approveLoanRequest,
  cancelLoanRequest,
  fetchLoanRequestById,
  registerLoanDelivery,
  registerLoanReturn,
  rejectLoanRequest,
} from '../lib/api/inventoryLoanRequests'
import { fetchInventoryItemById } from '../lib/api/inventory'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { describeSupabaseError } from '../lib/api/errors'
import { LOAN_REQUEST_STATUS_BADGE, LOAN_REQUEST_STATUS_LABEL } from './SolicitudesPrestamoPage'
import type { InventoryItem, InventoryLoanRequest, Profile, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Reglas de quien puede aprobar/rechazar/gestionar (confirmadas
// explicitamente con el usuario): informatica_r4, secretario_regional,
// director_escuela SIEMPRE; el responsable puntual del elemento
// (inventory_items.responsible_profile_id) SOLO para su propio elemento.
// Mismo criterio que la RLS de update de inventory_loan_requests
// (migracion 0057) -- este gate del frontend es una mejora de UX (ocultar
// botones que igual serian rechazados por RLS), la autorizacion real la
// sigue haciendo la base.
export function SolicitudPrestamoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole, profile } = useAuth()

  const [request, setRequest] = useState<InventoryLoanRequest | null>(null)
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [deliveryCondition, setDeliveryCondition] = useState('')
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [returnCondition, setReturnCondition] = useState('')
  const [showReturnForm, setShowReturnForm] = useState(false)

  async function load() {
    if (!id) return
    const requestData = await fetchLoanRequestById(id)
    if (!requestData) {
      setLoading(false)
      return
    }
    const [itemData, stationsData, profilesData] = await Promise.all([
      fetchInventoryItemById(requestData.inventory_item_id),
      fetchStations(),
      fetchProfiles(),
    ])
    setRequest(requestData)
    setItem(itemData)
    setStations(stationsData)
    setProfiles(profilesData)
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    load().catch((err) => {
      if (!active) return
      setError(describeSupabaseError(err))
      setLoading(false)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const isManager =
    isAdmin ||
    hasRole('secretario_regional', 'director_escuela') ||
    (Boolean(profile?.id) && item?.responsible_profile_id === profile?.id)
  const isRequester = Boolean(profile?.id) && request?.requested_by_profile_id === profile?.id

  function stationName(stationId: string): string {
    return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel no disponible'
  }

  function profileName(profileId: string | null): string {
    if (!profileId) return '—'
    return profiles.find((p) => p.id === profileId)?.full_name ?? 'Usuario no disponible'
  }

  function findProfile(profileId: string | null): Profile | null {
    if (!profileId) return null
    return profiles.find((p) => p.id === profileId) ?? null
  }

  async function handleApprove() {
    if (!request || !profile) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await approveLoanRequest(request.id, profile.id)
      setRequest(updated)
    } catch (err) {
      setError(describeSupabaseError(err))
    } finally {
      setUpdating(false)
    }
  }

  async function handleReject() {
    if (!request || !profile) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await rejectLoanRequest(request.id, profile.id, rejectionReason || null)
      setRequest(updated)
      setShowRejectForm(false)
      setRejectionReason('')
    } catch (err) {
      setError(describeSupabaseError(err))
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelivery() {
    if (!request || !profile) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await registerLoanDelivery(request.id, profile.id, deliveryCondition || null)
      setRequest(updated)
      setShowDeliveryForm(false)
    } catch (err) {
      setError(describeSupabaseError(err))
    } finally {
      setUpdating(false)
    }
  }

  async function handleReturn() {
    if (!request || !profile) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await registerLoanReturn(request.id, profile.id, returnCondition || null)
      setRequest(updated)
      setShowReturnForm(false)
    } catch (err) {
      setError(describeSupabaseError(err))
    } finally {
      setUpdating(false)
    }
  }

  async function handleCancel() {
    if (!request) return
    if (!window.confirm('¿Cancelar esta solicitud? Queda en el historial marcada como cancelada.')) return
    setError(null)
    setUpdating(true)
    try {
      const updated = await cancelLoanRequest(request.id)
      setRequest(updated)
    } catch (err) {
      setError(describeSupabaseError(err))
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Solicitud de préstamo">
        <div className="empty-state">Cargando solicitud…</div>
      </AppShell>
    )
  }

  if (!request || !item) {
    return (
      <AppShell title="Solicitud de préstamo">
        {error ? (
          <div className="card">
            <p className="field-error" style={{ margin: 0 }}>
              {error}
            </p>
          </div>
        ) : (
          <div className="empty-state">No se encontró la solicitud solicitada.</div>
        )}
      </AppShell>
    )
  }

  const canCancel = (isManager || isRequester) && (request.status === 'pendiente' || request.status === 'aprobada')
  const requesterProfile = findProfile(request.requested_by_profile_id)
  const itemResponsibleProfile = findProfile(item.responsible_profile_id)

  return (
    <AppShell title="Solicitud de préstamo">
      <Link to="/inventario/solicitudes" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Solicitudes
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <h1 className="page-title" style={{ minWidth: 0 }}>
          {item.name}
        </h1>
        <span className={`badge ${LOAN_REQUEST_STATUS_BADGE[request.status]}`} style={{ flexShrink: 0 }}>
          {LOAN_REQUEST_STATUS_LABEL[request.status]}
        </span>
      </div>
      <p className="page-subtitle">
        Solicitado por {profileName(request.requested_by_profile_id)} · {stationName(request.requesting_station_id)}
      </p>
      {(requesterProfile || itemResponsibleProfile) && (
        <div className="contact-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          {requesterProfile && (
            <>
              <ContactLink kind="email" value={requesterProfile.email} />
              {requesterProfile.phone && <ContactLink kind="phone" value={requesterProfile.phone} />}
            </>
          )}
          {itemResponsibleProfile && itemResponsibleProfile.id !== requesterProfile?.id && (
            <ContactLink kind="email" value={itemResponsibleProfile.email} label={`Responsable: ${itemResponsibleProfile.email}`} />
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <div>
            <strong>Solicitado desde:</strong> {formatDateTime(request.requested_from)}
          </div>
          {request.expected_return_at && (
            <div>
              <strong>Devolución esperada:</strong> {formatDateTime(request.expected_return_at)}
            </div>
          )}
          {request.request_reason && (
            <div>
              <strong>Motivo:</strong> {request.request_reason}
            </div>
          )}
          {request.notes && (
            <div>
              <strong>Notas:</strong> {request.notes}
            </div>
          )}

          {request.approved_at && (
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Aprobada por {profileName(request.approved_by_profile_id)} el {formatDateTime(request.approved_at)}
            </div>
          )}
          {request.rejected_at && (
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Rechazada por {profileName(request.rejected_by_profile_id)} el {formatDateTime(request.rejected_at)}
              {request.rejection_reason && ` — Motivo: ${request.rejection_reason}`}
            </div>
          )}
          {request.delivered_at && (
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Retirada por {profileName(request.delivered_by_profile_id)} el {formatDateTime(request.delivered_at)}
              {request.delivery_condition && ` — Estado: ${request.delivery_condition}`}
            </div>
          )}
          {request.returned_at && (
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Devuelta a {profileName(request.returned_by_profile_id)} el {formatDateTime(request.returned_at)}
              {request.return_condition && ` — Estado: ${request.return_condition}`}
            </div>
          )}
        </div>
      </div>

      {isManager && request.status === 'pendiente' && !showRejectForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} disabled={updating} onClick={handleApprove}>
            Aprobar
          </button>
          <button
            type="button"
            className="btn btn-outlined"
            style={{ padding: '8px 16px', fontSize: 13 }}
            disabled={updating}
            onClick={() => setShowRejectForm(true)}
          >
            Rechazar
          </button>
        </div>
      )}

      {isManager && showRejectForm && (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="rejectionReason">Motivo del rechazo (opcional)</label>
            <textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={updating} onClick={handleReject}>
              Confirmar rechazo
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => setShowRejectForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isManager && request.status === 'aprobada' && !showDeliveryForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: 13 }}
            disabled={updating}
            onClick={() => setShowDeliveryForm(true)}
          >
            Registrar retiro
          </button>
        </div>
      )}

      {isManager && showDeliveryForm && (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="deliveryCondition">Estado de conservación al retirar (opcional)</label>
            <input id="deliveryCondition" value={deliveryCondition} onChange={(e) => setDeliveryCondition(e.target.value)} placeholder="Buen estado" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={updating} onClick={handleDelivery}>
              Confirmar retiro
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => setShowDeliveryForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isManager && request.status === 'retirada' && !showReturnForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: 13 }}
            disabled={updating}
            onClick={() => setShowReturnForm(true)}
          >
            Registrar devolución
          </button>
        </div>
      )}

      {isManager && showReturnForm && (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="returnCondition">Estado de conservación al devolver (opcional)</label>
            <input id="returnCondition" value={returnCondition} onChange={(e) => setReturnCondition(e.target.value)} placeholder="Buen estado" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={updating} onClick={handleReturn}>
              Confirmar devolución
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => setShowReturnForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {canCancel && !showRejectForm && !showDeliveryForm && !showReturnForm && (
        <button type="button" className="btn btn-outlined" style={{ padding: '8px 16px', fontSize: 13 }} disabled={updating} onClick={handleCancel}>
          Cancelar solicitud
        </button>
      )}
    </AppShell>
  )
}
