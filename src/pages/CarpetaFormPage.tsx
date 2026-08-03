import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { createDocumentFolder } from '../lib/api/documents'
import type { Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

type FolderScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const FOLDER_SCOPE_OPTIONS: { value: FolderScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

// Mismo criterio de permisos que carga de documentos
// (documents_write_admin_regional_station / document_folders_write_admin_regional_station):
// informatica_r4/roles regionales cualquier alcance, roles de cuartel
// autorizados solo su propio cuartel.
export function CarpetaFormPage() {
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin, hasRole } = useAuth()
  const isRegionalRole = hasRole('secretario_regional', 'director_escuela')
  const isStationRole = hasRole('usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const canCreate = isAdmin || isRegionalRole || isStationRole

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scopeTarget, setScopeTarget] = useState<FolderScopeTarget>(isStationRole && !isAdmin && !isRegionalRole ? 'station' : 'region')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState(isStationRole && !isAdmin && !isRegionalRole ? currentProfile?.station_id ?? '' : '')
  const [profileId, setProfileId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stationLocked = isStationRole && !isAdmin && !isRegionalRole

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
        if (!stationLocked) setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [canCreate, stationLocked])

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
      await createDocumentFolder({
        name,
        description: description || null,
        region_id: scopeTarget === 'region' ? regionId : null,
        subsede_id: scopeTarget === 'subsede' ? subsedeId : null,
        station_id: scopeTarget === 'station' ? (stationLocked ? currentProfile?.station_id ?? null : stationId) : null,
        profile_id: scopeTarget === 'profile' ? profileId : null,
        created_by_profile_id: currentProfile?.id ?? null,
      })
      navigate('/documentos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear la carpeta.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canCreate) {
    return (
      <AppShell title="Documentos">
        <div className="empty-state">No tenés permisos para crear carpetas.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Nueva Carpeta">
      <h1 className="page-title">Nueva Carpeta</h1>
      <p className="page-subtitle">Organizá los documentos por tipo o destino.</p>

      <form onSubmit={handleSubmit} className="card-solid">
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Actas, Circulares, Manuales..." />
        </div>

        <div className="field">
          <label htmlFor="description">Descripción (opcional)</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        {!stationLocked && (
          <div className="field">
            <label>Alcance</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {FOLDER_SCOPE_OPTIONS.map((option) => (
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
        )}

        {stationLocked && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Esta carpeta va a quedar dentro de tu propio cuartel.
          </p>
        )}

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear carpeta'}
        </button>
      </form>
    </AppShell>
  )
}
