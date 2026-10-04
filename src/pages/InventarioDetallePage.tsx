import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ContactLink } from '../components/ui/ContactLink'
import { fetchInventoryItemById, fetchInventoryItemHistory } from '../lib/api/inventory'
import { fetchLoanRequestsByItem, findActiveLoan } from '../lib/api/inventoryLoanRequests'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { describeSupabaseError } from '../lib/api/errors'
import { INVENTORY_CATEGORY_LABEL, INVENTORY_STATUS_LABEL } from './InventarioPage'
import { LOAN_REQUEST_STATUS_BADGE, LOAN_REQUEST_STATUS_LABEL } from './SolicitudesPrestamoPage'
import type { InventoryItem, InventoryItemHistory, InventoryLoanRequest, Profile, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'
import { AccessDenied } from '../components/ui/AccessDenied'

const INVENTORY_STATUS_BADGE: Record<string, string> = {
  disponible: 'badge-success',
  no_disponible: 'badge-warning',
  mantenimiento: 'badge-warning',
  baja: 'badge-danger',
}

export function InventarioDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('director_escuela', 'secretario_regional')
  const { canRequest, ownStationIds } = useLoanRequestAccess()

  const [item, setItem] = useState<InventoryItem | null>(null)
  const [history, setHistory] = useState<InventoryItemHistory[]>([])
  const [requests, setRequests] = useState<InventoryLoanRequest[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchInventoryItemById(id), fetchInventoryItemHistory(id), fetchLoanRequestsByItem(id), fetchStations(), fetchProfiles()])
      .then(([itemData, historyData, requestsData, stationsData, profilesData]) => {
        if (!active) return
        setItem(itemData)
        setHistory(historyData)
        setRequests(requestsData)
        setStations(stationsData)
        setProfiles(profilesData)
      })
      // Sin el finally, si alguna consulta fallaba la pantalla quedaba en
      // "Cargando elemento…" para siempre y nunca aparecía "Solicitar".
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar el elemento. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  function stationName(stationId: string | null): string {
    if (!stationId) return '—'
    return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel no disponible'
  }

  function profileName(profileId: string | null): string {
    if (!profileId) return '—'
    return profiles.find((p) => p.id === profileId)?.full_name ?? 'Usuario no disponible'
  }

  if (loading) {
    return (
      <AppShell title="Elemento">
        <div className="loading-state" role="status">Cargando elemento…</div>
      </AppShell>
    )
  }

  if (!item) {
    return (
      <AppShell title="Elemento">
        {error ? (
          <div className="alert alert-danger" role="alert">{error}</div>
        ) : (
          <AccessDenied title="No encontramos el elemento" message="Puede que lo hayan eliminado del inventario." backTo="/inventario" backLabel="Volver a Inventario" />
        )}
      </AppShell>
    )
  }

  const activeLoan = findActiveLoan(requests)
  const myPending = requests.find((r) => r.status === 'pendiente' && ownStationIds.includes(r.requesting_station_id))
  const isAvailable = item.status === 'disponible' && !activeLoan
  let availability: string
  if (item.status === 'baja') availability = 'Dado de baja: ya no se puede solicitar.'
  else if (item.status === 'mantenimiento') availability = 'En mantenimiento: se va a poder solicitar cuando vuelva a estar disponible.'
  else if (item.status === 'no_disponible') availability = 'No disponible para préstamo en este momento.'
  else if (activeLoan?.status === 'retirada')
    availability = `Prestado a ${stationName(activeLoan.requesting_station_id)}${activeLoan.expected_return_at ? ` hasta el ${new Date(activeLoan.expected_return_at).toLocaleDateString('es-AR')} (estimado)` : ''}. Se puede pedir cuando lo devuelvan.`
  else if (activeLoan) availability = `Reservado para ${stationName(activeLoan.requesting_station_id)}. Se puede pedir cuando lo devuelvan o se cancele la reserva.`
  else availability = 'Disponible para pedir prestado.'

  return (
    <AppShell title="Inventario Regional">
      <Link to="/inventario" className="back-link">
        ← Volver a Inventario
      </Link>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <h1 className="page-title" style={{ minWidth: 0 }}>
          {item.name}
        </h1>
        {item.status === 'disponible' && activeLoan ? (
          <span className="badge badge-warning" style={{ flexShrink: 0 }}>
            {activeLoan.status === 'retirada' ? 'Prestado' : 'Reservado'}
          </span>
        ) : (
          <span className={`badge ${INVENTORY_STATUS_BADGE[item.status]}`} style={{ flexShrink: 0 }}>
            {INVENTORY_STATUS_LABEL[item.status]}
          </span>
        )}
      </div>
      <p className="page-subtitle">
        {item.category === 'otros' ? item.category_other_label : INVENTORY_CATEGORY_LABEL[item.category]}
      </p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {item.description && <div>{item.description}</div>}
          <div>
            <strong>Ubicación:</strong> {stationName(item.station_id)}
          </div>
          {(item.responsible_name || item.responsible_profile_id) && (
            <div>
              <strong>Responsable:</strong> {item.responsible_name ?? profileName(item.responsible_profile_id)}
            </div>
          )}
          {item.contact_info && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Contacto:</strong> <ContactLink kind="auto" value={item.contact_info} />
            </div>
          )}
          {item.observations && <div style={{ color: 'var(--color-text-secondary)' }}>{item.observations}</div>}
        </div>
      </div>

      <div className={`card availability-card${isAvailable ? ' availability-card--ok' : ''}`} role="status" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 14 }}>{availability}</p>
        {myPending && (
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            Tu cuartel ya lo pidió: <Link to={`/inventario/solicitudes/${myPending.id}`}>ver la solicitud pendiente</Link>.
          </p>
        )}
        {isAvailable && !canRequest && (
          <p className="field-help" style={{ margin: '6px 0 0' }}>
            Lo solicitan el Jefe de Cuerpo Activo, el Presidente y los usuarios de carga de cada cuartel, el Secretario
            Regional e Informática.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {isAvailable && canRequest && !myPending && (
          <Link to={`/inventario/${item.id}/solicitudes/nueva`} className="btn btn-primary">
            Solicitar préstamo
          </Link>
        )}
        {canEdit && (
          <Link to={`/inventario/${item.id}/editar`} className="btn btn-outlined btn-sm">
            <Icon name="edit" size={14} />
            Editar
          </Link>
        )}
      </div>

      {requests.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Solicitudes de préstamo</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {requests.map((request) => (
              <Link
                key={request.id}
                to={`/inventario/solicitudes/${request.id}`}
                className="card-solid"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ fontSize: 12 }}>
                  <div>{stationName(request.requesting_station_id)}</div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(request.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                  </div>
                </div>
                <span className={`badge ${LOAN_REQUEST_STATUS_BADGE[request.status]}`}>{LOAN_REQUEST_STATUS_LABEL[request.status]}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Historial</h2>
          </div>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((entry) => (
                <div key={entry.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 8, fontSize: 12 }}>
                  {new Date(entry.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                  {entry.previous_status !== entry.new_status && entry.new_status && (
                    <div>
                      Estado: {INVENTORY_STATUS_LABEL[entry.previous_status ?? 'disponible']} → {INVENTORY_STATUS_LABEL[entry.new_status]}
                    </div>
                  )}
                  {entry.previous_responsible_name !== entry.new_responsible_name && (
                    <div>
                      Responsable: {entry.previous_responsible_name ?? '—'} → {entry.new_responsible_name ?? '—'}
                    </div>
                  )}
                  {entry.previous_station_id !== entry.new_station_id && (
                    <div>
                      Cuartel: {stationName(entry.previous_station_id)} → {stationName(entry.new_station_id)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}
