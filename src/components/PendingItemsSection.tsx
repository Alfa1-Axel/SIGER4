import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPendingItems } from '../lib/api/pendingItems'
import type { PendingItem, PendingItemPriority } from '../lib/api/pendingItems'
import { describeSupabaseError } from '../lib/api/errors'

const PRIORITY_BADGE_CLASS: Record<PendingItemPriority, string> = {
  alta: 'badge-danger',
  media: 'badge-warning',
  baja: 'badge-info',
}

const PRIORITY_LABEL: Record<PendingItemPriority, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

// Panel de Pendientes por Rol (Dashboard): lista de tareas/pendientes
// derivada 100% de get_pending_items() (migración 0075), que ya viene
// scopeada del lado del servidor según rol/alcance -- este componente solo
// pinta lo que la RPC devuelve, sin filtrar nada más acá. No dispara
// ninguna notificación (es solo panel visual, ver DEPLOYMENT.md).
export function PendingItemsSection() {
  const [items, setItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchPendingItems()
      .then((data) => active && setItems(data))
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar los pendientes.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">Pendientes</h2>
      </div>
      <div className="card" style={{ marginBottom: 20, padding: items.length > 0 ? 0 : undefined }}>
        {loading && <div className="empty-state">Cargando pendientes…</div>}
        {error && <p className="field-error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <div className="empty-state">No hay pendientes importantes.</div>
        )}
        {!loading &&
          !error &&
          items.map((item, i) => (
            <Link
              key={item.itemKey}
              to={item.linkPath}
              className="list-item"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 className="list-item-title" style={{ margin: 0 }}>
                  {item.title}
                </h3>
                <p className="list-item-subtitle" style={{ margin: '3px 0 0' }}>
                  {item.description}
                </p>
                <span className="badge badge-info" style={{ marginTop: 6, display: 'inline-block' }}>
                  {item.module}
                </span>
              </div>
              <span className={`badge ${PRIORITY_BADGE_CLASS[item.priority]}`} style={{ flexShrink: 0 }}>
                {PRIORITY_LABEL[item.priority]}
              </span>
            </Link>
          ))}
      </div>
    </>
  )
}
