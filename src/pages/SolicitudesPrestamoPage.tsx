import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchLoanRequests } from '../lib/api/inventoryLoanRequests'
import { fetchInventoryItems } from '../lib/api/inventory'
import { fetchStations } from '../lib/api/stations'
import { describeSupabaseError } from '../lib/api/errors'
import type { InventoryItem, InventoryLoanRequest, LoanRequestStatus, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'

export const LOAN_REQUEST_STATUS_LABEL: Record<LoanRequestStatus, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
  devuelta: 'Devuelta',
  cancelada: 'Cancelada',
}

export const LOAN_REQUEST_STATUS_BADGE: Record<LoanRequestStatus, string> = {
  pendiente: 'badge-warning',
  aprobada: 'badge-info',
  rechazada: 'badge-danger',
  retirada: 'badge-info',
  devuelta: 'badge-success',
  cancelada: 'badge-danger',
}

const STATUS_FILTERS: LoanRequestStatus[] = ['pendiente', 'aprobada', 'retirada', 'devuelta', 'rechazada', 'cancelada']

// jefe_cuerpo_activo del propio cuartel ve las solicitudes de SU cuartel
// (pedido explicito) — el resto de los roles con acceso a este listado ya
// tiene visibilidad regional/administrativa, asi que ven todo. La lectura en
// si no esta restringida por RLS (select_authenticated, ver migracion
// 0057), este filtro es solo para que la pantalla no muestre de entrada
// solicitudes de otros cuarteles a un rol de cuartel — puede sacarlo con el
// filtro de cuartel si igual quiere ver otro.
export function SolicitudesPrestamoPage() {
  const { isAdmin, hasRole, profile } = useAuth()
  const { ownStationIds } = useLoanRequestAccess()
  // Quien gestiona préstamos (Informática, Regional, Escuela) ve todas por
  // defecto; el resto arranca viendo las suyas y las de su cuartel.
  const isManagerRole = isAdmin || hasRole('secretario_regional', 'director_escuela')
  const [onlyMine, setOnlyMine] = useState(!isManagerRole)

  const [requests, setRequests] = useState<InventoryLoanRequest[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [stationFilter, setStationFilter] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([fetchLoanRequests(), fetchInventoryItems(), fetchStations()])
      .then(([requestsData, itemsData, stationsData]) => {
        if (!active) return
        setRequests(requestsData)
        setItems(itemsData)
        setStations(stationsData)
        setLoading(false)
      })
      .catch((err) => active && setError(describeSupabaseError(err)))
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    return requests.filter(
      (r) =>
        (!statusFilter || r.status === statusFilter) &&
        (!stationFilter || r.requesting_station_id === stationFilter) &&
        (!onlyMine || r.requested_by_profile_id === profile?.id || ownStationIds.includes(r.requesting_station_id)),
    )
  }, [requests, statusFilter, stationFilter, onlyMine, profile?.id, ownStationIds])

  function itemName(itemId: string): string {
    return items.find((i) => i.id === itemId)?.name ?? 'Elemento eliminado'
  }

  function stationName(stationId: string): string {
    return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel no disponible'
  }

  return (
    <AppShell title="Solicitudes de préstamo">
      <Link to="/inventario" className="back-link">
        ← Volver a Inventario
      </Link>
      <h1 className="page-title">Solicitudes de préstamo</h1>
      <p className="page-subtitle">Pendientes, aprobadas, prestadas y devueltas. Tocá una para ver su estado o gestionarla.</p>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los estados</option>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {LOAN_REQUEST_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <button type="button" className="chip" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
          Mis solicitudes
        </button>
        <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los cuarteles</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="loading-state" role="status">Cargando solicitudes…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state empty-state-action">
          <span>{onlyMine ? 'No tenés solicitudes con estos filtros.' : 'No hay solicitudes con estos filtros.'}</span>
          <Link to="/inventario" className="btn btn-outlined">
            Ver elementos para pedir
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((request) => (
          <Link
            key={request.id}
            to={`/inventario/solicitudes/${request.id}`}
            className="card-solid list-item"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="list-item-body">
              <h3 className="list-item-title">{itemName(request.inventory_item_id)}</h3>
              <p className="list-item-subtitle">
                {stationName(request.requesting_station_id)} · {new Date(request.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
              </p>
            </div>
            <span className={`badge ${LOAN_REQUEST_STATUS_BADGE[request.status]}`}>{LOAN_REQUEST_STATUS_LABEL[request.status]}</span>
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
