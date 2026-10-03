import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { createUserAccount } from '../lib/api/users'
import { INFORMATICA_ONLY_ASSIGNABLE_ROLES, ROLE_DEFINITIONS } from '../types/roles'
import { RoleGroupedPicker } from '../components/RoleGroupedPicker'
import type { RoleKey } from '../types/roles'
import type { Region, ScopeType, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

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
  // integrante_informatica: todos. director_escuela: todos menos los de
  // Informática y los que dan acceso a Avales regionales (coordinador/
  // secretario de Escuela, coordinador de departamento interno: esos los
  // asigna solo Informática). jefe_cuerpo_activo: solo el set fijo de roles
  // de cuartel.
  const assignableRoles = useMemo(() => {
    if (isInformatica) return ROLE_DEFINITIONS
    if (isDirectorEscuela) return ROLE_DEFINITIONS.filter((r) => !INFORMATICA_ONLY_ASSIGNABLE_ROLES.includes(r.key))
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

    if (!fullName.trim()) {
      setError('Falta el nombre completo (paso 1).')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Revisá el email (paso 1): es el usuario con el que la persona va a iniciar sesión.')
      return
    }
    if (selectedRoles.length === 0) {
      setError('Elegí al menos un rol (paso 4).')
      return
    }

    if (scopeType === 'region' && !scopeRegionId) {
      setError('Elegí la Regional del alcance (paso 3).')
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
        full_name: fullName.trim(),
        email: email.trim(),
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
      setError(describeSupabaseError(err, 'No pudimos crear el usuario.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canCreateUsers) {
    return (
      <AppShell title="Nuevo usuario">
        <AccessDenied
          title="No podés crear usuarios"
          message="Crean usuarios Informática, el Director de Escuela y el Jefe de Cuerpo Activo (solo para su cuartel). Si necesitás una cuenta nueva, pedísela a alguno de ellos."
        />
      </AppShell>
    )
  }

  if (createdPassword) {
    return (
      <AppShell title="Nuevo usuario">
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
    <AppShell title="Nuevo usuario">
      <Link to="/usuarios" className="back-link">
        ← Volver a Usuarios
      </Link>
      <h1 className="page-title">Nuevo usuario</h1>
      <p className="page-subtitle">
        Completá los cuatro pasos. La persona entra con una contraseña temporal y el sistema le pide cambiarla.
        {isJefeCuerpoActivo && ' Como Jefe de Cuerpo Activo, solo podés crear usuarios de tu propio cuartel.'}
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <fieldset className="form-section">
          <legend className="form-section-title">1. Datos de la persona</legend>
          <p className="form-section-help">Nombre y email con los que va a figurar en SIGER4.</p>
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
              autoComplete="off"
              aria-describedby="email-help"
            />
            <p id="email-help" className="field-help">
              Es el usuario para iniciar sesión.
            </p>
          </div>

          <div className="field">
            <label htmlFor="rank">Rango / Jerarquía (opcional)</label>
            <input id="rank" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Bombero, Oficial, etc." />
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">2. Acceso</legend>
          <p className="form-section-help">Contraseña temporal para el primer ingreso. Compartila por un canal seguro.</p>

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
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
            El usuario deberá cambiar esta contraseña la primera vez que ingrese: no va a poder usar el
            resto del sistema hasta hacerlo.
          </p>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">3. Ubicación y alcance</legend>
          <p className="form-section-help">
            {isJefeCuerpoActivo
              ? 'La cuenta queda en tu cuartel y ve solo la información de tu cuartel.'
              : 'Dónde está la persona y qué información puede ver: el alcance limita los datos que le muestra cada sección.'}
          </p>

          {!isJefeCuerpoActivo && (
            <div className="field">
              <label htmlFor="region">Regional</label>
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
            <span className="field-label">Alcance</span>
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
                      className="chip"
                      aria-pressed={scopeType === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {scopeType === 'region' && (
                  <select value={scopeRegionId} onChange={(e) => setScopeRegionId(e.target.value)}>
                    <option value="">Seleccionar Regional</option>
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

        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">4. Roles</legend>
          <p className="form-section-help">
            Qué puede hacer. Elegí al menos uno. Para que alguien coordine un departamento no hace falta un rol: se lo
            asigna en Departamentos.{' '}
            <Link to="/roles" className="link-muted">
              Ver qué permite cada rol
            </Link>
          </p>
          <div className="field">
            <RoleGroupedPicker roles={assignableRoles} selected={selectedRoles} onToggle={toggleRole} />
          </div>
        </fieldset>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>
    </AppShell>
  )
}
