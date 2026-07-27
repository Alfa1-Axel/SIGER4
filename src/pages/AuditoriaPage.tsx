import { Fragment, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import {
  fetchAuditLogs,
  fetchDistinctAuditActions,
  fetchDistinctAuditTables,
  type AuditLogFilters,
  type AuditLogRow,
} from '../lib/api/auditLogs'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import type { Profile, Region, Station, Subsede } from '../types/database'

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('eliminar') || a.includes('remove')) return 'badge-danger'
  if (a.includes('insert') || a.includes('create') || a.includes('alta') || a.includes('generado')) return 'badge-success'
  if (a.includes('update') || a.includes('edit') || a.includes('modific')) return 'badge-info'
  return 'badge-warning'
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

function JsonBlock({ label, value, variant }: { label: string; value: unknown; variant: 'before' | 'after' }) {
  const [expanded, setExpanded] = useState(false)
  if (value === null || value === undefined) {
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="kpi-label" style={{ marginBottom: 4 }}>
          {label}
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin datos</p>
      </div>
    )
  }

  const text = JSON.stringify(value, null, 2)
  const isLong = text.length > 300

  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div className="kpi-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 11,
          padding: 8,
          borderRadius: 6,
          overflowX: 'auto',
          maxHeight: expanded ? 'none' : 160,
          background: variant === 'before' ? 'rgba(211, 47, 47, 0.06)' : 'rgba(34, 197, 94, 0.08)',
          border: `1px solid ${variant === 'before' ? 'rgba(211, 47, 47, 0.25)' : 'rgba(34, 197, 94, 0.3)'}`,
        }}
      >
        {text}
      </pre>
      {isLong && (
        <button
          type="button"
          className="btn btn-outlined"
          style={{ padding: '3px 8px', fontSize: 11, marginTop: 4 }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  )
}

function AuditLogDetail({ log }: { log: AuditLogRow }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--color-surface-alt, #F8FAFC)', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span>
          <strong>Registro:</strong> {log.record_id ?? '—'}
        </span>
        <span>
          <strong>Región:</strong> {log.region?.name ?? '—'}
        </span>
        <span>
          <strong>Subsede:</strong> {log.subsede?.name ?? '—'}
        </span>
        <span>
          <strong>Cuartel:</strong> {log.station?.name ?? '—'}
        </span>
        {log.reason && (
          <span>
            <strong>Motivo:</strong> {log.reason}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <JsonBlock label="Valor anterior" value={log.old_value} variant="before" />
        <JsonBlock label="Valor nuevo" value={log.new_value} variant="after" />
      </div>
    </div>
  )
}

export function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [tables, setTables] = useState<string[]>([])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actorProfileId, setActorProfileId] = useState('')
  const [action, setAction] = useState('')
  const [tableName, setTableName] = useState('')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles(), fetchDistinctAuditActions(), fetchDistinctAuditTables()])
      .then(([regionsData, subsedesData, stationsData, profilesData, actionsData, tablesData]) => {
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setProfiles(profilesData)
        setActions(actionsData)
        setTables(tablesData)
      })
      .catch(() => undefined)
  }, [])

  const filters: AuditLogFilters = useMemo(
    () => ({
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      actorProfileId: actorProfileId || null,
      action: action || null,
      tableName: tableName || null,
      regionId: regionId || null,
      subsedeId: subsedeId || null,
      stationId: stationId || null,
      searchText: searchText || null,
    }),
    [dateFrom, dateTo, actorProfileId, action, tableName, regionId, subsedeId, stationId, searchText],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchAuditLogs(filters, page)
      .then(({ rows, hasMore: more }) => {
        if (!active) return
        setLogs(rows)
        setHasMore(more)
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar la auditoría'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [filters, page])

  function resetFiltersPage() {
    setPage(0)
  }

  return (
    <AppShell title="Auditoría">
      <h1 className="page-title">Auditoría</h1>
      <p className="page-subtitle">Bitácora institucional: quién hizo qué, cuándo, y sobre qué registro.</p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="dateFrom">Desde</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                resetFiltersPage()
              }}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="dateTo">Hasta</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                resetFiltersPage()
              }}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="actorFilter">Usuario</label>
            <select
              id="actorFilter"
              value={actorProfileId}
              onChange={(e) => {
                setActorProfileId(e.target.value)
                resetFiltersPage()
              }}
            >
              <option value="">Todos</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="actionFilter">Acción</label>
            <select
              id="actionFilter"
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                resetFiltersPage()
              }}
            >
              <option value="">Todas</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="tableFilter">Tabla / módulo</label>
            <select
              id="tableFilter"
              value={tableName}
              onChange={(e) => {
                setTableName(e.target.value)
                resetFiltersPage()
              }}
            >
              <option value="">Todas</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="regionFilter">Región</label>
            <select
              id="regionFilter"
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value)
                setSubsedeId('')
                setStationId('')
                resetFiltersPage()
              }}
            >
              <option value="">Todas</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="subsedeFilter">Subsede</label>
            <select
              id="subsedeFilter"
              value={subsedeId}
              onChange={(e) => {
                setSubsedeId(e.target.value)
                setStationId('')
                resetFiltersPage()
              }}
            >
              <option value="">Todas</option>
              {subsedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="stationFilter">Cuartel</label>
            <select
              id="stationFilter"
              value={stationId}
              onChange={(e) => {
                setStationId(e.target.value)
                resetFiltersPage()
              }}
            >
              <option value="">Todos</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="searchFilter">Búsqueda libre</label>
            <div className="search-input">
              <Icon name="search" size={16} />
              <input
                id="searchFilter"
                placeholder="Acción, motivo, tabla, registro..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  resetFiltersPage()
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando auditoría…</div>}
      {!loading && logs.length === 0 && <div className="empty-state">No hay eventos de auditoría para estos filtros.</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {logs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '10px 12px' }}>Fecha/hora</th>
                <th style={{ padding: '10px 12px' }}>Usuario</th>
                <th style={{ padding: '10px 12px' }}>Acción</th>
                <th style={{ padding: '10px 12px' }}>Tabla</th>
                <th style={{ padding: '10px 12px' }}>Alcance</th>
                <th style={{ padding: '10px 12px' }} />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr style={{ borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>{log.actor?.full_name ?? 'Sistema'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${actionBadgeClass(log.action)}`}>{log.action}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{log.table_name}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {log.station?.name ?? log.subsede?.name ?? log.region?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-outlined"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        {expandedId === log.id ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <AuditLogDetail log={log} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(page > 0 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button type="button" className="btn btn-outlined" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Anterior
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', alignSelf: 'center' }}>Página {page + 1}</span>
          <button type="button" className="btn btn-outlined" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </AppShell>
  )
}
