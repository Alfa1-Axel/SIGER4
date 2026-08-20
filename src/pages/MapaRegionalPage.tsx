import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ContactLink } from '../components/ui/ContactLink'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchRegions } from '../lib/api/regions'
import {
  fetchMapReferencePoints,
  createMapReferencePoint,
  updateMapReferencePoint,
  deleteMapReferencePoint,
} from '../lib/api/mapReferencePoints'
import type { MapReferencePointInput } from '../lib/api/mapReferencePoints'
import type { MapReferencePoint, MapReferencePointType, Region, Station, Subsede } from '../types/database'
import { describeSupabaseError } from '../lib/api/errors'
import { useAuth } from '../hooks/useAuth'

// Centro aproximado de la Regional 4 (Córdoba) -- solo se usa como vista
// inicial del mapa cuando no hay ningún cuartel con coordenadas todavía;
// nunca se usa como ubicación de un cuartel puntual.
const DEFAULT_CENTER: [number, number] = [-31.4201, -64.1888]
const DEFAULT_ZOOM = 8

// Ícono propio en vez de los PNG por defecto de Leaflet (que requieren
// configurar rutas de assets a mano con Vite y quedan rotos si no se hace) --
// mismo mecanismo visual que el resto de los íconos de la app (SVG inline),
// en el rojo institucional para que se lea como "pin de SIGER4", no como un
// pin genérico de mapa.
const stationDivIcon = L.divIcon({
  className: 'map-station-marker',
  html: `<svg width="30" height="42" viewBox="0 0 24 24" fill="#D32F2F" stroke="#7f0000" stroke-width="0.5">
    <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9Z"/>
    <circle cx="12" cy="9" r="3.4" fill="#fff"/>
  </svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -38],
})

// Puntos de referencia territorial: forma distinta a la de los cuarteles
// (diamante en vez de gota) para que se distingan de un vistazo, y un color
// por tipo en vez de agregar 6 íconos SVG nuevos -- v1 simple, sin inflar el
// set de íconos de la app por una sola pantalla.
const REFERENCE_TYPE_COLOR: Record<MapReferencePointType, string> = {
  ruta: '#F59E0B',
  parque_industrial: '#7C3AED',
  rio: '#0EA5E9',
  zona_riesgo: '#DC2626',
  punto_estrategico: '#059669',
  otro: '#6B7280',
}

const REFERENCE_TYPE_LABEL: Record<MapReferencePointType, string> = {
  ruta: 'Ruta',
  parque_industrial: 'Parque industrial',
  rio: 'Río',
  zona_riesgo: 'Zona de riesgo',
  punto_estrategico: 'Punto estratégico',
  otro: 'Otro',
}

const REFERENCE_TYPE_OPTIONS = Object.keys(REFERENCE_TYPE_LABEL) as MapReferencePointType[]

function referenceDivIcon(type: MapReferencePointType) {
  const color = REFERENCE_TYPE_COLOR[type]
  return L.divIcon({
    className: 'map-reference-marker',
    html: `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(45 12 12)" fill="${color}" stroke="#1c1917" stroke-width="1.2"/></svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

interface StationWithSubsede extends Station {
  subsede: Subsede | null
}

function shortLabel(station: Station): string {
  return station.code ? `${station.code} · ${station.name}` : station.name
}

function StationPopupContent({ station }: { station: StationWithSubsede }) {
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{station.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        {station.code}
        {station.subsede && ` · ${station.subsede.name}`}
      </div>
      {station.address && <div style={{ fontSize: 12, marginBottom: 4 }}>{station.address}</div>}
      {station.map_notes && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
          {station.map_notes}
        </div>
      )}
      <div className="contact-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {station.phone && <ContactLink kind="phone" value={station.phone} />}
        {station.whatsapp_phone && <ContactLink kind="whatsapp" value={station.whatsapp_phone} />}
        {station.email && <ContactLink kind="email" value={station.email} />}
      </div>
      <Link to={`/cuarteles/${station.id}`} className="link-muted">
        Ver detalle del cuartel →
      </Link>
    </div>
  )
}

// scopeLabel resuelve el alcance del punto a texto legible (mismo criterio
// que el resto del sistema: mostrar el nombre real, no el UUID crudo) --
// "Regional 4", "Subsede Luque", "Cuartel Central N°1", o "Toda la Regional"
// si no tiene ningún alcance definido (visible para cualquiera, ver RLS).
function ReferencePopupContent({
  point,
  scopeLabel,
  canManage,
  canDelete,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  point: MapReferencePoint
  scopeLabel: string
  canManage: boolean
  canDelete: boolean
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{point.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        {REFERENCE_TYPE_LABEL[point.type]} · {scopeLabel}
      </div>
      {point.description && <div style={{ fontSize: 12, marginBottom: 8 }}>{point.description}</div>}
      {!point.is_active && (
        <span className="badge badge-warning" style={{ marginBottom: 8, display: 'inline-flex' }}>
          Inactivo
        </span>
      )}
      {canManage && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" className="btn btn-outlined" style={{ padding: '4px 8px', fontSize: 11 }} onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="btn btn-outlined" style={{ padding: '4px 8px', fontSize: 11 }} onClick={onToggleActive}>
            {point.is_active ? 'Desactivar' : 'Reactivar'}
          </button>
          {/* Borrado físico: solo informatica_r4/integrante_informatica -- la
              RLS (map_reference_points_delete_admin) lo restringe igual, esto
              es para no mostrarle el botón a secretario_regional y que le
              falle silenciosamente (un DELETE que RLS bloquea no lanza
              error, simplemente no borra nada -- el punto reaparecería tras
              recargar sin ninguna explicación). */}
          {canDelete && (
            <button type="button" className="btn btn-outlined" style={{ padding: '4px 8px', fontSize: 11 }} onClick={onDelete}>
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  type: 'otro' as MapReferencePointType,
  description: '',
  latitude: '',
  longitude: '',
  scopeKind: 'ninguno' as 'ninguno' | 'region' | 'subsede' | 'station',
  regionId: '',
  subsedeId: '',
  stationId: '',
}

export function MapaRegionalPage() {
  const { isAdmin, hasRole, profile } = useAuth()
  const canManagePoints = isAdmin || hasRole('secretario_regional')

  const [stations, setStations] = useState<StationWithSubsede[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [points, setPoints] = useState<MapReferencePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subsedeFilter, setSubsedeFilter] = useState('')
  const [showReferenceLayer, setShowReferenceLayer] = useState(true)
  const [showInactivePoints, setShowInactivePoints] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadAll() {
    setError(null)
    try {
      const [stationsData, subsedesData, regionsData, pointsData] = await Promise.all([
        fetchStations(),
        fetchSubsedes(),
        fetchRegions(),
        fetchMapReferencePoints(),
      ])
      const subsedeById = new Map(subsedesData.map((s) => [s.id, s]))
      setStations(stationsData.map((s) => ({ ...s, subsede: s.subsede_id ? subsedeById.get(s.subsede_id) ?? null : null })))
      setSubsedes(subsedesData)
      setRegions(regionsData)
      setPoints(pointsData)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cargar el Mapa Regional.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const filteredStations = useMemo(
    () => (subsedeFilter ? stations.filter((s) => s.subsede_id === subsedeFilter) : stations),
    [stations, subsedeFilter],
  )

  const filteredPoints = useMemo(() => {
    let list = points
    if (!showInactivePoints) list = list.filter((p) => p.is_active)
    if (subsedeFilter) {
      // Un punto con station_id nunca tiene subsede_id propio seteado (son
      // alcances mutuamente excluyentes en el form) -- para saber si ese
      // cuartel pertenece a la subsede filtrada hay que resolverlo vía el
      // cuartel real, si no todo punto con alcance de cuartel pasaba el
      // filtro sin importar a qué subsede pertenecía.
      list = list.filter((p) => {
        if (p.subsede_id) return p.subsede_id === subsedeFilter
        if (p.station_id) return stations.find((s) => s.id === p.station_id)?.subsede_id === subsedeFilter
        return true
      })
    }
    return list
  }, [points, subsedeFilter, showInactivePoints, stations])

  const withCoordinates = filteredStations.filter((s) => s.latitude != null && s.longitude != null)
  const withoutCoordinates = filteredStations.filter((s) => s.latitude == null || s.longitude == null)

  const mapCenter: [number, number] =
    withCoordinates.length > 0 ? [withCoordinates[0].latitude as number, withCoordinates[0].longitude as number] : DEFAULT_CENTER

  function scopeLabelFor(point: MapReferencePoint): string {
    if (point.station_id) return stations.find((s) => s.id === point.station_id)?.name ?? 'Cuartel no disponible'
    if (point.subsede_id) return subsedes.find((s) => s.id === point.subsede_id)?.name ?? 'Subsede no disponible'
    if (point.region_id) return regions.find((r) => r.id === point.region_id)?.name ?? 'Regional no disponible'
    return 'Toda la Regional'
  }

  function openCreateForm() {
    setEditingId(null)
    setFormError(null)
    setForm({
      ...EMPTY_FORM,
      // secretario_regional solo puede crear dentro de su propia región (RLS
      // lo exige) -- prellenar evita que arme un punto que la base va a
      // rechazar por no coincidir con su alcance real.
      scopeKind: !isAdmin && profile?.region_id ? 'region' : 'ninguno',
      regionId: !isAdmin && profile?.region_id ? profile.region_id : '',
    })
    setFormOpen(true)
  }

  function openEditForm(point: MapReferencePoint) {
    setEditingId(point.id)
    setFormError(null)
    setForm({
      name: point.name,
      type: point.type,
      description: point.description ?? '',
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      scopeKind: point.station_id ? 'station' : point.subsede_id ? 'subsede' : point.region_id ? 'region' : 'ninguno',
      regionId: point.region_id ?? '',
      subsedeId: point.subsede_id ?? '',
      stationId: point.station_id ?? '',
    })
    setFormOpen(true)
  }

  async function handleSubmitForm(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('La latitud debe ser un número entre -90 y 90.')
      return
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      setFormError('La longitud debe ser un número entre -180 y 180.')
      return
    }
    // secretario_regional (is_regional_role() en la RLS) solo puede escribir
    // si region_id coincide con su propia región -- sin importar si además
    // eligió acotar el punto a una subsede o cuartel puntual (la RLS de
    // 0084 no exige que subsede_id/station_id sean null, solo que region_id
    // sea la suya). No puede dejar el punto "sin alcance" (scopeKind
    // 'ninguno'), porque eso lo haría visible a toda la app.
    if (!isAdmin && form.scopeKind === 'ninguno') {
      setFormError('Como secretario regional, el punto tiene que tener alcance de tu región.')
      return
    }
    if (!isAdmin && form.regionId !== profile?.region_id) {
      setFormError('Solo podés crear puntos dentro de tu propia región.')
      return
    }

    const input: MapReferencePointInput = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || null,
      latitude: lat,
      longitude: lng,
      // region_id se manda siempre que haya alcance (no solo cuando
      // scopeKind === 'region'): un punto acotado a subsede o cuartel igual
      // pertenece a una región, y para secretario_regional tiene que ser la
      // suya para que la RLS lo acepte.
      region_id: form.scopeKind !== 'ninguno' ? form.regionId || null : null,
      subsede_id: form.scopeKind === 'subsede' ? form.subsedeId || null : null,
      station_id: form.scopeKind === 'station' ? form.stationId || null : null,
    }

    setSubmitting(true)
    try {
      if (editingId) await updateMapReferencePoint(editingId, input)
      else await createMapReferencePoint(input)
      setFormOpen(false)
      await loadAll()
    } catch (err) {
      setFormError(describeSupabaseError(err, 'No pudimos guardar el punto de referencia.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(point: MapReferencePoint) {
    try {
      await updateMapReferencePoint(point.id, { is_active: !point.is_active })
      await loadAll()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos actualizar el punto de referencia.'))
    }
  }

  // Borrado físico reservado a informatica_r4 (RLS lo exige igual, esto es
  // solo para no ofrecer una acción que el backend va a rechazar) -- el
  // resto de los roles con permiso de gestión usa "Desactivar" (soft-delete)
  // para sacar un punto de circulación sin perder el historial.
  async function handleDelete(point: MapReferencePoint) {
    if (!window.confirm(`¿Eliminar definitivamente "${point.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await deleteMapReferencePoint(point.id)
      await loadAll()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos eliminar el punto de referencia.'))
    }
  }

  const subsedesForRegion = subsedes.filter((s) => !form.regionId || s.region_id === form.regionId)
  const stationsForSubsede = stations.filter((s) => !form.subsedeId || s.subsede_id === form.subsedeId)

  return (
    <AppShell title="Mapa Regional">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Mapa Regional</h1>
          <p className="page-subtitle">
            Cuarteles y referencias territoriales de la Regional 4 georreferenciados.
          </p>
        </div>
        {canManagePoints && (
          <button type="button" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={openCreateForm}>
            + Punto de referencia
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          {subsedes.length > 0 && (
            <div className="field" style={{ maxWidth: 280, marginBottom: 0 }}>
              <label htmlFor="subsedeFilter">Filtrar por subsede</label>
              <select id="subsedeFilter" value={subsedeFilter} onChange={(e) => setSubsedeFilter(e.target.value)}>
                <option value="">Todas las subsedes</option>
                {subsedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={showReferenceLayer} onChange={(e) => setShowReferenceLayer(e.target.checked)} style={{ width: 'auto' }} />
            Referencias territoriales
          </label>
          {canManagePoints && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={showInactivePoints} onChange={(e) => setShowInactivePoints(e.target.checked)} style={{ width: 'auto' }} />
              Ver inactivos
            </label>
          )}
        </div>
      )}

      {loading && <div className="empty-state">Cargando mapa…</div>}

      {!loading && (
        <>
          <div
            className="card"
            style={{ padding: 0, marginBottom: 16, overflow: 'hidden', height: 'min(70vh, 560px)' }}
          >
            <MapContainer center={mapCenter} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> colaboradores'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {withCoordinates.map((station) => (
                <Marker
                  key={station.id}
                  position={[station.latitude as number, station.longitude as number]}
                  icon={stationDivIcon}
                >
                  <Popup>
                    <StationPopupContent station={station} />
                  </Popup>
                </Marker>
              ))}
              {showReferenceLayer &&
                filteredPoints.map((point) => (
                  <Marker key={point.id} position={[point.latitude, point.longitude]} icon={referenceDivIcon(point.type)}>
                    <Popup>
                      <ReferencePopupContent
                        point={point}
                        scopeLabel={scopeLabelFor(point)}
                        canManage={canManagePoints}
                        canDelete={isAdmin}
                        onEdit={() => openEditForm(point)}
                        onToggleActive={() => void handleToggleActive(point)}
                        onDelete={() => void handleDelete(point)}
                      />
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>

          {formOpen && (
            <div className="card-solid" style={{ marginBottom: 20 }}>
              <div className="section-header">
                <h2 className="section-title">{editingId ? 'Editar punto de referencia' : 'Nuevo punto de referencia'}</h2>
              </div>
              <form onSubmit={(e) => void handleSubmitForm(e)}>
                <div className="field">
                  <label htmlFor="pointName">Nombre</label>
                  <input
                    id="pointName"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ruta 19, Parque Industrial Las Varillas..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="pointType">Tipo</label>
                  <select
                    id="pointType"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MapReferencePointType }))}
                  >
                    {REFERENCE_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {REFERENCE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="pointDescription">Descripción (opcional)</label>
                  <textarea
                    id="pointDescription"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: 1, minWidth: 140 }}>
                    <label htmlFor="pointLatitude">Latitud</label>
                    <input
                      id="pointLatitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      required
                      value={form.latitude}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                      placeholder="-31.420083"
                    />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 140 }}>
                    <label htmlFor="pointLongitude">Longitud</label>
                    <input
                      id="pointLongitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      required
                      value={form.longitude}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                      placeholder="-64.188776"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="pointScopeKind">Alcance</label>
                  <select
                    id="pointScopeKind"
                    value={form.scopeKind}
                    onChange={(e) => {
                      const nextScopeKind = e.target.value as typeof form.scopeKind
                      setForm((f) => ({
                        ...f,
                        scopeKind: nextScopeKind,
                        // Un secretario_regional siempre escribe dentro de su
                        // propia región, elija o no acotar además a subsede/
                        // cuartel -- si el campo todavía no tiene regionId
                        // (ej. venía de 'ninguno'), se lo completamos acá.
                        regionId: !isAdmin && nextScopeKind !== 'ninguno' ? profile?.region_id ?? f.regionId : f.regionId,
                        subsedeId: '',
                        stationId: '',
                      }))
                    }}
                  >
                    {isAdmin && <option value="ninguno">Toda la Regional (sin restricción)</option>}
                    <option value="region">Una región</option>
                    <option value="subsede">Una subsede</option>
                    <option value="station">Un cuartel</option>
                  </select>
                  {!isAdmin && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Como secretario regional, solo podés cargar puntos dentro de tu propia región (podés acotarlos además a una subsede o cuartel puntual).
                    </p>
                  )}
                </div>

                {(form.scopeKind === 'region' || form.scopeKind === 'subsede' || form.scopeKind === 'station') && (
                  <div className="field">
                    <label htmlFor="pointRegion">Región</label>
                    <select
                      id="pointRegion"
                      required
                      disabled={!isAdmin}
                      value={form.regionId}
                      onChange={(e) => setForm((f) => ({ ...f, regionId: e.target.value, subsedeId: '', stationId: '' }))}
                    >
                      <option value="" disabled>
                        Seleccionar región
                      </option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(form.scopeKind === 'subsede' || form.scopeKind === 'station') && (
                  <div className="field">
                    <label htmlFor="pointSubsede">Subsede</label>
                    <select
                      id="pointSubsede"
                      required
                      value={form.subsedeId}
                      onChange={(e) => setForm((f) => ({ ...f, subsedeId: e.target.value, stationId: '' }))}
                    >
                      <option value="" disabled>
                        Seleccionar subsede
                      </option>
                      {subsedesForRegion.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {form.scopeKind === 'station' && (
                  <div className="field">
                    <label htmlFor="pointStation">Cuartel</label>
                    <select
                      id="pointStation"
                      required
                      value={form.stationId}
                      onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
                    >
                      <option value="" disabled>
                        Seleccionar cuartel
                      </option>
                      {stationsForSubsede.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formError && <p className="field-error">{formError}</p>}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" className="btn btn-outlined" onClick={() => setFormOpen(false)} disabled={submitting}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="section-header">
            <h2 className="section-title">
              Cuarteles sin ubicación cargada {withoutCoordinates.length > 0 && `(${withoutCoordinates.length})`}
            </h2>
          </div>
          {withoutCoordinates.length === 0 ? (
            <div className="empty-state">Todos los cuarteles de este filtro tienen coordenadas cargadas.</div>
          ) : (
            <div className="card" style={{ padding: 0, marginBottom: 20 }}>
              {withoutCoordinates.map((station, i) => (
                <Link
                  key={station.id}
                  to={`/cuarteles/${station.id}`}
                  className="list-item"
                  style={{
                    padding: '12px 16px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  <span className="list-item-icon" style={{ color: 'var(--color-text-muted)' }}>
                    <Icon name="mapPin" size={16} />
                  </span>
                  <div className="list-item-body">
                    <div className="list-item-title">{shortLabel(station)}</div>
                    <div className="list-item-subtitle">
                      {station.subsede ? station.subsede.name : 'Sin subsede'}
                      {station.address ? ` · ${station.address}` : ''}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
