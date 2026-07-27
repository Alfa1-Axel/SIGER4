import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import {
  addDocumentVersion,
  createDocument,
  fetchDocumentById,
  fetchDocumentVersions,
  updateDocument,
  updateDocumentStoragePath,
} from '../lib/api/documents'
import { uploadDocumentFile } from '../lib/api/storage'
import type { DocumentVersion, Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

type DocScopeTarget = 'region' | 'subsede' | 'station' | 'profile'

const DOC_SCOPE_OPTIONS: { value: DocScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

export function DocumentoFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile: currentProfile, isAdmin, hasRole } = useAuth()
  const canCreate = isAdmin || hasRole('secretario_regional', 'presidente_cuartel', 'usuario_carga_cuartel', 'secretario_comision')

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [versions, setVersions] = useState<DocumentVersion[]>([])

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [scopeTarget, setScopeTarget] = useState<DocScopeTarget>('region')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(null)

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles()]).then(
      ([regionsData, subsedesData, stationsData, profilesData]) => {
        if (!active) return
        setRegions(regionsData)
        setSubsedes(subsedesData)
        setStations(stationsData)
        setProfiles(profilesData)
        setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [canCreate])

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchDocumentById(id), fetchDocumentVersions(id)]).then(([doc, docVersions]) => {
      if (!active || !doc) return
      setTitle(doc.title)
      setCategory(doc.category)
      setDescription(doc.description ?? '')
      setExistingStoragePath(doc.storage_path)
      setVersions(docVersions)
      if (doc.profile_id) {
        setScopeTarget('profile')
        setProfileId(doc.profile_id)
      } else if (doc.subsede_id) {
        setScopeTarget('subsede')
        setSubsedeId(doc.subsede_id)
      } else if (doc.station_id) {
        setScopeTarget('station')
        setStationId(doc.station_id)
      } else if (doc.region_id) {
        setScopeTarget('region')
        setRegionId(doc.region_id)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  if (!canCreate) {
    return (
      <AppShell title="Documentos">
        <div className="empty-state">No tenés permisos para cargar documentos.</div>
      </AppShell>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (scopeTarget === 'region' && !regionId) {
      setError('Seleccioná la región destino.')
      return
    }
    if (scopeTarget === 'subsede' && !subsedeId) {
      setError('Seleccioná la subsede destino.')
      return
    }
    if (scopeTarget === 'station' && !stationId) {
      setError('Seleccioná el cuartel destino.')
      return
    }
    if (scopeTarget === 'profile' && !profileId) {
      setError('Seleccioná el usuario destino.')
      return
    }
    if (!isEditing && !file) {
      setError('Adjuntá un archivo.')
      return
    }

    setSubmitting(true)
    try {
      const input = {
        title,
        category,
        description: description || null,
        region_id: scopeTarget === 'region' ? regionId : null,
        subsede_id: scopeTarget === 'subsede' ? subsedeId : null,
        station_id: scopeTarget === 'station' ? stationId : null,
        profile_id: scopeTarget === 'profile' ? profileId : null,
      }

      if (isEditing && id) {
        await updateDocument(id, input)
        if (file) {
          if (existingStoragePath && existingStoragePath !== 'pending') {
            await addDocumentVersion(id, existingStoragePath, currentProfile?.id ?? null)
          }
          const newPath = await uploadDocumentFile(id, file)
          await updateDocumentStoragePath(id, newPath)
        }
        navigate('/documentos')
      } else {
        const created = await createDocument({ ...input, uploaded_by_profile_id: currentProfile?.id ?? null })
        if (file) {
          const path = await uploadDocumentFile(created.id, file)
          await updateDocumentStoragePath(created.id, path)
        }
        navigate('/documentos')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el documento.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={isEditing ? 'Editar Documento' : 'Nuevo Documento'}>
      <h1 className="page-title">{isEditing ? 'Editar Documento' : 'Nuevo Documento'}</h1>
      <p className="page-subtitle">Cargá documentación institucional para el alcance que corresponda.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del documento…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="title">Título</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular N°12" />
          </div>

          <div className="field">
            <label htmlFor="category">Tipo de documento</label>
            <input id="category" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Circular, Acta, Manual..." />
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label htmlFor="file">{isEditing ? 'Reemplazar archivo (opcional)' : 'Archivo adjunto'}</label>
            <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {isEditing && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Si subís un archivo nuevo, el actual queda guardado en el historial de versiones.
              </p>
            )}
          </div>

          <div className="field">
            <label>Alcance</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {DOC_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScopeTarget(option.value)}
                  className={`btn ${scopeTarget === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {scopeTarget === 'region' && (
              <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">Seleccionar región</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            )}

            {scopeTarget === 'subsede' && (
              <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
                <option value="">Seleccionar subsede</option>
                {subsedes.map((subsede) => (
                  <option key={subsede.id} value={subsede.id}>
                    {subsede.name}
                  </option>
                ))}
              </select>
            )}

            {scopeTarget === 'station' && (
              <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                <option value="">Seleccionar cuartel</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            )}

            {scopeTarget === 'profile' && (
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">Seleccionar usuario</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>

          {versions.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>
                Versiones anteriores
              </div>
              {versions.map((v) => (
                <div key={v.id} style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                  {new Date(v.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </AppShell>
  )
}
