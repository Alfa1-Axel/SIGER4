import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { ImagePicker } from '../components/ui/ImagePicker'
import { useAuth } from '../hooks/useAuth'
import { ROLE_DEFINITIONS } from '../types/roles'
import { updateProfile } from '../lib/api/users'
import { uploadAvatar } from '../lib/api/storage'
import { supabase } from '../lib/supabaseClient'

export function AjustesPage() {
  const { profile, user, roles, signOut, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [position, setPosition] = useState(profile?.position ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setProfileError(null)
    setProfileSaved(false)
    setSavingProfile(true)
    try {
      let avatarUrl = profile.avatar_url
      if (avatarFile) {
        avatarUrl = await uploadAvatar(profile.id, avatarFile)
      }
      await updateProfile(profile.id, {
        full_name: fullName,
        phone: phone || null,
        position: position || null,
        avatar_url: avatarUrl,
      })
      await refreshProfile()
      setProfileSaved(true)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'No pudimos guardar tus datos.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)

    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña.')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <AppShell title="Mi Perfil">
      <h1 className="page-title">Mi Perfil</h1>
      <p className="page-subtitle">Tus datos personales, rol y alcance dentro del sistema.</p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="avatar" style={{ width: 48, height: 48 }} />
          ) : (
            <div className="btn btn-icon btn-inverted" style={{ width: 48, height: 48 }}>
              <Icon name="user" size={22} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700 }}>{profile?.full_name ?? 'Usuario'}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{user?.email}</div>
          </div>
        </div>

        {roles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="kpi-label" style={{ marginBottom: 6 }}>
              Roles asignados (no editable — solo un administrador puede cambiarlo)
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {roles.map((role) => {
                const def = ROLE_DEFINITIONS.find((r) => r.key === role)
                return (
                  <span key={role} className="badge badge-info">
                    {def?.label ?? role}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="section-header">
        <h2 className="section-title">Editar mis datos</h2>
      </div>
      <form onSubmit={handleSaveProfile} className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="phone">Teléfono (opcional)</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0351 4123456" />
        </div>

        <div className="field">
          <label htmlFor="position">Cargo o función (opcional)</label>
          <input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Jefe de Cuerpo Activo" />
        </div>

        <ImagePicker label="Foto de perfil (opcional)" currentUrl={profile?.avatar_url} onFileSelected={setAvatarFile} />
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
          La imagen se recorta automáticamente en formato cuadrado, centrada. Para mejores resultados, usá una foto
          donde tu rostro esté centrado.
        </p>

        {profile?.rank && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16 }}>
            Jerarquía: {profile.rank} · {profile.seniority_start_date && `Antigüedad desde ${new Date(profile.seniority_start_date).toLocaleDateString('es-AR')}`}
            {' '}(estos datos los administra el Dpto. de Informática y Estadística)
          </p>
        )}

        {profileError && <p className="field-error">{profileError}</p>}
        {profileSaved && <p style={{ fontSize: 12, color: 'var(--color-success, #16a34a)' }}>Datos guardados correctamente.</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={savingProfile}>
          {savingProfile ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <div className="section-header">
        <h2 className="section-title">Cambiar contraseña</h2>
      </div>
      <form onSubmit={handleChangePassword} className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="newPassword">Nueva contraseña</label>
          <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirmar contraseña</label>
          <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {passwordError && <p className="field-error">{passwordError}</p>}
        {passwordSaved && <p style={{ fontSize: 12, color: 'var(--color-success, #16a34a)' }}>Contraseña actualizada correctamente.</p>}

        <button type="submit" className="btn btn-outlined btn-block" disabled={changingPassword}>
          {changingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Institucional
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logos/logo-escuela.png" alt="Escuela Regional" style={{ height: 40, borderRadius: 8 }} />
          <img src="/logos/logo-informatica.png" alt="Dpto. Informática y Estadística R4" style={{ height: 40, borderRadius: 8 }} />
        </div>
      </div>

      <button type="button" className="btn btn-outlined btn-block" onClick={() => signOut()}>
        <Icon name="logout" size={16} />
        Cerrar sesión
      </button>
    </AppShell>
  )
}
