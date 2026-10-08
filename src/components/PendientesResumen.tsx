import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { PRIORITY_LABEL, usePendientes } from '../hooks/usePendientes'

// Cuántos pendientes se muestran en el Inicio: el resto está en "Ver todos".
export const MAX_PENDIENTES_INICIO = 4

// "Pendientes" del Inicio: cantidad total y los más importantes. Es la puerta
// a la pantalla interna /pendientes, que no está en el menú.
export function PendientesResumen() {
  const { items, total, urgent, loading, failed } = usePendientes()
  const shown = items.slice(0, MAX_PENDIENTES_INICIO)

  return (
    <section aria-labelledby="pendientes-title" className="pending-summary" style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2 id="pendientes-title" className="section-title">
          Pendientes
          {!loading && total > 0 && (
            <span className={`badge ${urgent > 0 ? 'badge-danger' : 'badge-neutral'} pending-summary-count`} aria-label={`${total} ${total === 1 ? 'pendiente' : 'pendientes'}`}>
              {total}
            </span>
          )}
        </h2>
        <Link to="/pendientes" className="link-muted">
          Ver todos
        </Link>
      </div>

      {loading && <div className="loading-state" role="status">Revisando pendientes…</div>}
      {!loading && failed && (
        <div className="alert alert-warning" role="status">
          No pudimos revisar todos tus pendientes. Probá de nuevo en unos segundos.
        </div>
      )}
      {!loading && !failed && total === 0 && (
        <div className="card tasks-empty" role="status">
          <span className="tasks-empty-icon" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <div>
            <strong>No tenés pendientes</strong>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Cuando algo necesite tu acción, aparece acá.</p>
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="card pending-summary-card">
          <ul className="task-list">
            {shown.map((p) => (
              <li key={p.key}>
                <Link to={p.to} className={`task-item task-item--${p.priority}`}>
                  <span className="task-item-text">
                    <span className="task-item-title">{p.title}</span>
                    <span className="task-item-description">{p.module}</span>
                  </span>
                  <span className="sr-only">{PRIORITY_LABEL[p.priority]}</span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          {total > shown.length && (
            <Link to="/pendientes" className="link-muted task-group-more">
              {total - shown.length} {total - shown.length === 1 ? 'pendiente más' : 'pendientes más'} →
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
