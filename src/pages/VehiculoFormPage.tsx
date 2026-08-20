import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { createVehicle, fetchVehicleById, updateVehicle } from '../lib/api/vehicles'
import { fetchStationById } from '../lib/api/stations'
import type { VehicleStatus } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

// Solo los 3 estados operativos son editables libremente desde este
// formulario. Vendido/transferido/baja requieren un motivo obligatorio y se
// hacen desde el detalle del cuartel (changeVehicleStatus) — un trigger en
// la base bloquea llegar a esos 3 estados por UPDATE directo, así que ni
// aunque se agregaran acá funcionarían.
const STATUS_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'fuera_de_servicio', label: 'Fuera de servicio' },
]

// vehicles.vehicle_type sigue siendo texto libre en la base (sin enum, sin
// constraint) -- este combo es puramente una capa de UI para guiar la carga
// hacia valores institucionales consistentes, sin romper compatibilidad con
// lo que ya hay cargado. "OTROS_SENTINEL" nunca se guarda como tal: al
// elegir "Otros" el valor real que se persiste es el texto libre del campo
// que aparece al lado (ver handleTypeSelectChange/handleSubmit).
const VEHICLE_TYPE_OPTIONS = [
  'Ambulancia',
  'Ataque rápido',
  'Autobomba Cisterna > a 10000 lts',
  'Autobomba Liviana <= a 1500 lts',
  'Autobomba Mediana > a 1500 hasta 3000 lts',
  'Autobomba Pesada > a 3000 hasta 10000 lts',
  'Embarcaciones',
  'Escalante/Hidroelevador',
  'Mat-Pel (Materiales Peligrosos)',
  'Unidad de Rescate',
  'Unidad de Transporte Carga/Personal',
]
const OTHER_VEHICLE_TYPE = 'Otros'

export function VehiculoFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const isRegionalRole = hasRole('secretario_regional')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [targetStationRegionId, setTargetStationRegionId] = useState<string | null>(null)
  // vehicles_write_admin_regional_station (RLS): secretario_regional solo
  // dentro de su propia región, roles de cuartel solo su propio cuartel — se
  // revalida contra el cuartel real del registro, no solo el rol del actor.
  const canEdit =
    isAdmin ||
    (isRegionalRole && Boolean(targetStationRegionId) && targetStationRegionId === myRegionId) ||
    (isStationRole && Boolean(resolvedStationId) && resolvedStationId === myStationId)
  const [internalCode, setInternalCode] = useState('')
  // vehicleTypeSelect siempre es una de VEHICLE_TYPE_OPTIONS u
  // OTHER_VEHICLE_TYPE (nunca un texto libre directo) -- el valor real a
  // guardar se resuelve recién en handleSubmit (ver ahí). vehicleTypeOther
  // solo importa cuando vehicleTypeSelect === OTHER_VEHICLE_TYPE.
  const [vehicleTypeSelect, setVehicleTypeSelect] = useState('')
  const [vehicleTypeOther, setVehicleTypeOther] = useState('')
  const [status, setStatus] = useState<VehicleStatus>('operativo')
  const [plate, setPlate] = useState('')
  const [waterCapacityLiters, setWaterCapacityLiters] = useState('')
  const [crewCapacity, setCrewCapacity] = useState('')
  const [observations, setObservations] = useState('')
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
      // Compatibilidad con datos existentes: si el tipo guardado coincide
      // EXACTO con una opción institucional, se preselecciona esa opción.
      // Cualquier otro valor (incluidos los tipos libres cargados antes de
      // este combo) se trata como "Otros" con el texto real precargado en
      // el campo de especificar -- nunca se pierde ni se fuerza a encajar
      // en una opción que no corresponde.
      if (VEHICLE_TYPE_OPTIONS.includes(vehicle.vehicle_type)) {
        setVehicleTypeSelect(vehicle.vehicle_type)
      } else {
        setVehicleTypeSelect(OTHER_VEHICLE_TYPE)
        setVehicleTypeOther(vehicle.vehicle_type)
      }
      setStatus(vehicle.status)
      setPlate(vehicle.plate ?? '')
      setWaterCapacityLiters(vehicle.water_capacity_liters != null ? String(vehicle.water_capacity_liters) : '')
      setCrewCapacity(vehicle.crew_capacity != null ? String(vehicle.crew_capacity) : '')
      setObservations(vehicle.observations ?? '')
      setLastServiceAt(vehicle.last_service_at ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!resolvedStationId) return
    let active = true
    fetchStationById(resolvedStationId).then((s) => {
      if (active) setTargetStationRegionId(s?.region_id ?? null)
    })
    return () => {
      active = false
    }
  }, [resolvedStationId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!vehicleTypeSelect) {
      setError('Seleccioná el tipo de vehículo.')
      return
    }
    if (vehicleTypeSelect === OTHER_VEHICLE_TYPE && !vehicleTypeOther.trim()) {
      setError('Especificá el tipo de vehículo.')
      return
    }
    const resolvedVehicleType = vehicleTypeSelect === OTHER_VEHICLE_TYPE ? vehicleTypeOther.trim() : vehicleTypeSelect

    setSubmitting(true)
    try {
      const input = {
        station_id: resolvedStationId,
        internal_code: internalCode,
        vehicle_type: resolvedVehicleType,
        status,
        plate: plate || null,
        water_capacity_liters: waterCapacityLiters ? Number(waterCapacityLiters) : null,
        crew_capacity: crewCapacity ? Number(crewCapacity) : null,
        observations: observations || null,
        last_service_at: lastServiceAt || null,
      }
      if (isEditing && id) {
        await updateVehicle(id, input)
      } else {
        await createVehicle(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el vehículo.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Vehículos">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'cargar'} vehículos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}>
      <h1 className="page-title">{isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h1>
      <p className="page-subtitle">Datos del móvil / vehículo del cuartel.</p>

      {!loading && (status === 'vendido' || status === 'transferido' || status === 'baja') && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13 }}>
            Este vehículo está dado de baja de la flota ({STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}).
            Podés seguir editando sus datos, pero el estado solo se cambia desde el detalle del cuartel.
          </p>
        </div>
      )}

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
            <select
              id="vehicleType"
              required
              value={vehicleTypeSelect}
              onChange={(e) => {
                setVehicleTypeSelect(e.target.value)
                if (e.target.value !== OTHER_VEHICLE_TYPE) setVehicleTypeOther('')
              }}
            >
              <option value="">Seleccionar…</option>
              {VEHICLE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={OTHER_VEHICLE_TYPE}>{OTHER_VEHICLE_TYPE}</option>
            </select>
          </div>

          {vehicleTypeSelect === OTHER_VEHICLE_TYPE && (
            <div className="field">
              <label htmlFor="vehicleTypeOther">Especificar tipo de vehículo</label>
              <input
                id="vehicleTypeOther"
                required
                value={vehicleTypeOther}
                onChange={(e) => setVehicleTypeOther(e.target.value)}
                placeholder="Ej: Camión cisterna forestal"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="plate">Patente (opcional)</label>
            <input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="AB123CD" />
          </div>

          <div className="field">
            <label htmlFor="waterCapacityLiters">Capacidad de agua en litros (opcional)</label>
            <input
              id="waterCapacityLiters"
              type="number"
              min="0"
              value={waterCapacityLiters}
              onChange={(e) => setWaterCapacityLiters(e.target.value)}
              placeholder="3000"
            />
          </div>

          <div className="field">
            <label htmlFor="crewCapacity">Capacidad de personal (opcional)</label>
            <input
              id="crewCapacity"
              type="number"
              min="0"
              value={crewCapacity}
              onChange={(e) => setCrewCapacity(e.target.value)}
              placeholder="6"
            />
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label htmlFor="lastServiceAt">Último service (opcional)</label>
            <input id="lastServiceAt" type="date" value={lastServiceAt} onChange={(e) => setLastServiceAt(e.target.value)} />
          </div>

          {status !== 'vendido' && status !== 'transferido' && status !== 'baja' && (
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
          )}

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
