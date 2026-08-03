import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { createUserAccount } from '../lib/api/users'
import { ROLE_DEFINITIONS } from '../types/roles'
import type { RoleKey } from '../types/roles'
import type { Region, ScopeType, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

const SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'escuela', label: 'Escuela' },
  { value: 'system', label: 'Informática' },
]

const INFORMATICA_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica']

// Roles que un jefe_cuerpo_activo puede asignar al crear un usuario de su
// propio cuartel. Confirmado explícitamente: nunca jefe_cuerpo_activo (no
// puede crear otro con su mismo rol), nunca nada regional/escuela/informática.
// Espejo del mismo array server-side en
// supabase/functions/admin-create-user/index.ts — esto es solo para no
// mostrar opciones que el backend va a rechazar; la autorización real vive
// en la Edge Function.
const JEFE_CUERPO_ACTIVO_ASSIGNABLE_ROLES: RoleKey[] = [
  'presidente_cuartel',
  'usuario_carga_cuartel',
  'secretario_comision',
  'invitado',
]

export function UsuarioFormPage() {
  const navigate = useNavigate()
  const { profile: currentProfile, roles: currentRoles } = useAuth()

  const isInformatica = currentRoles.some((r) => INFORMATICA_ROLES.includes(r))
  const isDirectorEscuela = currentRoles.includes('director_escuela')
  const isJefeCuerpoActivo = !isInformatica && !isDirectorEscuela && currentRoles.includes('jefe_cuerpo_activo')

  // Roles que el usuario actual puede asignar al crear (misma matriz que
  // valida la Edge Function admin-create-user). informatica_r4/
  // integrante_informatica: todos. director_escuela: todos menos
  // informática. jefe_cuerpo_activo: solo el set fijo de roles de cuartel.
  const assignableRoles = useMemo(() => {
    if (isInformatica) return ROLE_DEFINITIONS
    if (isDirectorEscuela) return ROLE_DEFINITIONS.filter((r) => !INFORMATICA_ROLES.includes(r.key))
    if (isJefeCuerpoActivo) return ROLE_DEFINITIONS.filter((r) => JEFE_CUERPO_ACTIVO_ASSIGNABLE_ROLES.includes(r.key))
    return []
  }, [isInformatica, isDirectorEscuela, isJefeCuerpoActivo])

  const canCreateUsers = isInformatica || isDirectorEscuela || isJefeCuerpoActivo

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [rank, setRank] = useState('')
  const [regionId, setRegionId] = useState('')
  const [stationId, setStationId] = useState(isJefeCuerpoActivo ? currentProfile?.station_id ?? '' : '')
  const [selectedRoles, setSelectedRoles] = useState<RoleKey[]>([])

  const [scopeType, setScopeType] = useState<ScopeType>('station')
  const [scopeRegionId, setScopeRegionId] = useState('')
  const [scopeSubsedeId, setScopeSubsedeId] = useState('')
  const [scopeStationId, setScopeStationId] = useState(isJefeCuerpoActivo ? currentProfile?.station_id ?? '' : '')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  function handleGeneratePassword() {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    const generated = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
    setPassword(generated)
    setConfirmPassword(generated)
  }

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()]).then(
      ([regionsData, subsedesData, stationsData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        if (!isJefeCuerpoActivo) setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [isJefeCuerpoActivo])

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

    if (password.length < 8) {
      setError('La contraseña temporal debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      await createUserAccount({
        full_name: fullName,
        email,
        rank: rank || null,
        region_id: isJefeCuerpoActivo ? null : regionId || null,
        station_id: isJefeCuerpoActivo ? currentProfile?.station_id ?? null : stationId || null,
        password,
        roles: selectedRoles,
        scope: {
          scope_type: scopeType,
          region_id: scopeType === 'region' ? scopeRegionId || null : null,
          subsede_id: scopeType === 'subsede' ? scopeSubsedeId || null : null,
          station_id: scopeType === 'station' ? scopeStationId || null : null,
        },
      })

      setCreatedPassword(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear el usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canCreateUsers) {
    return (
      <AppShell title="Nuevo Usuario">
        <h1 className="page-title">Sin permiso</h1>
        <p className="page-subtitle">No tenés permiso para crear usuarios.</p>
      </AppShell>
    )
  }

  if (createdPassword) {
    return (
      <AppShell title="Nuevo Usuario">
        <h1 className="page-title">Usuario creado</h1>
        <p className="page-subtitle">
          La cuenta de <strong>{fullName}</strong> ({email}) ya está activa. Compartile esta
          contraseña temporal por un canal seguro (no queda guardada en ningún lado del sistema). El
          sistema le va a exigir cambiarla apenas ingrese, antes de poder usar cualquier otra
          pantalla:
        </p>
        <div className="card-solid" style={{ marginBottom: 20, wordBreak: 'break-all' }}>
          <code>{createdPassword}</code>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigator.clipboard.writeText(createdPassword)}
          >
            Copiar contraseña
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
        Cargá los datos institucionales. Se genera una contraseña temporal para que la persona
        ingrese por primera vez.
        {isJefeCuerpoActivo && ' Como Jefe de Cuerpo Activo, solo podés crear usuarios de tu propio cuartel.'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="password" style={{ marginBottom: 0 }}>
              Contraseña temporal
            </label>
            <button type="button" className="link-muted" style={{ fontSize: 12 }} onClick={handleGeneratePassword}>
              Generar automáticamente
            </button>
          </div>
          <input
            id="password"
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirmar contraseña</label>
          <input
            id="confirmPassword"
            type="text"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repetí la contraseña"
            autoComplete="new-password"
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
          El usuario deberá cambiar esta contraseña la primera vez que ingrese: no va a poder usar el
          resto del sistema hasta hacerlo.
        </p>

        {!isJefeCuerpoActivo && (
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
        )}

        {!isJefeCuerpoActivo && (
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
        )}

        <div className="field">
          <label>Alcance</label>
          {isJefeCuerpoActivo ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {stations.find((s) => s.id === currentProfile?.station_id)?.name ?? 'Tu cuartel'}
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="field">
          <label>Roles</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {assignableRoles.map((role) => (
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
          {submitting ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>
    </AppShell>
  )
}
