import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStationCompliance, COMPLIANCE_STATUS_BADGE, COMPLIANCE_STATUS_LABEL } from '../lib/api/compliance'
import type { Station, StationCompliance, StationStatus, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const STATUS_LABEL: Record<StationStatus, string> = {
  operativo: 'Operativo',
  no_operativo: 'No operativo',
}

const STATUS_BADGE: Record<StationStatus, string> = {
  operativo: 'badge-success',
  no_operativo: 'badge-danger',
}

export function CuartelesPage() {
  const { isAdmin } = useAuth()
  const [stations, setStations] = useState<Station[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [compliance, setCompliance] = useState<StationCompliance[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StationStatus | 'todos'>('todos')
  const [subsedeFilter, setSubsedeFilter] = useState<string | 'todas'>('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchStations(), fetchSubsedes(), fetchStationCompliance()])
      .then(([stationsData, subsedesData, complianceData]) => {
        if (!active) return
        setStations(stationsData)
        setSubsedes(subsedesData)
        setCompliance(complianceData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar cuarteles')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const subsedeById = useMemo(() => new Map(subsedes.map((s) => [s.id, s])), [subsedes])
  const complianceByStationId = useMemo(() => new Map(compliance.map((c) => [c.station_id, c])), [compliance])

  const filtered = useMemo(() => {
    return stations.filter((s) => {
      const matchesQuery =
        !query ||
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        (s.zone ?? '').toLowerCase().includes(query.toLowerCase())
      const matchesStatus = statusFilter === 'todos' || s.status === statusFilter
      const matchesSubsede = subsedeFilter === 'todas' || s.subsede_id === subsedeFilter
      return matchesQuery && matchesStatus && matchesSubsede
    })
  }, [stations, query, statusFilter, subsedeFilter])

  return (
    <AppShell title="Cuarteles">
      <h1 className="page-title">Gestión de Cuarteles</h1>
      <p className="page-subtitle">Listado de cuarteles dependientes de la Regional 4</p>

      <div className="search-input" style={{ marginBottom: 12 }}>
        <Icon name="search" size={16} />
        <input
          placeholder="Buscar cuartel por nombre o zona..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['todos', 'operativo', 'no_operativo'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`btn ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            {status === 'todos' ? 'Todos' : STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setSubsedeFilter('todas')}
          className={`btn ${subsedeFilter === 'todas' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 14px', fontSize: 13 }}
        >
          Todas las subsedes
        </button>
        {subsedes.map((subsede) => (
          <button
            key={subsede.id}
            type="button"
            onClick={() => setSubsedeFilter(subsede.id)}
            className={`btn ${subsedeFilter === subsede.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            {subsede.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando cuarteles…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">No se encontraron cuarteles con ese criterio.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.map((station) => {
          const stationCompliance = complianceByStationId.get(station.id)
          return (
          <Link
            key={station.id}
            to={`/cuarteles/${station.id}`}
            className="card-solid"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className={`badge ${STATUS_BADGE[station.status]}`}>{STATUS_LABEL[station.status]}</span>
                  {stationCompliance && (
                    <span className={`badge ${COMPLIANCE_STATUS_BADGE[stationCompliance.compliance_status]}`}>
                      {COMPLIANCE_STATUS_LABEL[stationCompliance.compliance_status]}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 2px', fontSize: 16, overflowWrap: 'anywhere' }}>{station.name}</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                  {station.address ?? station.zone ?? 'Sin dirección registrada'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {station.subsede_id ? subsedeById.get(station.subsede_id)?.name ?? 'Subsede desconocida' : 'Sin subsede'}
                </p>
              </div>
              <Icon name="chevronRight" size={18} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--color-border)',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{String(station.personnel_count).padStart(2, '0')}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>PERSONAL</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{String(station.vehicles_count).padStart(2, '0')}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>VEHÍCULOS</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                  {station.response_time_minutes != null ? `${station.response_time_minutes}min` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>RESPUESTA</div>
              </div>
            </div>
          </Link>
          )
        })}
      </div>

      {isAdmin && (
        <Link
          to="/cuarteles/nuevo"
          className="btn btn-primary btn-icon fab"
          aria-label="Nuevo cuartel"
        >
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
