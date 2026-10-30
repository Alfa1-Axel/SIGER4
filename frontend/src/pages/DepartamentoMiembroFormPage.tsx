import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { DepartmentChecklist } from '../components/DepartmentChecklist'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { createUserAccount } from '../lib/api/users'
import type { VisibleDepartment } from '../types/database'
import { describeSupabaseError } from '../lib/api/errors'

// Alta de un Miembro de Departamento por el Coordinador de su departamento (v1.17.0, migración 0120 y
// Edge Function admin-create-user). La pantalla solo ofrece lo permitido: el rol es fijo (Miembro de
// Departamento) y los departamentos son los que coordina. La autorización real la comprueba el servidor
// (la función, la base y la RLS): un pedido armado a mano con otro rol o con otro departamento se rechaza.
export function DepartamentoMiembroFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [loadingDepartments, setLoadingDepartments] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [rank, setRank] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; email: string; password: string; departments: string[] } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    fetchVisibleDepartments()
      .then((all) => {
        if (!active) return
        // Solo los que coordina y están activos: son los únicos en los que puede dar de alta.
        const mine = all.filter((d) => d.my_relation === 'coordinador' && d.is_active)
        setDepartments(mine)
        const wanted = searchParams.get('departamento')
        if (mine.length === 1) setSelected([mine[0].id])
        else if (wanted && mine.some((d) => d.id === wanted)) setSelected([wanted])
      })
      .catch((err) => active && setLoadError(describeSupabaseError(err, 'No pudimos cargar tus departamentos. Reintentá en unos segundos.')))
      .finally(() => active && setLoadingDepartments(false))
    return () => {
      active = false
    }
  }, [searchParams])

  function handleGeneratePassword() {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    const generated = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
    setPassword(generated)
    setConfirmPassword(generated)
  }

  const departmentsError = submitted && selected.length === 0 ? 'Elegí al menos un departamento.' : undefined
  const selectedNames = departments.filter((d) => selected.includes(d.id)).map((d) => d.name)

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
    if (selected.length === 0) {
      setError('Elegí al menos un departamento (paso 2).')
      return
    }
    if (password.length < 8) {
      setError('La contraseña temporal debe tener al menos 8 caracteres (paso 3).')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden (paso 3).')
      return
    }

    setSubmitting(true)
    try {
      await createUserAccount({
        full_name: fullName.trim(),
        email: email.trim(),
        rank: rank.trim() || null,
        password,
        // Rol fijo y departamentos elegidos: el servidor decide la Regional, el alcance y que no tenga cuartel.
        roles: ['miembro_departamento'],
        department_ids: selected,
      })
      setCreated({ name: fullName.trim(), email: email.trim(), password, departments: selectedNames })
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos crear el usuario.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (loadingDepartments) {
    return (
      <AppShell title="Nuevo miembro">
        <div className="loading-state" role="status">
          Cargando tus departamentos…
        </div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell title="Nuevo miembro">
        <div className="alert alert-danger" role="alert">
          {loadError}
        </div>
      </AppShell>
    )
  }

  if (departments.length === 0) {
    return (
      <AppShell title="Nuevo miembro">
        <AccessDenied
          title="No podés dar de alta miembros"
          message="Esta opción es para quien coordina un departamento activo. Si coordinás uno y no te aparece, pedile a Informática y Estadística que revise tu asignación."
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  if (created) {
    return (
      <AppShell title="Nuevo miembro">
        <h1 className="page-title">Miembro creado</h1>
        <p className="page-subtitle">
          La cuenta de <strong>{created.name}</strong> ({created.email}) ya está activa como Miembro de Departamento en{' '}
          <strong>{created.departments.join(', ')}</strong>. Compartile esta contraseña temporal por un canal seguro (no queda guardada en ningún lado del
          sistema). El sistema le va a exigir cambiarla apenas ingrese.
        </p>
        <div className="card-solid" style={{ marginBottom: 20, wordBreak: 'break-all' }}>
          <code>{created.password}</code>
        </div>
        <p className="field-help" style={{ marginBottom: 20 }}>
          Para modificar datos de usuario o la contraseña más adelante, consultá a Informática y Estadística.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => copyPassword(created.password)}>
            {copied ? 'Contraseña copiada' : 'Copiar contraseña'}
          </button>
          <button type="button" className="btn btn-outlined" onClick={() => navigate(`/departamentos/${selected[0]}#miembros`)}>
            Volver al departamento
          </button>
        </div>
      </AppShell>
    )
  }

  const single = departments.length === 1

  return (
    <AppShell title="Nuevo miembro">
      <Link to={single ? `/departamentos/${departments[0].id}#miembros` : '/departamentos?todos=1'} className="back-link">
        ← Volver a {single ? departments[0].name : 'Departamentos'}
      </Link>
      <h1 className="page-title">Nuevo miembro</h1>
      <p className="page-subtitle">
        Dá de alta a una persona nueva en {single ? 'tu departamento' : 'tus departamentos'}. La persona entra con una contraseña temporal y el sistema le pide cambiarla.
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <fieldset className="form-section">
          <legend className="form-section-title">1. Datos de la persona</legend>
          <p className="form-section-help">Nombre y email con los que va a figurar en SIGER4.</p>
          <div className="field">
            <label htmlFor="fullName">Nombre completo</label>
            <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre Apellido" autoComplete="off" />
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
            <input id="rank" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Bombero, Oficial, etc." maxLength={100} />
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">2. Departamento</legend>
          <p className="form-section-help">
            Este usuario se creará como <strong>Miembro de Departamento</strong> y solo tendrá acceso {single ? 'a este departamento' : 'a los departamentos que elijas'}.
          </p>
          {single ? (
            <div className="field">
              <span className="field-label">Departamento</span>
              <p style={{ margin: 0, fontWeight: 600 }}>{departments[0].name}</p>
            </div>
          ) : (
            <DepartmentChecklist
              id="departments"
              label="Departamentos"
              help="Elegí uno o más de los que coordinás."
              departments={departments}
              selected={selected}
              onChange={setSelected}
              error={departmentsError}
            />
          )}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">3. Acceso</legend>
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
            La persona deberá cambiar esta contraseña la primera vez que ingrese: no va a poder usar el resto del sistema hasta hacerlo.
          </p>
        </fieldset>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear miembro'}
        </button>
        <p className="field-help" style={{ marginTop: 12 }}>
          Una vez creado, para modificar sus datos o su contraseña consultá a Informática y Estadística.
        </p>
      </form>
    </AppShell>
  )
}
