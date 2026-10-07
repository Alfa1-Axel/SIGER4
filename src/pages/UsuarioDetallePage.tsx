import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ContactLink } from '../components/ui/ContactLink'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import {
  addRole,
  addScope,
  deleteUserAccount,
  fetchProfileWithRoles,
  removeRole,
  removeScope,
  setProfileActive,
  updateProfile,
  updateUserAccount,
} from '../lib/api/users'
import { applyProfileDepartments, fetchCoordinatingProfileIds, fetchProfileDepartmentIds, fetchVisibleDepartments } from '../lib/api/departments'
import { DepartmentAssignmentPicker } from '../components/DepartmentAssignmentPicker'
import { RoleAssignmentsList } from '../components/RoleAssignmentsList'
import { buildRoleAssignments } from '../lib/roleAssignments'
import { DeleteUserConfirmModal } from '../components/ui/DeleteUserConfirmModal'
import { DEPARTMENT_ROLES, RETIRED_ROLE_DEFINITIONS, ROLE_DEFINITIONS, SCHOOL_AVALES_ROLES } from '../types/roles'
import { RoleGroupedPicker } from '../components/RoleGroupedPicker'
import type { RoleKey } from '../types/roles'
import type { Profile, Region, ScopeType, Station, Subsede, UserRole, UserScope, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const SCOPE_LABEL: Record<ScopeType, string> = {
  system: 'Informática (Sistema)',
  region: 'Regional',
  subsede: 'Subsede',
  station: 'Cuartel',
  escuela: 'Escuela',
}

// Roles que jefe_cuerpo_activo nunca puede ver/editar en este formulario, ni
// siquiera de su propio cuartel (mismo PRIVILEGED_TARGET_ROLES que valida
// server-side supabase/functions/admin-update-user/index.ts). Incluye los
// roles de Avales regionales: si no, un jefe_cuerpo_activo podría resetear la
// contraseña de un usuario de Escuela de su cuartel y entrar a los avales.
// Lo mismo vale para quien coordina un departamento (ver
// coordinatedDepartments más abajo).
const PRIVILEGED_TARGET_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica', 'director_escuela', 'instructor', 'secretario_regional', ...SCHOOL_AVALES_ROLES]

export function UsuarioDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile: currentProfile, hasRole: currentHasRole, isAdmin } = useAuth()
  const isCurrentUserSuperAdmin = currentHasRole('informatica_r4')
  // jefe_cuerpo_activo entra a esta pantalla (ver UserManagerRoute) pero con
  // autoridad muy acotada: solo usuarios de su propio cuartel, sin roles
  // privilegiados, y sin tocar roles/alcance/cuartel/región (esos campos ni
  // se muestran). admin-update-user es la fuente real de esta autorización;
  // esto solo evita mostrar una UI que el backend va a rechazar igual.
  const isJefeCuerpoActivo = !isAdmin && currentHasRole('jefe_cuerpo_activo')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [scopes, setScopes] = useState<UserScope[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  // Departamentos: el de Informática edita coordinación e integración; el Jefe
  // de Cuerpo Activo solo necesita saber si coordina alguno (no lo gestiona).
  const [allDepartments, setAllDepartments] = useState<VisibleDepartment[]>([])
  const [departmentIds, setDepartmentIds] = useState<{ coordinated: string[]; memberOf: string[] }>({ coordinated: [], memberOf: [] })
  const [departmentDraft, setDepartmentDraft] = useState<{ coordinates: string[]; memberOf: string[] }>({ coordinates: [], memberOf: [] })
  const [savingDepartments, setSavingDepartments] = useState(false)
  const [departmentsSaved, setDepartmentsSaved] = useState(false)
  const [targetCoordinates, setTargetCoordinates] = useState(false)

  const [fullName, setFullName] = useState('')
  const [rank, setRank] = useState('')
  const [regionId, setRegionId] = useState('')
  const [stationId, setStationId] = useState('')
  const [email, setEmail] = useState('')

  const [newScopeType, setNewScopeType] = useState<ScopeType>('station')
  const [newScopeStationId, setNewScopeStationId] = useState('')
  const [newScopeRegionId, setNewScopeRegionId] = useState('')
  const [newScopeSubsedeId, setNewScopeSubsedeId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [basicsSaved, setBasicsSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [passwordResetDone, setPasswordResetDone] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [resettingMustChangePassword, setResettingMustChangePassword] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function loadDepartments(profileId: string) {
    if (isAdmin) {
      const [ids, visible] = await Promise.all([fetchProfileDepartmentIds(profileId), fetchVisibleDepartments()])
      setDepartmentIds(ids)
      setDepartmentDraft({ coordinates: ids.coordinated, memberOf: ids.memberOf })
      setAllDepartments(visible)
      setTargetCoordinates(ids.coordinated.length > 0)
    } else if (isJefeCuerpoActivo) {
      // Si no se puede verificar, se trata como coordinador: la pantalla no
      // ofrece gestionarlo (admin-update-user lo rechazaría igual).
      const ids = await fetchCoordinatingProfileIds([profileId]).catch(() => [profileId])
      setTargetCoordinates(ids.length > 0)
    }
  }

  async function reload() {
    if (!id) return
    const [data] = await Promise.all([fetchProfileWithRoles(id), loadDepartments(id).catch(() => undefined)])
    if (!data) return
    setProfile(data.profile)
    setRoles(data.roles)
    setScopes(data.scopes)
    setFullName(data.profile.full_name)
    setRank(data.profile.rank ?? '')
    setRegionId(data.profile.region_id ?? '')
    setStationId(data.profile.station_id ?? '')
    setEmail(data.profile.email)
  }

  useEffect(() => {
    let active = true
    Promise.all([
      fetchRegions(),
      fetchSubsedes(),
      fetchStations(),
      id ? fetchProfileWithRoles(id) : null,
      id ? loadDepartments(id).catch(() => undefined) : undefined,
    ]).then(
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
          setEmail(profileData.profile.email)
        }
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
    // loadDepartments depende de isAdmin/isJefeCuerpoActivo, que no cambian
    // mientras la pantalla está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleSaveDepartments() {
    if (!id) return
    setError(null)
    // Sin departamentos se le quita el rol de departamento: no puede quedar
    // sin ningún rol.
    const otherRoles = roles.filter((r) => !DEPARTMENT_ROLES.includes(r.role))
    if (otherRoles.length === 0 && departmentDraft.coordinates.length === 0 && departmentDraft.memberOf.length === 0) {
      setError('Su único rol es de departamento: dejale al menos un departamento, o asignale otro rol antes de sacarlo de todos.')
      return
    }
    setSavingDepartments(true)
    setDepartmentsSaved(false)
    try {
      await applyProfileDepartments(id, departmentIds, { coordinated: departmentDraft.coordinates, memberOf: departmentDraft.memberOf })
      // La base agrega o quita los roles de departamento (0106): se recargan.
      await reload()
      setDepartmentsSaved(true)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar los departamentos.'))
      await loadDepartments(id).catch(() => undefined)
    } finally {
      setSavingDepartments(false)
    }
  }

  async function handleSaveBasics() {
    if (!id) return
    setSaving(true)
    setError(null)
    setBasicsSaved(false)
    try {
      if (isJefeCuerpoActivo) {
        // profiles_update_self/profiles_write_admin (RLS) no le dan a
        // jefe_cuerpo_activo escritura directa sobre el perfil de OTRO
        // usuario: tiene que pasar por admin-update-user, que sí lo autoriza
        // para nombre/rango dentro de su propio cuartel (nunca región/cuartel,
        // por eso esos dos campos ni se mandan acá).
        await updateUserAccount({ profile_id: id, full_name: fullName, rank: rank || null })
      } else {
        await updateProfile(id, {
          full_name: fullName,
          rank: rank || null,
          region_id: regionId || null,
          station_id: stationId || null,
        })
      }
      await reload()
      setBasicsSaved(true)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar los cambios.'))
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
      setError(describeSupabaseError(err, 'No pudimos actualizar el rol.'))
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
      setError(describeSupabaseError(err, 'No pudimos agregar el alcance.'))
    }
  }

  async function handleRemoveScope(scopeId: string) {
    setError(null)
    try {
      await removeScope(scopeId)
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos quitar el alcance.'))
    }
  }

  async function handleToggleActive() {
    if (!id || !profile) return
    setError(null)
    try {
      if (canManageAccount) {
        // informatica_r4/integrante_informatica/jefe_cuerpo_activo: además de
        // is_active, banea/desbanea la cuenta de Auth de verdad
        // (setProfileActive solo toca profiles.is_active, la sesión de Auth
        // seguiría siendo válida).
        await updateUserAccount({ profile_id: id, is_active: !profile.is_active })
      } else {
        await setProfileActive(id, !profile.is_active)
      }
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cambiar el estado del usuario.'))
    }
  }

  async function handleSaveEmail() {
    if (!id) return
    setError(null)
    setEmailSaved(false)
    setSavingEmail(true)
    try {
      await updateUserAccount({ profile_id: id, email })
      await reload()
      setEmailSaved(true)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cambiar el email.'))
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleResetPassword() {
    if (!id) return
    setError(null)
    setPasswordResetDone(false)
    if (newPassword.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.')
      return
    }
    setResettingPassword(true)
    try {
      // must_change_password=true de nuevo: la contraseña la eligió el
      // admin, no el usuario, mismo criterio que al crear la cuenta.
      await updateUserAccount({ profile_id: id, new_password: newPassword, must_change_password: true })
      setNewPassword('')
      await reload()
      setPasswordResetDone(true)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos cambiar la contraseña.'))
    } finally {
      setResettingPassword(false)
    }
  }

  async function handleResetMustChangePassword() {
    if (!id || !profile) return
    setError(null)
    setResettingMustChangePassword(true)
    try {
      await updateUserAccount({ profile_id: id, must_change_password: !profile.must_change_password })
      await reload()
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos actualizar el estado de cambio de contraseña.'))
    } finally {
      setResettingMustChangePassword(false)
    }
  }

  async function handleDeleteUser() {
    if (!id) return
    await deleteUserAccount(id)
    setShowDeleteConfirm(false)
    navigate('/usuarios')
  }

  if (loading) {
    return (
      <AppShell title="Usuario">
        <div className="loading-state" role="status">Cargando usuario…</div>
      </AppShell>
    )
  }

  if (!profile) {
    return (
      <AppShell title="Usuario">
        <div className="empty-state">No encontramos a ese usuario. Puede que lo hayan eliminado.</div>
      </AppShell>
    )
  }

  // jefe_cuerpo_activo: bloqueo de UI espejo del que ya aplica
  // admin-update-user server-side — usuarios de otro cuartel, o con un rol
  // privilegiado (informática/regional/escuela), ni siquiera se muestran.
  if (isJefeCuerpoActivo) {
    const targetHasPrivilegedRole = roles.some((r) => PRIVILEGED_TARGET_ROLES.includes(r.role)) || targetCoordinates
    const targetIsOwnStation = !!currentProfile?.station_id && profile.station_id === currentProfile.station_id
    if (!targetIsOwnStation || targetHasPrivilegedRole) {
      return (
        <AppShell title="Usuario">
          <div className="empty-state">No tenés permiso para ver este usuario.</div>
        </AppShell>
      )
    }
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
  // jefe_cuerpo_activo nunca ve roles/alcances/región/cuartel del formulario
  // (backend los rechaza directo — ver admin-update-user), y su bloque de
  // "cuenta" (email/contraseña/forzar cambio) usa la misma llamada
  // updateUserAccount que isAdmin pero limitada a datos no sensibles.
  const canManageAccount = isAdmin || isJefeCuerpoActivo

  // Cada rol con su división, en lenguaje de todos los días.
  const assignments = buildRoleAssignments({
    roles: roles.map((r) => r.role),
    profileStationId: profile.station_id,
    profileRegionId: profile.region_id,
    scopes,
    coordinated: allDepartments.filter((d) => departmentIds.coordinated.includes(d.id)),
    memberOf: allDepartments.filter((d) => departmentIds.memberOf.includes(d.id)),
    stationName: (sid) => stations.find((s) => s.id === sid)?.name ?? null,
    regionName: (rid) => regions.find((r) => r.id === rid)?.name ?? null,
    subsedeName: (sid) => subsedes.find((s) => s.id === sid)?.name ?? null,
  })
  const departmentsChanged =
    [...departmentDraft.coordinates].sort().join() !== [...departmentIds.coordinated].sort().join() ||
    [...departmentDraft.memberOf].sort().join() !== [...departmentIds.memberOf].sort().join()

  return (
    <AppShell title="Usuario">
      <Link to="/usuarios" className="back-link">
        ← Volver a Usuarios
      </Link>

      <h1 className="page-title">{profile.full_name}</h1>
      <div className="contact-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <ContactLink kind="email" value={profile.email} />
        {profile.phone && <ContactLink kind="phone" value={profile.phone} />}
      </div>

      {!profile.auth_user_id && (
        <div className="card" style={{ marginBottom: 20 }}>
          <span className="badge badge-warning">Sin cuenta vinculada</span>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Este perfil quedó de un flujo de invitación retirado por seguridad y no tiene una cuenta
            de acceso vinculada. Creá un usuario nuevo con estos mismos datos desde "Nuevo usuario"
            y luego eliminá este perfil, o consultá a Informática y Estadística si no estás seguro.
          </p>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">{error}</div>
      )}

      {isAdmin && (
        <div className="card-solid" style={{ marginBottom: 20 }}>
          <div className="kpi-label" style={{ marginBottom: 8 }}>
            Roles y dónde aplican
          </div>
          <RoleAssignmentsList assignments={assignments} />
          {assignments.some((a) => a.missing) && (
            <p className="field-help" style={{ marginTop: 8 }}>
              Un rol sin su división no ve los datos que le corresponden: asignale el cuartel o la Regional en Datos básicos.
            </p>
          )}
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
        {!isJefeCuerpoActivo && (
          <>
            <div className="field">
              <label htmlFor="region">Regional</label>
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
                No podés cambiar tu propio cuartel o Regional. Consultá a Informática y Estadística.
              </p>
            )}
          </>
        )}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveBasics}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {basicsSaved && (
          <p className="field-help" role="status" style={{ color: 'var(--color-success)', marginTop: 8 }}>
            Datos guardados.
          </p>
        )}
      </div>

      {isAdmin && (
        <>
          <div className="section-header">
            <h2 className="section-title">Email</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <div className="field">
              <label htmlFor="email">Email institucional</label>
              <input id="email" type="email" value={email} disabled={rolesScopesLocked} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {emailSaved && <p style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 8 }}>Email actualizado.</p>}
            <button type="button" className="btn btn-primary" disabled={savingEmail || rolesScopesLocked} onClick={handleSaveEmail}>
              {savingEmail ? 'Guardando…' : 'Cambiar email'}
            </button>
          </div>
        </>
      )}

      {canManageAccount && (
        <>
          <div className="section-header">
            <h2 className="section-title">Contraseña</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <div className="field">
              <label htmlFor="newPassword">Nueva contraseña temporal</label>
              <input
                id="newPassword"
                type="text"
                minLength={8}
                disabled={rolesScopesLocked}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 12 }}>
              El usuario deberá cambiar esta contraseña la próxima vez que ingrese.
            </p>
            {passwordResetDone && <p style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 8 }}>Contraseña actualizada.</p>}
            <button type="button" className="btn btn-primary" disabled={resettingPassword || rolesScopesLocked || !newPassword} onClick={handleResetPassword}>
              {resettingPassword ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>

          <div className="section-header">
            <h2 className="section-title">Cambio de contraseña obligatorio</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              {profile.must_change_password
                ? 'Este usuario todavía no cambió su contraseña temporal: no puede usar el resto del sistema hasta hacerlo.'
                : 'Este usuario ya cambió su contraseña y no tiene ninguna restricción pendiente.'}
            </p>
            <button
              type="button"
              className={`btn ${profile.must_change_password ? 'btn-outlined' : 'btn-primary'}`}
              disabled={resettingMustChangePassword || rolesScopesLocked}
              onClick={handleResetMustChangePassword}
            >
              {resettingMustChangePassword
                ? 'Guardando…'
                : profile.must_change_password
                  ? 'Quitar la obligación de cambiar contraseña'
                  : 'Forzar cambio de contraseña en el próximo ingreso'}
            </button>
          </div>
        </>
      )}

      {isAdmin && (
        <>
          <div className="section-header">
            <h2 className="section-title">Roles</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            {rolesScopesLocked && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                Este usuario es Informática R4 (superadmin). Solo otro Informática R4 puede modificar sus roles.
              </p>
            )}
            {/* Roles retirados (ej. administrativo) solo aparecen si este usuario
                todavía los tiene, para poder identificarlos y quitarlos. */}
            <RoleGroupedPicker
              roles={[...ROLE_DEFINITIONS, ...RETIRED_ROLE_DEFINITIONS.filter((def) => roles.some((r) => r.role === def.key))]}
              selected={roles.map((r) => r.role)}
              onToggle={handleToggleRole}
              disabled={rolesScopesLocked}
              lockedRoles={DEPARTMENT_ROLES}
              lockedNote="Se asigna eligiendo sus departamentos, en la sección Departamentos."
            />
          </div>

          <div className="section-header">
            <h2 className="section-title">Departamentos</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 0 }}>
              Elegí si es Coordinador o Miembro en cada departamento: al guardar se le asigna el rol Coordinador o Miembro de
              Departamento, y se le quita si deja de estar en todos (salvo que sea su único rol). Ve solo esos departamentos: miembros,
              informes, actas, eventos y avisos. El coordinador también ve y sube los avales de su departamento en Escuela.
            </p>
            {allDepartments.length === 0 ? (
              <p style={{ margin: 0 }}>Todavía no hay departamentos cargados.</p>
            ) : (
              <DepartmentAssignmentPicker
                departments={allDepartments}
                coordinates={departmentDraft.coordinates}
                memberOf={departmentDraft.memberOf}
                profileId={profile.id}
                disabled={savingDepartments}
                onChange={(next) => {
                  setDepartmentsSaved(false)
                  setDepartmentDraft(next)
                }}
              />
            )}
            {allDepartments.length > 0 && (
              <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} disabled={!departmentsChanged || savingDepartments} onClick={handleSaveDepartments}>
                {savingDepartments ? 'Guardando…' : 'Guardar departamentos'}
              </button>
            )}
            {departmentsSaved && (
              <p className="field-help" role="status" style={{ color: 'var(--color-success)', marginTop: 8 }}>
                Departamentos guardados.
              </p>
            )}
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
                <span style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {SCOPE_LABEL[scope.scope_type]}
                  {scope.station_id && ` · ${stations.find((s) => s.id === scope.station_id)?.name ?? 'Cuartel no disponible'}`}
                  {scope.subsede_id && ` · ${subsedes.find((s) => s.id === scope.subsede_id)?.name ?? 'Subsede no disponible'}`}
                  {scope.region_id && ` · ${regions.find((r) => r.id === scope.region_id)?.name ?? 'Regional no disponible'}`}
                </span>
                <button
                  type="button"
                  className="btn btn-outlined btn-sm" style={{ flexShrink: 0 }}
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
                  <label htmlFor="scopeRegion">Regional</label>
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
        </>
      )}

      <button type="button" className={`btn ${profile.is_active ? 'btn-outlined' : 'btn-primary'} btn-block`} onClick={handleToggleActive}>
        {profile.is_active ? 'Desactivar usuario' : 'Reactivar usuario'}
      </button>

      {isCurrentUserSuperAdmin && !isEditingSelf && (
        <>
          <div className="section-header" style={{ marginTop: 24 }}>
            <h2 className="section-title">Zona de riesgo</h2>
          </div>
          <div className="card-solid" style={{ marginBottom: 20, borderColor: 'var(--color-danger-border)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Elimina la cuenta de acceso, el perfil, los roles y los alcances de este usuario. No se puede deshacer. Los
              registros institucionales (auditoría, documentos, informes, etc.) que lo referencian se preservan, sin el
              vínculo al usuario borrado.
            </p>
            <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setShowDeleteConfirm(true)}>
              Eliminar usuario
            </button>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <DeleteUserConfirmModal
          fullName={profile.full_name}
          onConfirm={handleDeleteUser}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </AppShell>
  )
}
