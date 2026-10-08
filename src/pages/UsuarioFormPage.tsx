import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { RoleAssignmentsList } from '../components/RoleAssignmentsList'
import { DepartmentChecklist } from '../components/DepartmentChecklist'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { applyProfileDepartments, fetchVisibleDepartments } from '../lib/api/departments'
import { createUserAccount } from '../lib/api/users'
import { buildRoleAssignments } from '../lib/roleAssignments'
import { DEPARTMENT_ROLES, INFORMATICA_ONLY_ASSIGNABLE_ROLES, REGION_DIVISION_ROLES, ROLE_DEFINITIONS, STATION_DIVISION_ROLES } from '../types/roles'
import { RoleGroupedPicker } from '../components/RoleGroupedPicker'
import type { RoleKey } from '../types/roles'
import type { Region, ScopeType, Station, Subsede, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const INFORMATICA_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica']
const ESCUELA_ROLES: RoleKey[] = ['director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela']

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

// El alcance que se guarda en user_scopes sale de los roles elegidos: el
// más amplio manda. El cuartel y la Regional del perfil completan el resto
// (my_station_ids() y my_region_ids() los suman en la base). Quien solo
// tiene roles de departamento queda con alcance Regional: sus departamentos
// los da el rol + departamento, no el alcance.
function scopeTypeForRoles(roles: RoleKey[]): ScopeType {
  if (roles.some((r) => INFORMATICA_ROLES.includes(r))) return 'system'
  if (roles.includes('secretario_regional')) return 'region'
  if (roles.some((r) => ESCUELA_ROLES.includes(r))) return 'escuela'
  if (roles.length > 0 && roles.every((r) => DEPARTMENT_ROLES.includes(r))) return 'region'
  return 'station'
}

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
  // secretario de Escuela: esos los asigna solo Informática).
  // jefe_cuerpo_activo: solo el set fijo de roles de cuartel.
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
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [rank, setRank] = useState('')
  const [regionId, setRegionId] = useState('')
  const [stationId, setStationId] = useState(isJefeCuerpoActivo ? currentProfile?.station_id ?? '' : '')
  const [selectedRoles, setSelectedRoles] = useState<RoleKey[]>([])
  // Departamentos (solo Informática asigna coordinadores, 0097).
  const [coordinates, setCoordinates] = useState<string[]>([])
  const [memberOf, setMemberOf] = useState<string[]>([])

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [departmentsWarning, setDepartmentsWarning] = useState<string | null>(null)

  const needsStation = selectedRoles.some((r) => STATION_DIVISION_ROLES.includes(r))
  const isCoordinatorRole = selectedRoles.includes('coordinador_departamento')
  const isMemberRole = selectedRoles.includes('miembro_departamento')
  // Los roles de departamento son del nivel Regional: si no hay un rol de
  // cuartel, piden la Regional.
  const needsRegion = selectedRoles.some((r) => REGION_DIVISION_ROLES.includes(r)) || ((isCoordinatorRole || isMemberRole) && !needsStation)
  const scopeType = scopeTypeForRoles(selectedRoles)

  function handleGeneratePassword() {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    const generated = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
    setPassword(generated)
    setConfirmPassword(generated)
  }

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), isInformatica ? fetchVisibleDepartments().catch(() => []) : Promise.resolve([])]).then(
      ([regionsData, subsedesData, stationsData, departmentsData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setDepartments(departmentsData)
        if (!isJefeCuerpoActivo) setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [isJefeCuerpoActivo, isInformatica])

  function toggleRole(role: RoleKey) {
    const removing = selectedRoles.includes(role)
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
    // Sin el rol, sus departamentos no se asignan.
    if (removing && role === 'coordinador_departamento') setCoordinates([])
    if (removing && role === 'miembro_departamento') setMemberOf([])
  }

  const coordinatesError = submitted && isCoordinatorRole && coordinates.length === 0 ? 'Elegí al menos un departamento que coordine.' : undefined
  const memberOfError = submitted && isMemberRole && memberOf.length === 0 ? 'Elegí al menos un departamento del que sea miembro.' : undefined

  // Vista previa: cada rol con la división que va a tener.
  const preview = useMemo(
    () =>
      buildRoleAssignments({
        roles: selectedRoles,
        profileStationId: stationId || null,
        profileRegionId: isJefeCuerpoActivo ? null : regionId || null,
        scopes: [],
        coordinated: departments.filter((d) => coordinates.includes(d.id)),
        memberOf: departments.filter((d) => memberOf.includes(d.id)),
        stationName: (id) => stations.find((s) => s.id === id)?.name ?? null,
        regionName: (id) => regions.find((r) => r.id === id)?.name ?? null,
        subsedeName: (id) => subsedes.find((s) => s.id === id)?.name ?? null,
      }),
    [selectedRoles, stationId, regionId, isJefeCuerpoActivo, departments, coordinates, memberOf, stations, regions, subsedes],
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitted(true)

    if (!fullName.trim()) {
      setError('Falta el nombre completo (paso 1).')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Revisá el email (paso 1): es el usuario con el que la persona va a iniciar sesión.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña temporal debe tener al menos 8 caracteres (paso 2).')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden (paso 2).')
      return
    }
    if (selectedRoles.length === 0) {
      setError('Elegí al menos un rol (paso 3).')
      return
    }
    if (isCoordinatorRole && coordinates.length === 0) {
      setError('Coordinador de Departamento: elegí al menos un departamento que coordine (paso 3).')
      return
    }
    if (isMemberRole && memberOf.length === 0) {
      setError('Miembro de Departamento: elegí al menos un departamento del que sea miembro (paso 3).')
      return
    }
    if (needsStation && !stationId) {
      setError('Elegí el cuartel (paso 4): los roles de cuartel trabajan sobre un cuartel.')
      return
    }
    if (needsRegion && !regionId && !isJefeCuerpoActivo) {
      setError('Elegí la Regional (paso 4): el rol elegido trabaja sobre una Regional.')
      return
    }

    setSubmitting(true)
    try {
      const created = await createUserAccount({
        full_name: fullName.trim(),
        email: email.trim(),
        rank: rank || null,
        region_id: isJefeCuerpoActivo ? null : regionId || null,
        station_id: isJefeCuerpoActivo ? currentProfile?.station_id ?? null : stationId || null,
        password,
        roles: selectedRoles,
        scope: {
          scope_type: scopeType,
          region_id: scopeType === 'region' ? regionId || null : null,
          subsede_id: null,
          station_id: scopeType === 'station' ? (isJefeCuerpoActivo ? currentProfile?.station_id ?? null : stationId || null) : null,
        },
      })

      if (coordinates.length > 0 || memberOf.length > 0) {
        try {
          await applyProfileDepartments(created.id, { coordinated: [], memberOf: [] }, { coordinated: coordinates, memberOf })
        } catch (err) {
          setDepartmentsWarning(
            describeSupabaseError(err, 'La cuenta se creó, pero no pudimos asignar los departamentos. Asignalos desde la ficha del usuario.'),
          )
        }
      }
      setCreatedPassword(password)
    } catch (err) {
      const message = describeSupabaseError(err, 'No pudimos crear el usuario.')
      // admin-create-user sin los roles de departamento (falta desplegar la
      // versión de 0105): mejor decirlo que un "Rol inválido." a secas.
      setError(
        message === 'Rol inválido.' && (isCoordinatorRole || isMemberRole)
          ? 'El servicio de alta de usuarios todavía no tiene los roles de departamento: falta actualizar la función admin-create-user (DEPLOYMENT.md, sección 62).'
          : message,
      )
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
        {departmentsWarning && (
          <div className="alert alert-warning" role="alert">
            {departmentsWarning}
          </div>
        )}
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="kpi-label" style={{ marginBottom: 8 }}>
            Roles y dónde aplican
          </div>
          <RoleAssignmentsList assignments={preview} />
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
          <legend className="form-section-title">3. Roles</legend>
          <p className="form-section-help">
            Qué puede hacer. Elegí al menos uno: en el paso 4 te pedimos dónde aplica cada rol.
          </p>
          <div className="field">
            <RoleGroupedPicker roles={assignableRoles} selected={selectedRoles} onToggle={toggleRole} />
          </div>

          {isCoordinatorRole && (
            <DepartmentChecklist
              id="coordinates"
              label="Departamentos que coordina"
              help="Uno o más. Ve y gestiona solo estos departamentos."
              departments={departments}
              selected={coordinates}
              onChange={setCoordinates}
              forCoordinator
              error={coordinatesError}
            />
          )}
          {isMemberRole && (
            <DepartmentChecklist
              id="memberOf"
              label="Departamentos de los que es miembro"
              help="Uno o más. Ve y carga informes y eventos solo de estos departamentos."
              departments={departments}
              selected={memberOf}
              onChange={setMemberOf}
              error={memberOfError}
            />
          )}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">4. Dónde aplica</legend>
          <p className="form-section-help">
            {isJefeCuerpoActivo
              ? 'La cuenta queda en tu cuartel y ve solo la información de tu cuartel.'
              : 'La división de cada rol: el cuartel para los roles de cuartel y la Regional para los regionales. Informática y los roles de avales de Escuela no la necesitan.'}
          </p>

          {!isJefeCuerpoActivo && (
            <div className="field">
              <label htmlFor="region">Regional{needsRegion ? '' : ' (opcional)'}</label>
              <select id="region" value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-required={needsRegion}>
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
              <label htmlFor="station">Cuartel{needsStation ? '' : ' (opcional)'}</label>
              <select id="station" value={stationId} onChange={(e) => setStationId(e.target.value)} aria-required={needsStation}>
                <option value="">Sin asignar</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
              {needsStation && <p className="field-help">Los roles de cuartel solo ven y cargan datos de este cuartel.</p>}
            </div>
          )}

          {isJefeCuerpoActivo && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Cuartel: {stations.find((s) => s.id === currentProfile?.station_id)?.name ?? 'tu cuartel'}
            </p>
          )}

          {preview.length > 0 && (
            <div className="field">
              <span className="field-label">Así va a quedar</span>
              <RoleAssignmentsList assignments={preview} />
              <p className="field-help">Para sumar una subsede o más cuarteles, hacelo después desde la ficha del usuario.</p>
            </div>
          )}
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
