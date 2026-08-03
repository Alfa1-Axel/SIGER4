import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { Lightbox } from '../components/ui/Lightbox'
import { ZoomableImage } from '../components/ui/ZoomableImage'
import { ReasonPromptModal } from '../components/ui/ReasonPromptModal'
import { fetchStationAuthorities, fetchStationById } from '../lib/api/stations'
import { fetchVehiclesByStation, changeVehicleStatus, fetchVehicleStatusHistory, DECOMMISSION_STATUSES } from '../lib/api/vehicles'
import { fetchAttendanceByStation } from '../lib/api/attendance'
import { fetchInterventionsByStation } from '../lib/api/interventions'
import {
  fetchPersonnelByStation,
  updatePersonnel,
  deletePersonnel,
  changePersonnelStatus,
  fetchPersonnelStatusHistory,
  SEPARATION_STATUSES,
} from '../lib/api/personnel'
import type {
  AttendanceSummary,
  InterventionSummary,
  Personnel,
  PersonnelStatus,
  PersonnelStatusHistory,
  Profile,
  Station,
  Vehicle,
  VehicleStatus,
  VehicleStatusHistory,
} from '../types/database'
import type { RoleKey } from '../types/roles'
import { ROLE_DEFINITIONS } from '../types/roles'
import { useAuth } from '../hooks/useAuth'

const VEHICLE_STATUS_LABEL: Record<Vehicle['status'], string> = {
  operativo: 'Operativo',
  mantenimiento: 'Mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
  vendido: 'Vendido',
  transferido: 'Transferido',
  baja: 'Baja',
}

const VEHICLE_DECOMMISSION_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: 'vendido', label: 'Marcar como vendido' },
  { value: 'transferido', label: 'Marcar como transferido' },
  { value: 'baja', label: 'Dar de baja' },
]

const PERSONNEL_STATUS_LABEL: Record<PersonnelStatus, string> = {
  activo: 'Activo',
  licencia: 'Licencia',
  baja: 'Baja',
  reserva: 'Reserva',
  aspirante: 'Aspirante',
  renuncia: 'Renuncia',
  pase: 'Pase',
}

const PERSONNEL_STATUS_BADGE: Record<PersonnelStatus, string> = {
  activo: 'badge-success',
  licencia: 'badge-warning',
  baja: 'badge-danger',
  reserva: 'badge-info',
  aspirante: 'badge-info',
  renuncia: 'badge-danger',
  pase: 'badge-danger',
}

// Estados libres (sin motivo obligatorio), editables desde el selector
// directo. renuncia/baja/pase/reserva van por el modal con motivo (ver
// SEPARATION_STATUSES en lib/api/personnel.ts).
const PERSONNEL_FREE_STATUS_OPTIONS: PersonnelStatus[] = ['activo', 'licencia', 'aspirante']

const PERSONNEL_SEPARATION_OPTIONS: { value: PersonnelStatus; label: string }[] = [
  { value: 'renuncia', label: 'Marcar renuncia' },
  { value: 'baja', label: 'Dar de baja' },
  { value: 'pase', label: 'Marcar pase' },
  { value: 'reserva', label: 'Pasar a reserva' },
]

function calculateSeniority(joinDate: string | null): string | null {
  if (!joinDate) return null
  const start = new Date(joinDate)
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  const hasHadAnniversaryThisYear = now.getMonth() > start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() >= start.getDate())
  if (!hasHadAnniversaryThisYear) years -= 1
  if (years < 1) return 'Menos de 1 año'
  return `${years} ${years === 1 ? 'año' : 'años'}`
}

export function CuartelDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_regional')
  const [station, setStation] = useState<Station | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([])
  const [interventions, setInterventions] = useState<InterventionSummary[]>([])
  const [authorities, setAuthorities] = useState<{ profile: Profile; role: RoleKey }[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false)

  const [personnelStatusFilter, setPersonnelStatusFilter] = useState('')
  const [personnelRankFilter, setPersonnelRankFilter] = useState('')
  const [personnelDepartmentFilter, setPersonnelDepartmentFilter] = useState('')

  const [decommissioningVehicle, setDecommissioningVehicle] = useState<{ vehicle: Vehicle; newStatus: VehicleStatus } | null>(null)
  const [expandedVehicleHistoryId, setExpandedVehicleHistoryId] = useState<string | null>(null)
  const [vehicleHistoryByVehicleId, setVehicleHistoryByVehicleId] = useState<Record<string, VehicleStatusHistory[]>>({})

  const [separatingPersonnel, setSeparatingPersonnel] = useState<{ person: Personnel; newStatus: PersonnelStatus } | null>(null)
  const [expandedPersonnelHistoryId, setExpandedPersonnelHistoryId] = useState<string | null>(null)
  const [personnelHistoryByPersonnelId, setPersonnelHistoryByPersonnelId] = useState<Record<string, PersonnelStatusHistory[]>>({})

  async function reloadPersonnel(stationId: string) {
    const [personnelData, stationData] = await Promise.all([fetchPersonnelByStation(stationId), fetchStationById(stationId)])
    setPersonnel(personnelData)
    if (stationData) setStation(stationData)
  }

  async function reloadVehicles(stationId: string) {
    const [vehiclesData, stationData] = await Promise.all([fetchVehiclesByStation(stationId), fetchStationById(stationId)])
    setVehicles(vehiclesData)
    if (stationData) setStation(stationData)
  }

  async function handleToggleVehicleHistory(vehicleId: string) {
    if (expandedVehicleHistoryId === vehicleId) {
      setExpandedVehicleHistoryId(null)
      return
    }
    setExpandedVehicleHistoryId(vehicleId)
    if (!vehicleHistoryByVehicleId[vehicleId]) {
      const history = await fetchVehicleStatusHistory(vehicleId)
      setVehicleHistoryByVehicleId((prev) => ({ ...prev, [vehicleId]: history }))
    }
  }

  async function handleConfirmVehicleDecommission(reason: string) {
    if (!decommissioningVehicle || !id) return
    await changeVehicleStatus(decommissioningVehicle.vehicle.id, decommissioningVehicle.newStatus, reason)
    setDecommissioningVehicle(null)
    setVehicleHistoryByVehicleId((prev) => {
      const next = { ...prev }
      delete next[decommissioningVehicle.vehicle.id]
      return next
    })
    await reloadVehicles(id)
  }

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      fetchStationById(id),
      fetchVehiclesByStation(id),
      fetchAttendanceByStation(id),
      fetchInterventionsByStation(id),
      fetchStationAuthorities(id),
      fetchPersonnelByStation(id),
    ]).then(([stationData, vehiclesData, attendanceData, interventionsData, authoritiesData, personnelData]) => {
      if (active) {
        setStation(stationData)
        setVehicles(vehiclesData)
        setAttendance(attendanceData)
        setInterventions(interventionsData)
        setAuthorities(authoritiesData)
        setPersonnel(personnelData)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [id])

  const personnelRanks = useMemo(
    () => Array.from(new Set(personnel.map((p) => p.rank).filter((r): r is string => Boolean(r)))).sort(),
    [personnel],
  )
  const personnelDepartments = useMemo(
    () => Array.from(new Set(personnel.map((p) => p.department).filter((d): d is string => Boolean(d)))).sort(),
    [personnel],
  )
  const filteredPersonnel = useMemo(
    () =>
      personnel.filter(
        (p) =>
          (!personnelStatusFilter || p.status === personnelStatusFilter) &&
          (!personnelRankFilter || p.rank === personnelRankFilter) &&
          (!personnelDepartmentFilter || p.department === personnelDepartmentFilter),
      ),
    [personnel, personnelStatusFilter, personnelRankFilter, personnelDepartmentFilter],
  )
  const activePersonnelCount = useMemo(() => personnel.filter((p) => p.status === 'activo').length, [personnel])

  async function handlePersonnelStatusChange(personId: string, status: PersonnelStatus) {
    if (!id) return
    await updatePersonnel(personId, { status })
    await reloadPersonnel(id)
  }

  async function handlePersonnelDelete(personId: string) {
    if (!id) return
    if (!window.confirm('¿Eliminar este integrante de la dotación? Esta acción no se puede deshacer.')) return
    await deletePersonnel(personId)
    await reloadPersonnel(id)
  }

  async function handleTogglePersonnelHistory(personId: string) {
    if (expandedPersonnelHistoryId === personId) {
      setExpandedPersonnelHistoryId(null)
      return
    }
    setExpandedPersonnelHistoryId(personId)
    if (!personnelHistoryByPersonnelId[personId]) {
      const history = await fetchPersonnelStatusHistory(personId)
      setPersonnelHistoryByPersonnelId((prev) => ({ ...prev, [personId]: history }))
    }
  }

  async function handleConfirmPersonnelSeparation(reason: string) {
    if (!separatingPersonnel || !id) return
    await changePersonnelStatus(separatingPersonnel.person.id, separatingPersonnel.newStatus, reason)
    setSeparatingPersonnel(null)
    setPersonnelHistoryByPersonnelId((prev) => {
      const next = { ...prev }
      delete next[separatingPersonnel.person.id]
      return next
    })
    await reloadPersonnel(id)
  }

  return (
    <AppShell title="Detalle Cuartel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Link to="/cuarteles" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Volver a Cuarteles
        </Link>
        {canEdit && station && (
          <Link to={`/cuarteles/${station.id}/editar`} className="btn btn-outlined" style={{ padding: '6px 14px', fontSize: 13 }}>
            <Icon name="edit" size={14} />
            Editar
          </Link>
        )}
      </div>

      {loading && <div className="empty-state">Cargando información del cuartel…</div>}
      {!loading && !station && <div className="empty-state">No se encontró el cuartel solicitado.</div>}

      {station && (
        <>
          <div
            className="card-solid"
            role={station.cover_image_url ? 'button' : undefined}
            tabIndex={station.cover_image_url ? 0 : undefined}
            aria-label={station.cover_image_url ? 'Ampliar foto de portada' : undefined}
            onClick={() => station.cover_image_url && setCoverLightboxOpen(true)}
            onKeyDown={(e) => {
              if (station.cover_image_url && (e.key === 'Enter' || e.key === ' ')) setCoverLightboxOpen(true)
            }}
            style={{
              backgroundImage: station.cover_image_url ? `url(${station.cover_image_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: station.cover_image_url ? '#fff' : undefined,
              minHeight: 160,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              marginBottom: 16,
              cursor: station.cover_image_url ? 'zoom-in' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {station.logo_url && (
                <div onClick={(e) => e.stopPropagation()}>
                  <ZoomableImage
                    src={station.logo_url}
                    alt={`Logo ${station.name}`}
                    style={{ height: 40, width: 40, borderRadius: 8, border: '2px solid #fff', overflow: 'hidden' }}
                  />
                </div>
              )}
              <h1 style={{ margin: 0, fontSize: 20 }}>{station.name}</h1>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>{station.address ?? station.zone}</p>
          </div>

          {coverLightboxOpen && station.cover_image_url && (
            <Lightbox src={station.cover_image_url} alt={`Portada de ${station.name}`} onClose={() => setCoverLightboxOpen(false)} />
          )}

          <div className="card-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div className="kpi-value">{station.personnel_count}</div>
              <div className="kpi-label">Personal</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div className="kpi-value">{station.vehicles_count}</div>
              <div className="kpi-label">Móviles</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div className="kpi-value">{station.founded_year ?? '—'}</div>
              <div className="kpi-label">Fundación</div>
            </div>
          </div>

          <div className="section-header">
            <h2 className="section-title">Autoridades y Contacto</h2>
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            {authorities.length === 0 ? (
              <div className="empty-state">Todavía no hay autoridades asignadas para este cuartel.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {authorities.map(({ profile, role }) => (
                  <div key={`${profile.id}-${role}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{profile.full_name}</span>
                    <span className="badge badge-info">{ROLE_DEFINITIONS.find((r) => r.key === role)?.label ?? role}</span>
                  </div>
                ))}
              </div>
            )}

            {(station.phone || station.email || station.social_media) && (
              <div style={{ borderTop: authorities.length > 0 ? '1px solid var(--color-border)' : 'none', paddingTop: authorities.length > 0 ? 12 : 0 }}>
                {station.phone && <p style={{ margin: '0 0 4px', fontSize: 13 }}>📞 {station.phone}</p>}
                {station.email && <p style={{ margin: '0 0 4px', fontSize: 13 }}>✉️ {station.email}</p>}
                {station.social_media?.facebook && <p style={{ margin: '0 0 4px', fontSize: 13 }}>Facebook: {station.social_media.facebook}</p>}
                {station.social_media?.instagram && <p style={{ margin: 0, fontSize: 13 }}>Instagram: {station.social_media.instagram}</p>}
              </div>
            )}

            {station.description && (
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>{station.description}</p>
            )}
          </div>

          <div className="section-header">
            <h2 className="section-title">Personal / Dotación</h2>
            {canEdit && (
              <Link to={`/cuarteles/${station.id}/personal/nuevo`} className="link-muted">
                + Agregar
              </Link>
            )}
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Dotación activa: <strong>{activePersonnelCount}</strong> · Total cargado: {personnel.length}
              </span>
            </div>

            {personnel.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <select value={personnelStatusFilter} onChange={(e) => setPersonnelStatusFilter(e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Todos los estados</option>
                  {Object.entries(PERSONNEL_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {personnelRanks.length > 0 && (
                  <select value={personnelRankFilter} onChange={(e) => setPersonnelRankFilter(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Todas las jerarquías</option>
                    {personnelRanks.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
                {personnelDepartments.length > 0 && (
                  <select value={personnelDepartmentFilter} onChange={(e) => setPersonnelDepartmentFilter(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Todos los departamentos</option>
                    {personnelDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {personnel.length === 0 && <div className="empty-state">No hay personal cargado para este cuartel.</div>}
            {personnel.length > 0 && filteredPersonnel.length === 0 && (
              <div className="empty-state">No hay personal que coincida con estos filtros.</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filteredPersonnel.map((person, i) => {
                const history = personnelHistoryByPersonnelId[person.id]
                return (
                  <div key={person.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {person.last_name}, {person.first_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {[person.rank, person.role_function, person.department].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                          {person.join_date && ` · Antigüedad: ${calculateSeniority(person.join_date)}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {canEdit ? (
                          <select
                            value={person.status}
                            onChange={(e) => {
                              const value = e.target.value as PersonnelStatus
                              if (SEPARATION_STATUSES.includes(value)) {
                                setSeparatingPersonnel({ person, newStatus: value })
                              } else {
                                handlePersonnelStatusChange(person.id, value)
                              }
                            }}
                            style={{ fontSize: 12, padding: '2px 4px' }}
                          >
                            {PERSONNEL_FREE_STATUS_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {PERSONNEL_STATUS_LABEL[value]}
                              </option>
                            ))}
                            {SEPARATION_STATUSES.includes(person.status) && (
                              <option value={person.status}>{PERSONNEL_STATUS_LABEL[person.status]} (actual)</option>
                            )}
                            <optgroup label="Requiere motivo">
                              {PERSONNEL_SEPARATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        ) : (
                          <span className={`badge ${PERSONNEL_STATUS_BADGE[person.status]}`}>{PERSONNEL_STATUS_LABEL[person.status]}</span>
                        )}
                        <button
                          type="button"
                          className="btn btn-outlined"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => handleTogglePersonnelHistory(person.id)}
                        >
                          {expandedPersonnelHistoryId === person.id ? 'Ocultar historial' : 'Ver historial'}
                        </button>
                        {canEdit && (
                          <>
                            <Link to={`/personal/${person.id}/editar`} className="btn btn-outlined" style={{ padding: '4px 8px' }}>
                              <Icon name="edit" size={14} />
                            </Link>
                            <button
                              type="button"
                              className="btn btn-outlined"
                              style={{ padding: '4px 8px' }}
                              onClick={() => handlePersonnelDelete(person.id)}
                              aria-label="Eliminar"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {expandedPersonnelHistoryId === person.id && (
                      <div style={{ padding: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {history === undefined && 'Cargando historial…'}
                        {history?.length === 0 && 'Sin cambios de estado registrados.'}
                        {history && history.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.map((entry) => (
                              <div key={entry.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 8 }}>
                                <strong>{PERSONNEL_STATUS_LABEL[entry.previous_status]} → {PERSONNEL_STATUS_LABEL[entry.new_status]}</strong>
                                {' · '}
                                {new Date(entry.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                                <div>{entry.reason}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {separatingPersonnel && (
            <ReasonPromptModal
              title={`${PERSONNEL_SEPARATION_OPTIONS.find((o) => o.value === separatingPersonnel.newStatus)?.label} — ${separatingPersonnel.person.last_name}, ${separatingPersonnel.person.first_name}`}
              description="Este cambio queda registrado en el historial del integrante y deja de sumar en la dotación activa del cuartel."
              confirmLabel="Confirmar"
              onConfirm={handleConfirmPersonnelSeparation}
              onClose={() => setSeparatingPersonnel(null)}
            />
          )}

          <div className="section-header">
            <h2 className="section-title">Vehículos</h2>
            {canEdit && (
              <Link to={`/cuarteles/${station.id}/vehiculos/nuevo`} className="link-muted">
                + Agregar
              </Link>
            )}
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {vehicles.length === 0 && <div className="empty-state">No hay vehículos cargados para este cuartel.</div>}
            {vehicles.map((vehicle, i) => {
              const isDecommissioned = DECOMMISSION_STATUSES.includes(vehicle.status)
              const history = vehicleHistoryByVehicleId[vehicle.id]
              return (
                <div key={vehicle.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      to={canEdit ? `/vehiculos/${vehicle.id}/editar` : '#'}
                      style={{ textDecoration: 'none', color: 'inherit', pointerEvents: canEdit ? 'auto' : 'none', flex: 1, minWidth: 160 }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{vehicle.internal_code} · {vehicle.vehicle_type}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{vehicle.plate ?? 'Sin patente'}</div>
                    </Link>
                    <span className={`badge ${vehicle.status === 'operativo' ? 'badge-success' : isDecommissioned ? 'badge-danger' : 'badge-warning'}`}>
                      {VEHICLE_STATUS_LABEL[vehicle.status]}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outlined"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      onClick={() => handleToggleVehicleHistory(vehicle.id)}
                    >
                      {expandedVehicleHistoryId === vehicle.id ? 'Ocultar historial' : 'Ver historial'}
                    </button>
                    {canEdit && !isDecommissioned && (
                      <select
                        value=""
                        onChange={(e) => {
                          const value = e.target.value as VehicleStatus
                          if (value) setDecommissioningVehicle({ vehicle, newStatus: value })
                        }}
                        style={{ fontSize: 12, padding: '2px 4px' }}
                      >
                        <option value="">Dar de baja / vender / transferir…</option>
                        {VEHICLE_DECOMMISSION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {expandedVehicleHistoryId === vehicle.id && (
                    <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {history === undefined && 'Cargando historial…'}
                      {history?.length === 0 && 'Sin cambios de estado registrados.'}
                      {history && history.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {history.map((entry) => (
                            <div key={entry.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 8 }}>
                              <strong>{VEHICLE_STATUS_LABEL[entry.previous_status]} → {VEHICLE_STATUS_LABEL[entry.new_status]}</strong>
                              {' · '}
                              {new Date(entry.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                              <div>{entry.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {decommissioningVehicle && (
            <ReasonPromptModal
              title={`${VEHICLE_DECOMMISSION_OPTIONS.find((o) => o.value === decommissioningVehicle.newStatus)?.label} — ${decommissioningVehicle.vehicle.internal_code}`}
              description="Este cambio queda registrado en el historial del vehículo y no cuenta más como flota activa del cuartel."
              confirmLabel="Confirmar"
              onConfirm={handleConfirmVehicleDecommission}
              onClose={() => setDecommissioningVehicle(null)}
            />
          )}

          <div className="section-header">
            <h2 className="section-title">Asistencia</h2>
            {canEdit && (
              <Link to={`/cuarteles/${station.id}/asistencia/nueva`} className="link-muted">
                + Agregar
              </Link>
            )}
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {attendance.length === 0 && (
              <div className="empty-state">No hay resúmenes de asistencia cargados para este cuartel.</div>
            )}
            {attendance.map((summary, i) => (
              <Link
                key={summary.id}
                to={canEdit ? `/asistencia/${summary.id}/editar` : '#'}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  textDecoration: 'none',
                  color: 'inherit',
                  pointerEvents: canEdit ? 'auto' : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {summary.period_start} — {summary.period_end}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {summary.total_members} miembros · promedio {summary.present_average} presentes
                  </div>
                </div>
                <span className="badge badge-info">{summary.attendance_rate}%</span>
              </Link>
            ))}
          </div>

          <div className="section-header">
            <h2 className="section-title">Intervenciones</h2>
            {canEdit && (
              <Link to={`/cuarteles/${station.id}/intervenciones/nueva`} className="link-muted">
                + Agregar
              </Link>
            )}
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {interventions.length === 0 && (
              <div className="empty-state">No hay resúmenes de intervenciones cargados para este cuartel.</div>
            )}
            {interventions.map((summary, i) => (
              <Link
                key={summary.id}
                to={canEdit ? `/intervenciones/${summary.id}/editar` : '#'}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                  textDecoration: 'none',
                  color: 'inherit',
                  pointerEvents: canEdit ? 'auto' : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{summary.category}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {summary.period_start} — {summary.period_end}
                    {summary.time_of_day && ` · ${summary.time_of_day}`}
                    {summary.personnel_count > 0 && ` · ${summary.personnel_count} personal`}
                    {summary.vehicles_count > 0 && ` · ${summary.vehicles_count} móviles`}
                    {summary.work_hours > 0 && ` · ${summary.work_hours}h`}
                  </div>
                </div>
                <span className="badge badge-danger">{summary.total_count}</span>
              </Link>
            ))}
          </div>

          <div className="section-header">
            <h2 className="section-title">Actividad Reciente</h2>
          </div>
          <div className="card">
            <div className="empty-state">
              <Icon name="chart" size={20} />
              <p>Aún no hay actividad registrada para este cuartel en Supabase.</p>
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}
