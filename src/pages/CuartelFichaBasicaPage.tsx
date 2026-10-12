import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ContactLink } from '../components/ui/ContactLink'
import { ZoomableImage } from '../components/ui/ZoomableImage'
import { fetchStationBasicAuthorities, fetchStationBasicDirectory } from '../lib/api/stations'
import { ROLE_DEFINITIONS } from '../types/roles'
import type { StationAuthorityBasic, StationBasic } from '../types/database'
import { describeSupabaseError } from '../lib/api/errors'

// Ficha institucional básica de un cuartel (0119): la ve cualquier usuario activo. Es solo lectura y trae
// únicamente datos institucionales: nombre, ubicación, contacto, fundación y autoridades (nombre y cargo).
// Los datos internos (efectivos, móviles, personal, asistencia, intervenciones, documentos) son de quienes
// trabajan en ese cuartel o en la Regional y no pasan por acá.
export function CuartelFichaBasicaPage() {
  const { id } = useParams<{ id: string }>()
  const [station, setStation] = useState<StationBasic | null>(null)
  const [authorities, setAuthorities] = useState<StationAuthorityBasic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchStationBasicDirectory(), fetchStationBasicAuthorities(id).catch(() => [] as StationAuthorityBasic[])])
      .then(([directory, authoritiesData]) => {
        if (!active) return
        setStation(directory.find((s) => s.id === id) ?? null)
        setAuthorities(authoritiesData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar el cuartel. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  const hasContact = station && (station.phone || station.whatsapp_phone || station.email || station.social_media?.facebook || station.social_media?.instagram)

  return (
    <AppShell title="Cuartel">
      <div style={{ marginBottom: 16 }}>
        <Link to="/cuarteles" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Volver a Cuarteles
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="loading-state" role="status">
          Cargando información del cuartel…
        </div>
      )}
      {!loading && !error && !station && <div className="empty-state">No encontramos ese cuartel. Puede que lo hayan dado de baja.</div>}

      {station && (
        <>
          <div
            className="card-solid"
            style={{
              backgroundImage: station.cover_image_url ? `url(${station.cover_image_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: station.cover_image_url ? 'var(--color-on-overlay)' : undefined,
              minHeight: station.cover_image_url ? 180 : undefined,
              boxShadow: station.cover_image_url ? 'inset 0 -90px 60px -30px var(--color-scrim)' : undefined,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {station.logo_url && (
                <ZoomableImage
                  src={station.logo_url}
                  alt={`Logo ${station.name}`}
                  style={{ height: 40, width: 40, borderRadius: 'var(--radius-lg)', border: '2px solid var(--color-surface)', overflow: 'hidden' }}
                />
              )}
              <h1 style={{ margin: 0, fontSize: 20, overflowWrap: 'anywhere' }}>{station.name}</h1>
            </div>
            {station.address ? (
              <ContactLink
                kind="address"
                value={station.address}
                mapsContext={station.zone ?? undefined}
                className={station.cover_image_url ? 'contact-link--inverted' : undefined}
              />
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>{station.zone}</p>
            )}
          </div>

          <div className="card-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div className="kpi-value">{station.founded_year ?? '—'}</div>
              <div className="kpi-label">Fundación</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div className="kpi-value" style={{ fontSize: 16 }}>{station.subsede_name ?? 'Sin subsede'}</div>
              <div className="kpi-label">Subsede</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 6 }}>
                <span className={`badge ${station.status === 'operativo' ? 'badge-success' : 'badge-danger'}`}>
                  {station.status === 'operativo' ? 'Operativo' : 'No operativo'}
                </span>
              </div>
              <div className="kpi-label">Estado</div>
            </div>
          </div>

          <div className="section-header">
            <h2 className="section-title">Autoridades y Contacto</h2>
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            {authorities.length === 0 ? (
              <div className="empty-state">Todavía no hay autoridades cargadas para este cuartel.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: hasContact ? 12 : 0 }}>
                {authorities.map((authority) => (
                  <div key={`${authority.full_name}-${authority.role}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{authority.full_name}</span>
                    <span className="badge badge-info" style={{ flexShrink: 0 }}>
                      {ROLE_DEFINITIONS.find((r) => r.key === authority.role)?.label ?? authority.role}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {hasContact && (
              <div className="contact-list" style={{ borderTop: authorities.length > 0 ? '1px solid var(--color-border)' : 'none', paddingTop: authorities.length > 0 ? 12 : 0 }}>
                {station.phone && <ContactLink kind="phone" value={station.phone} />}
                {station.whatsapp_phone && <ContactLink kind="whatsapp" value={station.whatsapp_phone} />}
                {station.email && <ContactLink kind="email" value={station.email} />}
                {station.social_media?.facebook && <ContactLink kind="url" value={station.social_media.facebook} label="Facebook" />}
                {station.social_media?.instagram && <ContactLink kind="instagram" value={station.social_media.instagram} />}
              </div>
            )}

            {station.description && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>{station.description}</p>}
          </div>

          <p className="field-help" style={{ marginBottom: 20 }}>
            Esta es la ficha institucional del cuartel, que ve cualquier usuario de SIGER4. Sus datos internos (efectivos, móviles, personal, asistencia,
            intervenciones y documentos) los ven solo quienes trabajan en el cuartel o en la Regional.
          </p>
        </>
      )}
    </AppShell>
  )
}
