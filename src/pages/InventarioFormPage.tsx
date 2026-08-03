import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  fetchInventoryItemById,
  fetchInventoryItemHistory,
} from '../lib/api/inventory'
import { INVENTORY_CATEGORY_LABEL, INVENTORY_STATUS_LABEL } from './InventarioPage'
import type { InventoryCategory, InventoryItemHistory, InventoryStatus, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export function InventarioFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('director_escuela', 'secretario_regional')

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [history, setHistory] = useState<InventoryItemHistory[]>([])

  const [name, setName] = useState('')
  const [category, setCategory] = useState<InventoryCategory>('herramienta_manual')
  const [categoryOtherLabel, setCategoryOtherLabel] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<InventoryStatus>('disponible')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [responsibleName, setResponsibleName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [observations, setObservations] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canEdit) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()]).then(([regionsData, subsedesData, stationsData]) => {
      if (!active) return
      setRegions(regionsData)
      setSubsedes(subsedesData)
      setStations(stationsData)
      if (!isEditing) setRegionId((prev) => prev || regionsData[0]?.id || '')
    })
    return () => {
      active = false
    }
  }, [canEdit, isEditing])

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchInventoryItemById(id), fetchInventoryItemHistory(id)]).then(([item, historyData]) => {
      if (!active || !item) return
      setName(item.name)
      setCategory(item.category)
      setCategoryOtherLabel(item.category_other_label ?? '')
      setDescription(item.description ?? '')
      setStatus(item.status)
      setRegionId(item.region_id)
      setSubsedeId(item.subsede_id ?? '')
      setStationId(item.station_id ?? '')
      setResponsibleName(item.responsible_name ?? '')
      setContactInfo(item.contact_info ?? '')
      setObservations(item.observations ?? '')
      setHistory(historyData)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (category === 'otros' && !categoryOtherLabel.trim()) {
      setError('Especificá la categoría cuando elegís "Otros".')
      return
    }
    if (!regionId) {
      setError('Seleccioná la región.')
      return
    }

    setSubmitting(true)
    try {
      const input = {
        name,
        category,
        category_other_label: category === 'otros' ? categoryOtherLabel.trim() : null,
        description: description || null,
        status,
        region_id: regionId,
        subsede_id: subsedeId || null,
        station_id: stationId || null,
        responsible_name: responsibleName || null,
        contact_info: contactInfo || null,
        observations: observations || null,
      }
      if (isEditing && id) {
        await updateInventoryItem(id, input)
      } else {
        await createInventoryItem({ ...input, created_by_profile_id: profile?.id ?? null })
      }
      navigate('/inventario')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el elemento.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!window.confirm('¿Eliminar este elemento del inventario regional? Esta acción no se puede deshacer.')) return
    await deleteInventoryItem(id)
    navigate('/inventario')
  }

  if (!canEdit) {
    return (
      <AppShell title="Inventario Regional">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'cargar'} elementos del inventario.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Elemento' : 'Nuevo Elemento'}>
      <h1 className="page-title">{isEditing ? 'Editar Elemento' : 'Nuevo Elemento'}</h1>
      <p className="page-subtitle">Inventario regional compartido entre cuarteles.</p>

      {loading ? (
        <div className="empty-state">Cargando datos…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Motosierra, GPS, etc." />
          </div>

          <div className="field">
            <label htmlFor="category">Categoría</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
              {Object.entries(INVENTORY_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {category === 'otros' && (
            <div className="field">
              <label htmlFor="categoryOtherLabel">Especificar categoría</label>
              <input
                id="categoryOtherLabel"
                required
                value={categoryOtherLabel}
                onChange={(e) => setCategoryOtherLabel(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label htmlFor="region">Región</label>
            <select id="region" required value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Seleccionar región</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="subsede">Subsede (opcional)</label>
            <select id="subsede" value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
              <option value="">Sin asignar</option>
              {subsedes.map((subsede) => (
                <option key={subsede.id} value={subsede.id}>
                  {subsede.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="station">Cuartel donde se encuentra (opcional)</label>
            <select id="station" value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">Sin asignar</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="responsibleName">Responsable actual (opcional)</label>
            <input id="responsibleName" value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="contactInfo">Contacto para solicitarlo (opcional)</label>
            <input id="contactInfo" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Teléfono, email..." />
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label>Estado</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(INVENTORY_STATUS_LABEL).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value as InventoryStatus)}
                  className={`btn ${status === value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>

          {isEditing && (
            <button type="button" className="btn btn-outlined btn-block" style={{ marginTop: 8 }} onClick={handleDelete}>
              Eliminar
            </button>
          )}
        </form>
      )}

      {isEditing && history.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            <h2 className="section-title">Historial</h2>
          </div>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((entry) => (
                <div key={entry.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 8, fontSize: 12 }}>
                  {new Date(entry.created_at).toLocaleDateString('es-AR', { dateStyle: 'medium' })}
                  {entry.previous_status !== entry.new_status && entry.new_status && (
                    <div>Estado: {INVENTORY_STATUS_LABEL[entry.previous_status ?? 'disponible']} → {INVENTORY_STATUS_LABEL[entry.new_status]}</div>
                  )}
                  {entry.previous_responsible_name !== entry.new_responsible_name && (
                    <div>Responsable: {entry.previous_responsible_name ?? '—'} → {entry.new_responsible_name ?? '—'}</div>
                  )}
                  {entry.previous_station_id !== entry.new_station_id && (
                    <div>
                      Cuartel: {stations.find((s) => s.id === entry.previous_station_id)?.name ?? '—'} →{' '}
                      {stations.find((s) => s.id === entry.new_station_id)?.name ?? '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}
