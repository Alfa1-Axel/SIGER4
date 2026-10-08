import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchStationCompliance } from '../lib/api/compliance'
import { fetchStationStaffing } from '../lib/api/stationStaffing'
import { fetchStations } from '../lib/api/stations'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'
import type { StationStaffing } from '../types/database'

// Resumen del Inicio: una sola tarjeta, de una línea de números. Para quien
// trabaja en un cuartel, sus efectivos; para quien ve la Regional, el estado
// general. No repite lo que tiene su propia pantalla: lleva a ella.

const formatDay = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

export function HomeResumen() {
  const { isAdmin, hasRole } = useAuth()
  const { ownStationIds } = useLoanRequestAccess()
  const regional = isAdmin || hasRole('secretario_regional', 'director_escuela')
  const stationId = ownStationIds[0] ?? null
  if (regional) return <RegionalResumen />
  if (stationId && hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'invitado')) {
    return <StationResumen stationId={stationId} />
  }
  return null
}

function StationResumen({ stationId }: { stationId: string }) {
  const { hasRole } = useAuth()
  const canEdit = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  // undefined mientras se pide; null si el cuartel todavía no cargó sus efectivos.
  const [staffing, setStaffing] = useState<StationStaffing | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    fetchStationStaffing(stationId)
      .then((row) => active && setStaffing(row))
      .catch(() => active && setStaffing(undefined))
    return () => {
      active = false
    }
  }, [stationId])

  if (staffing === undefined) return null
  return (
    <section aria-label="Efectivos del cuartel" className="home-strip card">
      {staffing ? (
        <>
          <div className="home-strip-stat">
            <span className="home-strip-value">{staffing.total}</span>
            <span className="home-strip-label">efectivos del cuartel · año {staffing.reference_year}</span>
          </div>
          <span className="home-strip-meta">Actualizados el {formatDay(staffing.updated_at)}</span>
        </>
      ) : (
        <span className="home-strip-meta">Todavía no están cargados los efectivos del cuartel.</span>
      )}
      <Link to={`/cuarteles/${stationId}#efectivos`} className="link-muted home-strip-link">
        {canEdit ? (staffing ? 'Actualizar efectivos' : 'Cargar efectivos') : 'Ver efectivos'}
      </Link>
    </section>
  )
}

function RegionalResumen() {
  const [stats, setStats] = useState<{ stations: number; effectives: number; pending: number } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchStations(), fetchStationCompliance().catch(() => [])])
      .then(([stations, compliance]) => {
        if (!active) return
        setStats({
          stations: stations.length,
          effectives: stations.reduce((sum, s) => sum + s.personnel_count, 0),
          pending: compliance.filter((c) => c.compliance_status !== 'verde').length,
        })
      })
      .catch(() => active && setStats(null))
    return () => {
      active = false
    }
  }, [])

  if (!stats) return null
  return (
    <section aria-label="Resumen de la Regional" className="home-strip card">
      <div className="home-strip-stat">
        <span className="home-strip-value">{stats.stations}</span>
        <span className="home-strip-label">{stats.stations === 1 ? 'cuartel' : 'cuarteles'}</span>
      </div>
      <div className="home-strip-stat">
        <span className="home-strip-value">{stats.effectives}</span>
        <span className="home-strip-label">efectivos</span>
      </div>
      <div className="home-strip-stat">
        <span className="home-strip-value">{stats.pending}</span>
        <span className="home-strip-label">{stats.pending === 1 ? 'con cargas pendientes' : 'con cargas pendientes'}</span>
      </div>
      <Link to="/cuarteles" className="link-muted home-strip-link">
        Ver cuarteles
      </Link>
    </section>
  )
}
