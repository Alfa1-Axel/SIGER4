import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import {
  addRole,
  addScope,
  fetchProfileWithRoles,
  removeRole,
  removeScope,
  setProfileActive,
  updateProfile,
} from '../lib/api/users'
import { ROLE_DEFINITIONS } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { Profile, Region, ScopeType, Station, Subsede, UserRole, UserScope } from '../types/database'

const SCOPE_LABEL: Record<ScopeType, string> = {
  system: 'Informática (Sistema)',
  region: 'Regional',
  subsede: 'Subsede',
  station: 'Cuartel',
  escuela: 'Escuela',
}

export function UsuarioDetallePage() {
  const { id } = useParams<{ id: string }>()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [scopes, setScopes] = useState<UserScope[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])

  const [fullName, setFullName] = useState('')
  const [rank, setRank] = useState('')
  const [regionId, setRegionId] = useState('')
  const [stationId, setStationId] = useState('')

  const [newScopeType, setNewScopeType] = useState<ScopeType>('station')
  const [newScopeStationId, setNewScopeStationId] = useState('')
  const [newScopeRegionId, setNewScopeRegionId] = useState('')
  const [newScopeSubsedeId, setNewScopeSubsedeId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!id) return
    const data = await fetchProfileWithRoles(id)
    if (!data) return
    setProfile(data.profile)
    setRoles(data.roles)
    setScopes(data.scopes)
    setFullName(data.profile.full_name)
    setRank(data.profile.rank ?? '')
    setRegionId(data.profile.region_id ?? '')
    setStationId(data.profile.station_id ?? '')
  }

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), id ? fetchProfileWithRoles(id) : null]).then(
      ([regionsData, subsedesData, stationsData, profileData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        if (profileData) {
          setProfile(profileData.profile)
          setRoles(profileData.roles)
          setScopes(profileData.scopes)
          setFullName(profileData.profile.full_name)
          setRank(profileData.profile.rank ?? '')
          setRegionId(profileData.profile.region_id ?? '')
          setStationId(profileData.profile.station_id ?? '')
        }
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [id])

  async function handleSaveBasics() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateProfile(id, {
        full_name: fullName,
        rank: rank || null,
        region_id: regionId || null,
        station_id: stationId || null,
      })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleRole(role: RoleKey) {
    if (!id) return
    setError(null)
    const existing = roles.find((r) => r.role === role)
    try {
      if (existing) {
        await removeRole(existing.id)
      } else {
        await addRole(id, role)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos actualizar el rol.')
    }
  }

  async function handleAddScope() {
    if (!id) return
    setError(null)
    try {
      await addScope(id, {
        scope_type: newScopeType,
        region_id: newScopeType === 'region' ? newScopeRegionId || null : null,
        subsede_id: newScopeType === 'subsede' ? newScopeSubsedeId || null : null,
        station_id: newScopeType === 'station' ? newScopeStationId || null : null,
      })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos agregar el alcance.')
    }
  }

  async function handleRemoveScope(scopeId: string) {
    setError(null)
    try {
      await removeScope(scopeId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos quitar el alcance.')
    }
  }

  async function handleToggleActive() {
    if (!id || !profile) return
    setError(null)
    try {
      await setProfileActive(id, !profile.is_active)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cambiar el estado del usuario.')
    }
  }

  if (loading) {
    return (
      <AppShell title="Usuario">
        <div className="empty-state">Cargando usuario…</div>
      </AppShell>
    )
  }

  if (!profile) {
    return (
      <AppShell title="Usuario">
        <div className="empty-state">No se encontró el usuario solicitado.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Usuario">
      <Link to="/usuarios" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Usuarios
      </Link>

      <h1 className="page-title">{profile.full_name}</h1>
      <p className="page-subtitle">{profile.email}</p>

      {!profile.auth_user_id && (
        <div className="card" style={{ marginBottom: 20 }}>
          <span className="badge badge-warning">Pendiente de activación</span>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Compartile este enlace para que complete su registro:
          </p>
          <div className="card-solid" style={{ wordBreak: 'break-all', marginTop: 8 }}>
            <code>{`${window.location.origin}/registro?email=${encodeURIComponent(profile.email)}`}</code>
          </div>
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div className="section-header">
        <h2 className="section-title">Datos básicos</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rank">Rango / Jerarquía</label>
          <input id="rank" value={rank} onChange={(e) => setRank(e.target.value)} />
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
          <label htmlFor="station">Cuartel</label>
          <select id="station" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Sin asignar</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveBasics}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <div className="section-header">
        <h2 className="section-title">Roles</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ROLE_DEFINITIONS.map((role) => {
            const active = roles.some((r) => r.role === role.key)
            return (
              <button
                key={role.key}
                type="button"
                onClick={() => handleToggleRole(role.key)}
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: 12 }}
                title={role.description}
              >
                {role.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="section-header">
        <h2 className="section-title">Alcances (scopes)</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        {scopes.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Sin alcances adicionales.</p>}
        {scopes.map((scope) => (
          <div
            key={scope.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}
          >
            <span style={{ fontSize: 13 }}>
              {SCOPE_LABEL[scope.scope_type]}
              {scope.station_id && ` · ${stations.find((s) => s.id === scope.station_id)?.name ?? scope.station_id}`}
              {scope.subsede_id && ` · ${subsedes.find((s) => s.id === scope.subsede_id)?.name ?? scope.subsede_id}`}
              {scope.region_id && ` · ${regions.find((r) => r.id === scope.region_id)?.name ?? scope.region_id}`}
            </span>
            <button type="button" className="btn btn-outlined" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleRemoveScope(scope.id)}>
              Quitar
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="scopeType">Tipo</label>
            <select id="scopeType" value={newScopeType} onChange={(e) => setNewScopeType(e.target.value as ScopeType)}>
              <option value="system">Informática (Sistema)</option>
              <option value="region">Regional</option>
              <option value="subsede">Subsede</option>
              <option value="station">Cuartel</option>
              <option value="escuela">Escuela</option>
            </select>
          </div>
          {newScopeType === 'subsede' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="scopeSubsede">Subsede</label>
              <select id="scopeSubsede" value={newScopeSubsedeId} onChange={(e) => setNewScopeSubsedeId(e.target.value)}>
                <option value="">Seleccionar</option>
                {subsedes.map((subsede) => (
                  <option key={subsede.id} value={subsede.id}>
                    {subsede.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {newScopeType === 'station' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="scopeStation">Cuartel</label>
              <select id="scopeStation" value={newScopeStationId} onChange={(e) => setNewScopeStationId(e.target.value)}>
                <option value="">Seleccionar</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {newScopeType === 'region' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="scopeRegion">Región</label>
              <select id="scopeRegion" value={newScopeRegionId} onChange={(e) => setNewScopeRegionId(e.target.value)}>
                <option value="">Seleccionar</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={handleAddScope}>
            Agregar alcance
          </button>
        </div>
      </div>

      <button type="button" className={`btn ${profile.is_active ? 'btn-outlined' : 'btn-primary'} btn-block`} onClick={handleToggleActive}>
        {profile.is_active ? 'Desactivar usuario' : 'Reactivar usuario'}
      </button>
    </AppShell>
  )
}
