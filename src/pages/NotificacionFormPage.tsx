import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { createNotification } from '../lib/api/notifications'
import type { NotificationType, Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const NOTIFICATION_TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'curso_nuevo', label: 'Curso nuevo' },
  { value: 'circular_nueva', label: 'Circular nueva' },
  { value: 'asistencia_pendiente', label: 'Asistencia pendiente' },
  { value: 'estadisticas_nuevas', label: 'Estadísticas nuevas' },
  { value: 'cambio_estado', label: 'Cambio de estado' },
  { value: 'actividad_proxima', label: 'Actividad próxima' },
  { value: 'documento_actualizado', label: 'Documento actualizado' },
  { value: 'reporte_generado', label: 'Reporte generado' },
]

type NotifScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const NOTIF_SCOPE_OPTIONS: { value: NotifScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

export function NotificacionFormPage() {
  const navigate = useNavigate()
  const { isAdmin, hasRole } = useAuth()
  const canCreate = isAdmin || hasRole('secretario_regional', 'director_escuela', 'instructor')

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [type, setType] = useState<NotificationType>('circular_nueva')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scopeTarget, setScopeTarget] = useState<NotifScopeTarget>('region')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [profileId, setProfileId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles()]).then(
      ([regionsData, subsedesData, stationsData, profilesData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setProfiles(profilesData)
        setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [canCreate])

  if (!canCreate) {
    return (
      <AppShell title="Nueva Notificación">
        <div className="empty-state">No tenés permisos para crear notificaciones.</div>
      </AppShell>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (scopeTarget === 'region' && !regionId) {
      setError('Seleccioná la región destino.')
      return
    }
    if (scopeTarget === 'subsede' && !subsedeId) {
      setError('Seleccioná la subsede destino.')
      return
    }
    if (scopeTarget === 'station' && !stationId) {
      setError('Seleccioná el cuartel destino.')
      return
    }
    if (scopeTarget === 'profile' && !profileId) {
      setError('Seleccioná el usuario destino.')
      return
    }

    setSubmitting(true)
    try {
      await createNotification({
        type,
        title,
        body: body || null,
        region_id: scopeTarget === 'region' ? regionId : null,
        subsede_id: scopeTarget === 'subsede' ? subsedeId : null,
        station_id: scopeTarget === 'station' ? stationId : null,
        profile_id: scopeTarget === 'profile' ? profileId : null,
      })
      navigate('/notificaciones')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos crear la notificación.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Nueva Notificación">
      <h1 className="page-title">Nueva Notificación</h1>
      <p className="page-subtitle">Enviá un aviso institucional al alcance que corresponda.</p>

      <form onSubmit={handleSubmit} className="card-solid">
        <div className="field">
          <label>Tipo</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {NOTIFICATION_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={`btn ${type === option.value ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular N°12" />
        </div>

        <div className="field">
          <label htmlFor="body">Mensaje (opcional)</label>
          <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </div>

        <div className="field">
          <label>Alcance</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {NOTIF_SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScopeTarget(option.value)}
                className={`btn ${scopeTarget === option.value ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {scopeTarget === 'region' && (
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Seleccionar región</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'subsede' && (
            <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
              <option value="">Seleccionar subsede</option>
              {subsedes.map((subsede) => (
                <option key={subsede.id} value={subsede.id}>
                  {subsede.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'station' && (
            <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">Seleccionar cuartel</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'profile' && (
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Seleccionar usuario</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar notificación'}
        </button>
      </form>
    </AppShell>
  )
}
