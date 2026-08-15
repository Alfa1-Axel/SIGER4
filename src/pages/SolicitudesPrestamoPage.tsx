import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchLoanRequests } from '../lib/api/inventoryLoanRequests'
import { fetchInventoryItems } from '../lib/api/inventory'
import { fetchStations } from '../lib/api/stations'
import { describeSupabaseError } from '../lib/api/errors'
import type { InventoryItem, InventoryLoanRequest, LoanRequestStatus, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'

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
  const { isAdmin, hasRole, profile, scopes } = useAuth()
  const isStationRoleOnly = !isAdmin && hasRole('jefe_cuerpo_activo') && !hasRole('secretario_regional', 'director_escuela')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''

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
        (!isStationRoleOnly || stationFilter || r.requesting_station_id === myStationId),
    )
  }, [requests, statusFilter, stationFilter, isStationRoleOnly, myStationId])

  function itemName(itemId: string): string {
    return items.find((i) => i.id === itemId)?.name ?? 'Elemento eliminado'
  }

  function stationName(stationId: string): string {
    return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel no disponible'
  }

  return (
    <AppShell title="Solicitudes de Préstamo">
      <h1 className="page-title">Solicitudes de Préstamo</h1>
      <p className="page-subtitle">Préstamos del Inventario Regional: pendientes, aprobadas, retiradas y devueltas.</p>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
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
        <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los cuarteles</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="empty-state">Cargando solicitudes…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No hay solicitudes que coincidan.</div>}

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
