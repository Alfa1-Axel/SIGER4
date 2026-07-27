import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchStationAuthorities, fetchStationById } from '../lib/api/stations'
import { fetchVehiclesByStation } from '../lib/api/vehicles'
import { fetchAttendanceByStation } from '../lib/api/attendance'
import { fetchInterventionsByStation } from '../lib/api/interventions'
import type { AttendanceSummary, InterventionSummary, Profile, Station, Vehicle } from '../types/database'
import type { RoleKey } from '../types/roles'
import { ROLE_DEFINITIONS } from '../types/roles'
import { useAuth } from '../hooks/useAuth'

const VEHICLE_STATUS_LABEL: Record<Vehicle['status'], string> = {
  operativo: 'Operativo',
  mantenimiento: 'Mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
}

export function CuartelDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'director_escuela', 'secretario_regional')
  const [station, setStation] = useState<Station | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([])
  const [interventions, setInterventions] = useState<InterventionSummary[]>([])
  const [authorities, setAuthorities] = useState<{ profile: Profile; role: RoleKey }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      fetchStationById(id),
      fetchVehiclesByStation(id),
      fetchAttendanceByStation(id),
      fetchInterventionsByStation(id),
      fetchStationAuthorities(id),
    ]).then(([stationData, vehiclesData, attendanceData, interventionsData, authoritiesData]) => {
      if (active) {
        setStation(stationData)
        setVehicles(vehiclesData)
        setAttendance(attendanceData)
        setInterventions(interventionsData)
        setAuthorities(authoritiesData)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [id])

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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {station.logo_url && (
                <img
                  src={station.logo_url}
                  alt={`Logo ${station.name}`}
                  style={{ height: 40, width: 40, borderRadius: 8, objectFit: 'cover', border: '2px solid #fff' }}
                />
              )}
              <h1 style={{ margin: 0, fontSize: 20 }}>{station.name}</h1>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>{station.address ?? station.zone}</p>
          </div>

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
            <h2 className="section-title">Vehículos</h2>
            {canEdit && (
              <Link to={`/cuarteles/${station.id}/vehiculos/nuevo`} className="link-muted">
                + Agregar
              </Link>
            )}
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0 }}>
            {vehicles.length === 0 && <div className="empty-state">No hay vehículos cargados para este cuartel.</div>}
            {vehicles.map((vehicle, i) => (
              <Link
                key={vehicle.id}
                to={canEdit ? `/vehiculos/${vehicle.id}/editar` : '#'}
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
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{vehicle.internal_code} · {vehicle.vehicle_type}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{vehicle.plate ?? 'Sin patente'}</div>
                </div>
                <span className={`badge ${vehicle.status === 'operativo' ? 'badge-success' : 'badge-warning'}`}>
                  {VEHICLE_STATUS_LABEL[vehicle.status]}
                </span>
              </Link>
            ))}
          </div>

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
