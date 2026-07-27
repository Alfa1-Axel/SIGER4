import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { addRole, addScope, inviteProfile } from '../lib/api/users'
import { ROLE_DEFINITIONS } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { Region, ScopeType, Station, Subsede } from '../types/database'

const SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'escuela', label: 'Escuela' },
  { value: 'system', label: 'Informática' },
]

export function UsuarioFormPage() {
  const navigate = useNavigate()

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [rank, setRank] = useState('')
  const [regionId, setRegionId] = useState('')
  const [stationId, setStationId] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<RoleKey[]>([])

  const [scopeType, setScopeType] = useState<ScopeType>('station')
  const [scopeRegionId, setScopeRegionId] = useState('')
  const [scopeSubsedeId, setScopeSubsedeId] = useState('')
  const [scopeStationId, setScopeStationId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()]).then(
      ([regionsData, subsedesData, stationsData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [])

  function toggleRole(role: RoleKey) {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (selectedRoles.length === 0) {
      setError('Seleccioná al menos un rol para el usuario.')
      return
    }

    if (scopeType === 'region' && !scopeRegionId) {
      setError('Seleccioná la región del alcance.')
      return
    }
    if (scopeType === 'subsede' && !scopeSubsedeId) {
      setError('Seleccioná la subsede del alcance.')
      return
    }
    if (scopeType === 'station' && !scopeStationId) {
      setError('Seleccioná el cuartel del alcance.')
      return
    }

    setSubmitting(true)
    try {
      const profile = await inviteProfile({
        full_name: fullName,
        email,
        rank: rank || null,
        region_id: regionId || null,
        station_id: stationId || null,
      })

      await Promise.all(selectedRoles.map((role) => addRole(profile.id, role)))

      await addScope(profile.id, {
        scope_type: scopeType,
        region_id: scopeType === 'region' ? scopeRegionId || null : null,
        subsede_id: scopeType === 'subsede' ? scopeSubsedeId || null : null,
        station_id: scopeType === 'station' ? scopeStationId || null : null,
      })

      const link = `${window.location.origin}/registro?email=${encodeURIComponent(email)}`
      setInviteLink(link)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos invitar al usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  if (inviteLink) {
    return (
      <AppShell title="Nuevo Usuario">
        <h1 className="page-title">Usuario invitado</h1>
        <p className="page-subtitle">
          El perfil de <strong>{fullName}</strong> ya está creado. Compartile este enlace para que
          active su cuenta eligiendo su propia contraseña:
        </p>
        <div className="card-solid" style={{ marginBottom: 20, wordBreak: 'break-all' }}>
          <code>{inviteLink}</code>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigator.clipboard.writeText(inviteLink)}
          >
            Copiar enlace
          </button>
          <button type="button" className="btn btn-outlined" onClick={() => navigate('/usuarios')}>
            Volver al listado
          </button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Nuevo Usuario">
      <h1 className="page-title">Nuevo Usuario</h1>
      <p className="page-subtitle">
        Cargá los datos institucionales. La persona activa su cuenta eligiendo su propia contraseña.
      </p>

      <form onSubmit={handleSubmit} className="card-solid">
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre Apellido" />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@bomberos.gob.ar"
          />
        </div>

        <div className="field">
          <label htmlFor="rank">Rango / Jerarquía (opcional)</label>
          <input id="rank" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Bombero, Oficial, etc." />
        </div>

        <div className="field">
          <label htmlFor="region">Región</label>
          <select id="region" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">Sin asignar</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="station">Cuartel (opcional)</label>
          <select id="station" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Sin asignar</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Alcance</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScopeType(option.value)}
                className={`btn ${scopeType === option.value ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {scopeType === 'region' && (
            <select value={scopeRegionId} onChange={(e) => setScopeRegionId(e.target.value)}>
              <option value="">Seleccionar región</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}

          {scopeType === 'subsede' && (
            <select value={scopeSubsedeId} onChange={(e) => setScopeSubsedeId(e.target.value)}>
              <option value="">Seleccionar subsede</option>
              {subsedes.map((subsede) => (
                <option key={subsede.id} value={subsede.id}>
                  {subsede.name}
                </option>
              ))}
            </select>
          )}

          {scopeType === 'station' && (
            <select value={scopeStationId} onChange={(e) => setScopeStationId(e.target.value)}>
              <option value="">Seleccionar cuartel</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label>Roles</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ROLE_DEFINITIONS.map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => toggleRole(role.key)}
                className={`btn ${selectedRoles.includes(role.key) ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: 12 }}
                title={role.description}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Invitando…' : 'Invitar usuario'}
        </button>
      </form>
    </AppShell>
  )
}
