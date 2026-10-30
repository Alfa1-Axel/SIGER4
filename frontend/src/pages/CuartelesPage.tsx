import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchStationBasicDirectory, fetchStations } from '../lib/api/stations'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStationCompliance, COMPLIANCE_STATUS_BADGE, COMPLIANCE_STATUS_LABEL } from '../lib/api/compliance'
import type { Station, StationBasic, StationCompliance, StationStatus, Subsede } from '../types/database'
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
  // Ficha institucional de TODOS los cuarteles (la ve cualquier usuario activo, 0119) y, aparte, los
  // cuarteles que esta persona puede leer completos (RLS): de esos se suman efectivos, móviles y estado de carga.
  const [directory, setDirectory] = useState<StationBasic[]>([])
  const [accessible, setAccessible] = useState<Map<string, Station>>(new Map())
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [compliance, setCompliance] = useState<StationCompliance[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StationStatus | 'todos'>('todos')
  const [subsedeFilter, setSubsedeFilter] = useState<string | 'todas'>('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetchStationBasicDirectory(),
      fetchStations().catch(() => [] as Station[]),
      fetchSubsedes(),
      fetchStationCompliance().catch(() => [] as StationCompliance[]),
    ])
      .then(([directoryData, stationsData, subsedesData, complianceData]) => {
        if (!active) return
        setDirectory(directoryData)
        setAccessible(new Map(stationsData.map((s) => [s.id, s])))
        setSubsedes(subsedesData)
        setCompliance(complianceData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los cuarteles. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const complianceByStationId = useMemo(() => new Map(compliance.map((c) => [c.station_id, c])), [compliance])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return directory.filter((s) => {
      const matchesQuery = !q || s.name.toLowerCase().includes(q) || (s.zone ?? '').toLowerCase().includes(q) || (s.address ?? '').toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'todos' || s.status === statusFilter
      const matchesSubsede = subsedeFilter === 'todas' || s.subsede_id === subsedeFilter
      return matchesQuery && matchesStatus && matchesSubsede
    })
  }, [directory, query, statusFilter, subsedeFilter])

  const anyInternal = accessible.size > 0

  return (
    <AppShell title="Cuarteles">
      <h1 className="page-title">Cuarteles</h1>
      <p className="page-subtitle">
        {anyInternal
          ? 'Los cuarteles de la Regional 4. De los tuyos ves además los efectivos, los móviles y el estado de carga.'
          : 'Los cuarteles de la Regional 4, con su ficha institucional: ubicación, contacto y autoridades.'}
      </p>

      <div className="search-input" style={{ marginBottom: 12 }}>
        <Icon name="search" size={16} />
        <input
          placeholder="Nombre, zona o dirección…"
          aria-label="Buscar cuartel por nombre, zona o dirección"
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
            className="chip"
            aria-pressed={statusFilter === status}
          >
            {status === 'todos' ? 'Todos' : STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setSubsedeFilter('todas')}
          className="chip"
          aria-pressed={subsedeFilter === 'todas'}
        >
          Todas las subsedes
        </button>
        {subsedes.map((subsede) => (
          <button
            key={subsede.id}
            type="button"
            onClick={() => setSubsedeFilter(subsede.id)}
            className="chip"
            aria-pressed={subsedeFilter === subsede.id}
          >
            {subsede.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {loading && <div className="loading-state" role="status">Cargando cuarteles…</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">No encontramos cuarteles con esa búsqueda o filtro.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.map((station) => {
          const internal = accessible.get(station.id)
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
                  {internal && stationCompliance && (
                    <span className={`badge ${COMPLIANCE_STATUS_BADGE[stationCompliance.compliance_status]}`}>
                      {COMPLIANCE_STATUS_LABEL[stationCompliance.compliance_status]}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 2px', fontSize: 16, overflowWrap: 'anywhere' }}>{station.name}</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                  {station.address ?? station.zone ?? 'Sin dirección registrada'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {station.subsede_name ?? 'Sin subsede'}
                </p>
              </div>
              <Icon name="chevronRight" size={18} />
            </div>
            {internal && (
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
                <div title="Total de efectivos: no incluye Bomberos Nivel 4">
                  <div style={{ fontWeight: 700 }}>{String(internal.personnel_count).padStart(2, '0')}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>EFECTIVOS</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{String(internal.vehicles_count).padStart(2, '0')}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>MÓVILES</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--color-link)' }}>
                    {internal.response_time_minutes != null ? `${internal.response_time_minutes}min` : '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>RESPUESTA</div>
                </div>
              </div>
            )}
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
          <span className="fab-label">Nuevo cuartel</span>
        </Link>
      )}
    </AppShell>
  )
}
