import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ContactLink } from '../components/ui/ContactLink'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import type { Station, Subsede } from '../types/database'
import { describeSupabaseError } from '../lib/api/errors'

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

export function MapaRegionalPage() {
  const [stations, setStations] = useState<StationWithSubsede[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subsedeFilter, setSubsedeFilter] = useState('')
  const [subsedes, setSubsedes] = useState<Subsede[]>([])

  useEffect(() => {
    let active = true
    Promise.all([fetchStations(), fetchSubsedes()])
      .then(([stationsData, subsedesData]) => {
        if (!active) return
        const subsedeById = new Map(subsedesData.map((s) => [s.id, s]))
        setStations(
          stationsData.map((s) => ({ ...s, subsede: s.subsede_id ? subsedeById.get(s.subsede_id) ?? null : null })),
        )
        setSubsedes(subsedesData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los cuarteles para el mapa.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const filteredStations = useMemo(
    () => (subsedeFilter ? stations.filter((s) => s.subsede_id === subsedeFilter) : stations),
    [stations, subsedeFilter],
  )

  const withCoordinates = filteredStations.filter((s) => s.latitude != null && s.longitude != null)
  const withoutCoordinates = filteredStations.filter((s) => s.latitude == null || s.longitude == null)

  const mapCenter: [number, number] =
    withCoordinates.length > 0 ? [withCoordinates[0].latitude as number, withCoordinates[0].longitude as number] : DEFAULT_CENTER

  return (
    <AppShell title="Mapa Regional">
      <h1 className="page-title">Mapa Regional</h1>
      <p className="page-subtitle">Cuarteles de la Regional 4 georreferenciados. v1 — solo cuarteles por ahora.</p>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {!loading && subsedes.length > 0 && (
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
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

      {loading && <div className="empty-state">Cargando cuarteles…</div>}

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
            </MapContainer>
          </div>

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
