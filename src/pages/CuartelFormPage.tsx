import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { createStation, fetchStationById, updateStation } from '../lib/api/stations'
import type { Region, StationStatus, Subsede } from '../types/database'

const STATUS_OPTIONS: { value: StationStatus; label: string }[] = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'no_operativo', label: 'No operativo' },
]

export function CuartelFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [zone, setZone] = useState('')
  const [status, setStatus] = useState<StationStatus>('operativo')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subsedesForRegion = subsedes.filter((s) => s.region_id === regionId)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes()]).then(([regionsData, subsedesData]) => {
      if (!active) return
      setRegions(regionsData)
      setSubsedes(subsedesData)
      setRegionId((prev) => prev || regionsData[0]?.id || '')
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (subsedeId || subsedesForRegion.length === 0) return
    setSubsedeId(subsedesForRegion[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsedesForRegion])

  useEffect(() => {
    if (!id) return
    let active = true
    fetchStationById(id).then((station) => {
      if (!active || !station) return
      setName(station.name)
      setCode(station.code)
      setAddress(station.address ?? '')
      setZone(station.zone ?? '')
      setStatus(station.status)
      setRegionId(station.region_id)
      setSubsedeId(station.subsede_id ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input = {
        name,
        code,
        address: address || null,
        zone: zone || null,
        status,
        region_id: regionId,
        subsede_id: subsedeId,
      }
      if (isEditing && id) {
        await updateStation(id, input)
        navigate(`/cuarteles/${id}`)
      } else {
        const created = await createStation(input)
        navigate(`/cuarteles/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el cuartel.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={isEditing ? 'Editar Cuartel' : 'Nuevo Cuartel'}>
      <h1 className="page-title">{isEditing ? 'Editar Cuartel' : 'Nuevo Cuartel'}</h1>
      <p className="page-subtitle">Completá los datos institucionales del cuartel.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del cuartel…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuartel Central N°1" />
          </div>

          <div className="field">
            <label htmlFor="code">Código</label>
            <input id="code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="CC1" />
          </div>

          <div className="field">
            <label htmlFor="region">Región</label>
            <select
              id="region"
              required
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value)
                setSubsedeId('')
              }}
            >
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="subsede">Subsede</label>
            <select id="subsede" required value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
              <option value="" disabled>
                Seleccionar subsede
              </option>
              {subsedesForRegion.map((subsede) => (
                <option key={subsede.id} value={subsede.id}>
                  {subsede.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="address">Dirección</label>
            <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Libertad 450" />
          </div>

          <div className="field">
            <label htmlFor="zone">Zona</label>
            <input id="zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Zona Norte" />
          </div>

          <div className="field">
            <label>Estado</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`btn ${status === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
