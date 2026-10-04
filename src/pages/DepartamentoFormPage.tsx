import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { createDepartment, fetchDepartments } from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import type { Department, Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'

// Mismo criterio que el índice único de la base (0097): sin distinguir
// mayúsculas ni espacios de los extremos.
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function DepartamentoFormPage() {
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin } = useAuth()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [existing, setExisting] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [coordinatorProfileId, setCoordinatorProfileId] = useState('')
  const [contactInfo, setContactInfo] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    Promise.all([fetchProfiles(), fetchDepartments()])
      .then(([profilesData, departmentsData]) => {
        if (!active) return
        setProfiles(profilesData.filter((p) => p.is_active))
        setExisting(departmentsData)
      })
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar la lista de usuarios.')))
    return () => {
      active = false
    }
  }, [isAdmin])

  const duplicate = name.trim() ? existing.find((d) => normalizeName(d.name) === normalizeName(name)) : undefined

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Escribí el nombre del departamento.')
    if (duplicate) return setError(`Ya existe el departamento "${duplicate.name}". Abrilo desde la lista para editarlo.`)
    setSubmitting(true)
    try {
      await createDepartment({
        name: name.trim(),
        description: description.trim() || null,
        coordinator_profile_id: coordinatorProfileId || null,
        contact_info: contactInfo.trim() || null,
        created_by_profile_id: currentProfile?.id ?? null,
      })
      navigate('/departamentos', { state: { notice: `Se creó el departamento "${name.trim()}". Ya aparece también en Escuela → Avales regionales.` } })
    } catch (err) {
      if (postgrestCode(err) === '23505') {
        setError('Ya existe un departamento con ese nombre. Abrilo desde la lista para editarlo.')
      } else {
        setError(describeSupabaseError(err, 'No pudimos crear el departamento. Reintentá en unos segundos.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <AppShell title="Departamentos">
        <AccessDenied
          title="No podés crear departamentos"
          message="Los departamentos los crea el Dpto. de Informática y Estadística R4. Si falta uno, pediles que lo agreguen."
          backTo="/departamentos"
          backLabel="Volver a Departamentos"
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Nuevo departamento">
      <Link to="/departamentos" className="back-link">
        ← Volver a Departamentos
      </Link>
      <h1 className="page-title">Nuevo departamento</h1>
      <p className="page-subtitle">
        Hay una sola lista de departamentos para todo SIGER4: el que crees acá también aparece en Escuela → Avales regionales.
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Por ejemplo: Fuego, Forestal, FASME"
            aria-invalid={duplicate ? true : undefined}
            aria-describedby="name-help"
          />
          {duplicate ? (
            <p id="name-help" className="field-error">
              Ya existe "{duplicate.name}". <Link to={`/departamentos/${duplicate.id}`}>Abrirlo</Link>
            </p>
          ) : (
            <p id="name-help" className="field-help">
              Tiene que ser único: no se distinguen mayúsculas ni espacios.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="description">Descripción (opcional)</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="field">
          <label htmlFor="coordinator">Coordinador (opcional)</label>
          <select id="coordinator" value={coordinatorProfileId} onChange={(e) => setCoordinatorProfileId(e.target.value)} aria-describedby="coordinator-help">
            <option value="">Sin asignar</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <p id="coordinator-help" className="field-help">
            El coordinador ve y sube los avales de este departamento en Escuela. Es la única asignación necesaria: no hace
            falta darle ningún rol.
          </p>
        </div>

        <div className="field">
          <label htmlFor="contactInfo">Contacto (opcional)</label>
          <input id="contactInfo" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Teléfono o email del área" />
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear departamento'}
        </button>
      </form>
    </AppShell>
  )
}
