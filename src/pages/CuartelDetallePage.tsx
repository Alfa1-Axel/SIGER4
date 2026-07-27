import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchStationById } from '../lib/api/stations'
import type { Station } from '../types/database'

export function CuartelDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [station, setStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchStationById(id).then((data) => {
      if (active) {
        setStation(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [id])

  return (
    <AppShell title="Detalle Cuartel">
      <Link to="/cuarteles" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Cuarteles
      </Link>

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
            <h1 style={{ margin: 0, fontSize: 20 }}>{station.name}</h1>
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
            <div className="empty-state">
              Los datos de autoridades se cargarán desde el módulo de personal (próxima fase).
            </div>
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
