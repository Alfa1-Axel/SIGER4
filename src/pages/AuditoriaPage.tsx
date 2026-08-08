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
import { fetchCourses } from '../lib/api/courses'
import { fetchDocuments } from '../lib/api/documents'
import { fetchInventoryItems } from '../lib/api/inventory'
import { fetchDepartments, fetchMyDepartmentIds } from '../lib/api/departments'
import type { Profile, Region, Station, Subsede } from '../types/database'
import {
  buildEventSummary,
  buildFieldDiff,
  translateAction,
  translateTable,
  type EntityLookup,
} from '../lib/audit/humanize'
import { describeSupabaseError } from '../lib/api/errors'
import { useAuth } from '../hooks/useAuth'

// Tablas visibles en Auditoría según el rol — RLS ya acota las FILAS por
// territorio (región/subsede/cuartel); esto acota además qué MÓDULOS puede
// ver cada rol, independiente del territorio (ej. un jefe_cuerpo_activo no
// debe ver auditoría de Departamentos ni de Inventario Regional, aunque RLS
// le devolviera esas filas). informatica_r4/integrante_informatica no tienen
// entrada acá: ven todo (allowedTableNames = null, sin restricción).
const JEFE_CUERPO_ACTIVO_TABLES = [
  'stations',
  'profiles',
  'user_roles',
  'user_scopes',
  'vehicles',
  'personnel',
  'documents',
  'document_versions',
  'attendance_summaries',
  'intervention_summaries',
  'station_history_events',
  'calendar_events',
]

const ESCUELA_TABLES = ['courses', 'course_stations', 'calendar_events', 'profiles', 'user_roles']

const SECRETARIO_REGIONAL_TABLES = [
  'stations',
  'subsedes',
  'profiles',
  'user_roles',
  'user_scopes',
  'vehicles',
  'personnel',
  'documents',
  'document_versions',
  'attendance_summaries',
  'intervention_summaries',
  'station_history_events',
  'calendar_events',
  'courses',
  'departments',
  'department_members',
  'department_activity_reports',
  'department_manual_members',
  'inventory_items',
  'inventory_loan_requests',
]

const DEPARTMENT_TABLES = ['departments', 'department_members', 'department_activity_reports', 'department_manual_members']

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

function entityDisplayName(log: AuditLogRow): string | null {
  const row = (log.new_value ?? log.old_value) as Record<string, unknown> | null
  if (!row) return null
  const name = row.name ?? row.full_name ?? row.title ?? row.internal_code
  return typeof name === 'string' ? name : null
}

function TechnicalJson({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-outlined" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Ocultar datos técnicos' : 'Ver datos técnicos'}
      </button>
      {open && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <pre
            style={{
              flex: 1,
              minWidth: 200,
              margin: 0,
              fontSize: 11,
              padding: 8,
              borderRadius: 6,
              overflowX: 'auto',
              maxHeight: 220,
              background: 'rgba(211, 47, 47, 0.06)',
              border: '1px solid rgba(211, 47, 47, 0.25)',
            }}
          >
            {oldValue ? JSON.stringify(oldValue, null, 2) : 'Sin datos'}
          </pre>
          <pre
            style={{
              flex: 1,
              minWidth: 200,
              margin: 0,
              fontSize: 11,
              padding: 8,
              borderRadius: 6,
              overflowX: 'auto',
              maxHeight: 220,
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            {newValue ? JSON.stringify(newValue, null, 2) : 'Sin datos'}
          </pre>
        </div>
      )}
    </div>
  )
}

function AuditLogDetail({ log, lookup, showTechnical }: { log: AuditLogRow; lookup: EntityLookup; showTechnical: boolean }) {
  const diffs = useMemo(
    () => buildFieldDiff(log.old_value as Record<string, unknown> | null, log.new_value as Record<string, unknown> | null, lookup),
    [log, lookup],
  )

  return (
    <div style={{ padding: '12px 16px', background: 'var(--color-bg-card-soft)', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span>
          <strong>Regional:</strong> {log.region?.name ?? '—'}
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

      {diffs.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
          No hay campos con cambios registrados para este evento.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '6px 8px' }}>Campo</th>
                <th style={{ padding: '6px 8px' }}>Antes</th>
                <th style={{ padding: '6px 8px' }}>Después</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((diff) => (
                <tr key={diff.field} style={{ borderTop: '1px solid var(--color-border)', fontSize: 12 }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{diff.label}</td>
                  <td style={{ padding: '6px 8px', color: '#B91C1C', background: diff.changed ? 'rgba(211, 47, 47, 0.06)' : undefined }}>
                    {diff.before}
                  </td>
                  <td style={{ padding: '6px 8px', color: '#15803D', background: diff.changed ? 'rgba(34, 197, 94, 0.08)' : undefined }}>
                    {diff.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showTechnical && <TechnicalJson oldValue={log.old_value} newValue={log.new_value} />}
    </div>
  )
}

export function AuditoriaPage() {
  const { profile, isAdmin, hasRole } = useAuth()
  // invitado es "solo lectura limitado" (ver ROLE_DEFINITIONS) -- ver el
  // historial completo de auditoría de su cuartel (diffs old/new de cada
  // cambio) excede ese alcance. El sidebar ya lo ocultaba (hideForRoles en
  // navigation.ts) pero la ruta y la RLS (audit_logs_select_station/_subsede,
  // migración 0063) no lo excluían -- se cierra acá en los tres niveles.
  const canAccess = !hasRole('invitado')
  // informatica_r4/integrante_informatica ven todo, sin restricción de
  // tabla — el resto de los roles solo ve los módulos institucionalmente
  // relevantes para su rol (RLS ya acota el territorio de cada fila; esto
  // acota además qué módulos puede ver). Un usuario puede calzar en más de
  // un set (ej. secretario_regional que además coordina un departamento) —
  // se unen todos los que apliquen.
  const isJefeCuerpoActivo = hasRole('jefe_cuerpo_activo')
  const isEscuela = hasRole('director_escuela', 'instructor')
  const isSecretarioRegional = hasRole('secretario_regional')
  const isTechnicalViewer = isAdmin
  const [myDepartmentIds, setMyDepartmentIds] = useState<string[] | null>(null)

  useEffect(() => {
    if (isAdmin || !profile?.id) {
      setMyDepartmentIds(null)
      return
    }
    let active = true
    fetchMyDepartmentIds(profile.id)
      .then((ids) => active && setMyDepartmentIds(ids))
      .catch(() => active && setMyDepartmentIds([]))
    return () => {
      active = false
    }
  }, [isAdmin, profile?.id])

  const isDepartmentMember = !isAdmin && Boolean(myDepartmentIds?.length)

  // null = sin restricción (informática). Si el rol no calza en ningún set
  // conocido (ej. presidente_cuartel, secretario_comision — RLS igual los
  // deja pasar con alcance de cuartel), se le muestra el mismo set acotado
  // que jefe_cuerpo_activo, el más chico entre los definidos, en vez de
  // dejarlo sin restricción por descarte.
  const allowedTableNames = useMemo<string[] | null>(() => {
    if (isAdmin) return null
    const sets: string[][] = []
    if (isJefeCuerpoActivo) sets.push(JEFE_CUERPO_ACTIVO_TABLES)
    if (isEscuela) sets.push(ESCUELA_TABLES)
    if (isSecretarioRegional) sets.push(SECRETARIO_REGIONAL_TABLES)
    if (isDepartmentMember) sets.push(DEPARTMENT_TABLES)
    if (sets.length === 0) sets.push(JEFE_CUERPO_ACTIVO_TABLES)
    return [...new Set(sets.flat())]
  }, [isAdmin, isJefeCuerpoActivo, isEscuela, isSecretarioRegional, isDepartmentMember])

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
  const [entityNames, setEntityNames] = useState<Map<string, string>>(new Map())

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
    Promise.all([
      fetchRegions(),
      fetchSubsedes(),
      fetchStations(),
      fetchProfiles(),
      fetchDistinctAuditActions(allowedTableNames),
      fetchDistinctAuditTables(allowedTableNames),
      fetchCourses().catch(() => []),
      fetchDocuments().catch(() => []),
      fetchInventoryItems().catch(() => []),
      fetchDepartments().catch(() => []),
    ])
      .then(([regionsData, subsedesData, stationsData, profilesData, actionsData, tablesData, coursesData, documentsData, inventoryItemsData, departmentsData]) => {
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setProfiles(profilesData)
        setActions(actionsData)
        setTables(tablesData)

        const names = new Map<string, string>()
        for (const r of regionsData) names.set(r.id, r.name)
        for (const s of subsedesData) names.set(s.id, s.name)
        for (const s of stationsData) names.set(s.id, s.name)
        for (const p of profilesData) names.set(p.id, p.full_name)
        for (const c of coursesData) names.set(c.id, c.title)
        for (const d of documentsData) names.set(d.id, d.title)
        for (const i of inventoryItemsData) names.set(i.id, i.name)
        for (const dep of departmentsData) names.set(dep.id, dep.name)
        setEntityNames(names)
      })
      .catch(() => undefined)
  }, [allowedTableNames])

  const lookup = useMemo(() => (uuid: string) => entityNames.get(uuid) ?? null, [entityNames])

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
      allowedTableNames,
    }),
    [dateFrom, dateTo, actorProfileId, action, tableName, regionId, subsedeId, stationId, searchText, allowedTableNames],
  )

  // department_activity_reports/department_manual_members no tienen scope
  // territorial en RLS (lectura abierta a cualquier autenticado, ver 0061/
  // 0062) — un coordinador/miembro de departamento solo debe ver eventos de
  // SUS departamentos, filtro que no se puede expresar en la query (no hay
  // columna department_id en audit_logs, solo dentro de old_value/new_value)
  // y se aplica acá, post-fetch. isSecretarioRegional/isAdmin ven todos los
  // departamentos (alcance regional/total, sin este recorte).
  const visibleLogs = useMemo(() => {
    if (isAdmin || isSecretarioRegional) return logs
    return logs.filter((log) => {
      if (!DEPARTMENT_TABLES.includes(log.table_name)) return true
      if (!isDepartmentMember) return false
      const row = (log.new_value ?? log.old_value) as Record<string, unknown> | null
      const deptId = log.table_name === 'departments' ? log.record_id : (row?.department_id as string | undefined)
      return Boolean(deptId) && (myDepartmentIds ?? []).includes(deptId as string)
    })
  }, [logs, isAdmin, isSecretarioRegional, isDepartmentMember, myDepartmentIds])

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
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar la auditoría')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [filters, page])

  function resetFiltersPage() {
    setPage(0)
  }

  if (!canAccess) {
    return (
      <AppShell title="Auditoría">
        <div className="empty-state">No tenés permisos para ver la auditoría del sistema.</div>
      </AppShell>
    )
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
                  {translateAction(a)}
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
                  {translateTable(t)}
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
      {!loading && visibleLogs.length === 0 && <div className="empty-state">No hay eventos de auditoría para estos filtros.</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {visibleLogs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '10px 12px' }}>Fecha/hora</th>
                <th style={{ padding: '10px 12px' }}>Evento</th>
                <th style={{ padding: '10px 12px' }}>Acción</th>
                <th style={{ padding: '10px 12px' }}>Módulo</th>
                <th style={{ padding: '10px 12px' }}>Alcance</th>
                <th style={{ padding: '10px 12px' }} />
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => (
                <Fragment key={log.id}>
                  <tr style={{ borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {buildEventSummary(log.actor?.full_name ?? null, log.action, log.table_name, entityDisplayName(log))}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${actionBadgeClass(log.action)}`}>{translateAction(log.action)}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{translateTable(log.table_name)}</td>
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
                        <AuditLogDetail log={log} lookup={lookup} showTechnical={isTechnicalViewer} />
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
