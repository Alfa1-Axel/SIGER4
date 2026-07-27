import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { createVehicle, fetchVehicleById, updateVehicle } from '../lib/api/vehicles'
import type { VehicleStatus } from '../types/database'

const STATUS_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'fuera_de_servicio', label: 'Fuera de servicio' },
]

export function VehiculoFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [internalCode, setInternalCode] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [status, setStatus] = useState<VehicleStatus>('operativo')
  const [plate, setPlate] = useState('')
  const [lastServiceAt, setLastServiceAt] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchVehicleById(id).then((vehicle) => {
      if (!active || !vehicle) return
      setResolvedStationId(vehicle.station_id)
      setInternalCode(vehicle.internal_code)
      setVehicleType(vehicle.vehicle_type)
      setStatus(vehicle.status)
      setPlate(vehicle.plate ?? '')
      setLastServiceAt(vehicle.last_service_at ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input = {
        station_id: resolvedStationId,
        internal_code: internalCode,
        vehicle_type: vehicleType,
        status,
        plate: plate || null,
        last_service_at: lastServiceAt || null,
      }
      if (isEditing && id) {
        await updateVehicle(id, input)
      } else {
        await createVehicle(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el vehículo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}>
      <h1 className="page-title">{isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h1>
      <p className="page-subtitle">Datos del móvil / vehículo del cuartel.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del vehículo…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="internalCode">Código interno</label>
            <input id="internalCode" required value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="M-12" />
          </div>

          <div className="field">
            <label htmlFor="vehicleType">Tipo de vehículo</label>
            <input id="vehicleType" required value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Autobomba" />
          </div>

          <div className="field">
            <label htmlFor="plate">Patente (opcional)</label>
            <input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="AB123CD" />
          </div>

          <div className="field">
            <label htmlFor="lastServiceAt">Último service (opcional)</label>
            <input id="lastServiceAt" type="date" value={lastServiceAt} onChange={(e) => setLastServiceAt(e.target.value)} />
          </div>

          <div className="field">
            <label>Estado</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`btn ${status === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
