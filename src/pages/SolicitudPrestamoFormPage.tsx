import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { fetchInventoryItemById } from '../lib/api/inventory'
import { createLoanRequest, fetchLoanRequestsByItem, findActiveLoan } from '../lib/api/inventoryLoanRequests'
import { fetchStations } from '../lib/api/stations'
import { describeSupabaseError } from '../lib/api/errors'
import { INVENTORY_CATEGORY_LABEL } from './InventarioPage'
import type { InventoryItem, InventoryLoanRequest, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'

function todayInputValue(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Solicitud de préstamo de un elemento del Inventario Regional.
// - Roles de cuartel: solicitan para su propio cuartel (si tienen más de
//   uno, eligen cuál).
// - Informática y Secretario Regional: solicitan en nombre de un cuartel
//   (la policy de 0057 lo permite; antes la pantalla los bloqueaba porque
//   no tienen cuartel propio).
// La base vuelve a validar todo (RLS + trigger de 0099: estado del
// elemento, préstamo activo y solicitud pendiente repetida).
export function SolicitudPrestamoFormPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const access = useLoanRequestAccess()

  const [item, setItem] = useState<InventoryItem | null>(null)
  const [requests, setRequests] = useState<InventoryLoanRequest[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [stationId, setStationId] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [expectedReturnAt, setExpectedReturnAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!itemId) return
    let active = true
    Promise.all([fetchInventoryItemById(itemId), fetchLoanRequestsByItem(itemId), fetchStations()])
      .then(([itemData, requestsData, stationsData]) => {
        if (!active) return
        setItem(itemData)
        setRequests(requestsData)
        setStations(stationsData)
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar el elemento. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [itemId])

  const stationOptions = useMemo(() => access.requestableStations(stations), [access, stations])

  // Si hay un solo cuartel posible, queda elegido.
  useEffect(() => {
    if (!stationId && stationOptions.length === 1) setStationId(stationOptions[0].id)
  }, [stationId, stationOptions])

  const activeLoan = findActiveLoan(requests)
  const pendingForStation = stationId ? requests.find((r) => r.status === 'pendiente' && r.requesting_station_id === stationId) : undefined
  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? 'otro cuartel'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!item || !profile) return
    if (!stationId) return setError('Elegí para qué cuartel es el préstamo.')
    if (expectedReturnAt && expectedReturnAt < todayInputValue()) {
      return setError('La fecha de devolución no puede ser anterior a hoy.')
    }

    setSubmitting(true)
    try {
      const created = await createLoanRequest({
        inventory_item_id: item.id,
        requesting_station_id: stationId,
        requested_by_profile_id: profile.id,
        request_reason: requestReason.trim() || null,
        expected_return_at: expectedReturnAt ? new Date(`${expectedReturnAt}T12:00:00`).toISOString() : null,
        notes: notes.trim() || null,
      })
      navigate(`/inventario/solicitudes/${created.id}`, {
        state: { notice: 'Solicitud enviada. El responsable del elemento la va a revisar y te avisamos por notificación cuando la apruebe o rechace.' },
      })
    } catch (err) {
      setError(
        describeSupabaseError(err, 'No pudimos enviar la solicitud. Reintentá en unos segundos.').replace(
          'No tenés permiso para realizar esta acción con tu rol actual.',
          'No tenés permiso para solicitar para ese cuartel.',
        ),
      )
      setSubmitting(false)
    }
  }

  const backLink = item && (
    <Link to={`/inventario/${item.id}`} className="back-link">
      ← Volver al elemento
    </Link>
  )

  if (!access.canRequest) {
    return (
      <AppShell title="Solicitar préstamo">
        <AccessDenied
          title="No podés solicitar elementos"
          message="Solicitan préstamos el Jefe de Cuerpo Activo, el Presidente de CD y los usuarios de carga de cada cuartel, el Secretario Regional e Informática. Si lo necesitás, pedíselo a alguno de ellos."
          backTo={itemId ? `/inventario/${itemId}` : '/inventario'}
          backLabel="Volver al elemento"
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell title="Solicitar préstamo">
        <div className="loading-state" role="status">Cargando…</div>
      </AppShell>
    )
  }

  if (loadError || !item) {
    return (
      <AppShell title="Solicitar préstamo">
        {loadError ? (
          <div className="alert alert-danger" role="alert">{loadError}</div>
        ) : (
          <AccessDenied title="No encontramos el elemento" message="Puede que lo hayan dado de baja del inventario." backTo="/inventario" backLabel="Volver a Inventario" />
        )}
      </AppShell>
    )
  }

  let blocker: string | null = null
  if (item.status === 'baja') blocker = 'Este elemento está dado de baja: ya no se puede solicitar.'
  else if (item.status === 'mantenimiento') blocker = 'Este elemento está en mantenimiento. Cuando vuelva a estar disponible se va a poder solicitar.'
  else if (item.status === 'no_disponible') blocker = 'Este elemento no está disponible para préstamo en este momento.'
  else if (activeLoan) {
    blocker =
      activeLoan.status === 'retirada'
        ? `Este elemento está prestado a ${stationName(activeLoan.requesting_station_id)}${activeLoan.expected_return_at ? ` (devolución estimada: ${new Date(activeLoan.expected_return_at).toLocaleDateString('es-AR')})` : ''}. Se puede pedir cuando lo devuelvan.`
        : `Este elemento está reservado para ${stationName(activeLoan.requesting_station_id)}. Se puede pedir cuando lo devuelvan o se cancele la reserva.`
  } else if (stationOptions.length === 0) {
    blocker = 'Tu cuenta no tiene un cuartel asignado. Consultá a Informática y Estadística para que te lo asignen y puedas solicitar préstamos.'
  }

  return (
    <AppShell title="Solicitar préstamo">
      {backLink}
      <h1 className="page-title">Solicitar préstamo</h1>
      <p className="page-subtitle">
        {item.name} · {item.category === 'otros' ? item.category_other_label : INVENTORY_CATEGORY_LABEL[item.category]}
      </p>

      {blocker ? (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>{blocker}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid" noValidate>
          <div className="field">
            <label htmlFor="station">Cuartel que lo solicita</label>
            <select
              id="station"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              disabled={submitting || stationOptions.length === 1}
              aria-describedby="station-help"
            >
              {stationOptions.length !== 1 && <option value="">Elegí un cuartel</option>}
              {stationOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p id="station-help" className="field-help">
              {access.actsOnBehalf ? 'Solicitás en nombre de ese cuartel.' : 'El préstamo queda a nombre de tu cuartel.'}
            </p>
          </div>

          {pendingForStation && (
            <div className="alert alert-warning" role="status">
              <span className="alert-content">
                Ese cuartel ya tiene una solicitud pendiente de este elemento.{' '}
                <Link to={`/inventario/solicitudes/${pendingForStation.id}`}>Ver la solicitud</Link>
              </span>
            </div>
          )}

          <div className="field">
            <label htmlFor="requestReason">
              Para qué lo necesitan<span className="field-label-optional"> (opcional)</span>
            </label>
            <textarea id="requestReason" value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3} placeholder="Ej.: práctica de rescate el sábado 18" disabled={submitting} />
          </div>

          <div className="field">
            <label htmlFor="expectedReturnAt">
              Devolución estimada<span className="field-label-optional"> (opcional)</span>
            </label>
            <input id="expectedReturnAt" type="date" min={todayInputValue()} value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} disabled={submitting} />
          </div>

          <div className="field">
            <label htmlFor="notes">
              Notas<span className="field-label-optional"> (opcional)</span>
            </label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={submitting} />
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || Boolean(pendingForStation)}>
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
