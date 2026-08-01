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
import { useAuth } from '../hooks/useAuth'

const SCOPE_LABEL: Record<ScopeType, string> = {
  system: 'Informática (Sistema)',
  region: 'Regional',
  subsede: 'Subsede',
  station: 'Cuartel',
  escuela: 'Escuela',
}

export function UsuarioDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentProfile, hasRole: currentHasRole } = useAuth()
  const isCurrentUserSuperAdmin = currentHasRole('informatica_r4')

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

  // Refleja en la UI las mismas protecciones que ya aplica la base de datos
  // (migración 0018): nadie salvo otro informatica_r4 puede tocar los
  // roles/alcances de un informatica_r4 existente, y nadie puede cambiar su
  // propio cuartel/región salvo que sea informatica_r4. Mostrarlo en la UI
  // evita que alguien complete el formulario entero y recién se entere del
  // bloqueo con un error crudo de Postgres al guardar.
  const targetIsSuperAdmin = roles.some((r) => r.role === 'informatica_r4')
  const rolesScopesLocked = targetIsSuperAdmin && !isCurrentUserSuperAdmin
  const isEditingSelf = currentProfile?.id === profile.id
  const scopeFieldsLocked = isEditingSelf && !isCurrentUserSuperAdmin

  return (
    <AppShell title="Usuario">
      <Link to="/usuarios" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Usuarios
      </Link>

      <h1 className="page-title">{profile.full_name}</h1>
      <p className="page-subtitle">{profile.email}</p>

      {!profile.auth_user_id && (
        <div className="card" style={{ marginBottom: 20 }}>
          <span className="badge badge-warning">Sin cuenta vinculada</span>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Este perfil quedó de un flujo de invitación retirado por seguridad y no tiene una cuenta
            de acceso vinculada. Creá un usuario nuevo con estos mismos datos desde "Nuevo usuario"
            y luego eliminá este perfil, o contactá al Dpto. de Informática si no estás seguro.
          </p>
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
          <select id="region" value={regionId} disabled={scopeFieldsLocked} onChange={(e) => setRegionId(e.target.value)}>
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
          <select id="station" value={stationId} disabled={scopeFieldsLocked} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Sin asignar</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </div>
        {scopeFieldsLocked && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 12 }}>
            No podés cambiar tu propio cuartel o región. Pedile a un administrador que lo haga.
          </p>
        )}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveBasics}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <div className="section-header">
        <h2 className="section-title">Roles</h2>
      </div>
      <div className="card-solid" style={{ marginBottom: 20 }}>
        {rolesScopesLocked && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Este usuario es Informática R4 (superadmin). Solo otro Informática R4 puede modificar sus roles.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ROLE_DEFINITIONS.map((role) => {
            const active = roles.some((r) => r.role === role.key)
            return (
              <button
                key={role.key}
                type="button"
                disabled={rolesScopesLocked}
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
        {rolesScopesLocked && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Este usuario es Informática R4 (superadmin). Solo otro Informática R4 puede modificar sus alcances.
          </p>
        )}
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
            <button
              type="button"
              className="btn btn-outlined"
              style={{ padding: '4px 10px', fontSize: 12 }}
              disabled={rolesScopesLocked}
              onClick={() => handleRemoveScope(scope.id)}
            >
              Quitar
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="scopeType">Tipo</label>
            <select
              id="scopeType"
              value={newScopeType}
              disabled={rolesScopesLocked}
              onChange={(e) => setNewScopeType(e.target.value as ScopeType)}
            >
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
          <button type="button" className="btn btn-primary" disabled={rolesScopesLocked} onClick={handleAddScope}>
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
