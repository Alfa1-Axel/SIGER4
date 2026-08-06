import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchInventoryItems } from '../lib/api/inventory'
import type { InventoryCategory, InventoryItem, InventoryStatus } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  herramienta_manual: 'Herramienta Manual',
  mecanica: 'Mecánica',
  equipo: 'Equipo',
  elementos_practica: 'Elementos de Práctica',
  otros: 'Otros',
}

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  disponible: 'Disponible',
  no_disponible: 'No disponible',
  mantenimiento: 'Mantenimiento',
  baja: 'Baja',
}

const INVENTORY_STATUS_BADGE: Record<InventoryStatus, string> = {
  disponible: 'badge-success',
  no_disponible: 'badge-warning',
  mantenimiento: 'badge-warning',
  baja: 'badge-danger',
}

export function InventarioPage() {
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('director_escuela', 'secretario_regional')

  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let active = true
    fetchInventoryItems()
      .then((data) => active && setItems(data))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Error al cargar el inventario'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return items.filter(
      (item) =>
        (!q || item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)) &&
        (!categoryFilter || item.category === categoryFilter) &&
        (!statusFilter || item.status === statusFilter),
    )
  }, [items, query, categoryFilter, statusFilter])

  return (
    <AppShell title="Inventario Regional">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="page-title">Inventario Regional</h1>
          <p className="page-subtitle">
            Elementos regionales disponibles para uso compartido entre cuarteles: herramientas, equipos
            y material de práctica.
          </p>
        </div>
        <Link to="/inventario/solicitudes" className="btn btn-outlined" style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
          Solicitudes
        </Link>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field-error">{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="search-input" style={{ flex: 1, minWidth: 200 }}>
          <Icon name="search" size={16} />
          <input placeholder="Buscar por nombre o descripción..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todas las categorías</option>
          {Object.entries(INVENTORY_CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Todos los estados</option>
          {Object.entries(INVENTORY_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="empty-state">Cargando inventario…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No hay elementos que coincidan.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((item) => (
          <Link
            key={item.id}
            to={`/inventario/${item.id}`}
            className="card-solid"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="badge badge-info">
                {item.category === 'otros' ? item.category_other_label : INVENTORY_CATEGORY_LABEL[item.category]}
              </span>
              <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{item.name}</h3>
              {item.description && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{item.description}</p>
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {item.responsible_name && `Responsable: ${item.responsible_name}`}
                {item.contact_info && ` · ${item.contact_info}`}
              </p>
            </div>
            <span className={`badge ${INVENTORY_STATUS_BADGE[item.status]}`}>{INVENTORY_STATUS_LABEL[item.status]}</span>
          </Link>
        ))}
      </div>

      {canEdit && (
        <Link to="/inventario/nuevo" className="btn btn-primary btn-icon fab" aria-label="Nuevo elemento">
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
