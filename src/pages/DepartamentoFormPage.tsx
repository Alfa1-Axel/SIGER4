import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { createDepartment } from '../lib/api/departments'
import { fetchProfiles } from '../lib/api/users'
import type { Profile } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

export function DepartamentoFormPage() {
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin } = useAuth()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [coordinatorProfileId, setCoordinatorProfileId] = useState('')
  const [contactInfo, setContactInfo] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    fetchProfiles().then((data) => active && setProfiles(data))
    return () => {
      active = false
    }
  }, [isAdmin])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createDepartment({
        name,
        description: description || null,
        coordinator_profile_id: coordinatorProfileId || null,
        contact_info: contactInfo || null,
        created_by_profile_id: currentProfile?.id ?? null,
      })
      navigate('/departamentos')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos crear el departamento.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <AppShell title="Departamentos">
        <div className="empty-state">No tenés permisos para crear departamentos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Nuevo Departamento">
      <h1 className="page-title">Nuevo Departamento</h1>
      <p className="page-subtitle">Área o departamento regional.</p>

      <form onSubmit={handleSubmit} className="card-solid">
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Capacitación, Logística, etc." />
        </div>

        <div className="field">
          <label htmlFor="description">Descripción (opcional)</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="field">
          <label htmlFor="coordinator">Coordinador (opcional)</label>
          <select id="coordinator" value={coordinatorProfileId} onChange={(e) => setCoordinatorProfileId(e.target.value)}>
            <option value="">Sin asignar</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="contactInfo">Contacto (opcional)</label>
          <input id="contactInfo" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear departamento'}
        </button>
      </form>
    </AppShell>
  )
}
