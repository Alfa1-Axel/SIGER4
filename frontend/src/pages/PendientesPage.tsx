import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { PRIORITY_LABEL, usePendientes } from '../hooks/usePendientes'

// Pendientes: todo lo que necesita una acción del usuario, según su rol y su
// alcance, agrupado por módulo. Se llega desde el Inicio ("Ver todos"); no
// está en el menú ni es un módulo aparte.
export function PendientesPage() {
  const { groups, total, urgent, otherUnread, loading, failed } = usePendientes()

  return (
    <AppShell title="Pendientes">
      <Link to="/panel" className="back-link">
        ← Volver al Inicio
      </Link>
      <h1 className="page-title">Pendientes</h1>
      <p className="page-subtitle">
        {loading
          ? 'Revisando lo que necesita tu atención…'
          : total > 0
            ? `${total} ${total === 1 ? 'pendiente' : 'pendientes'}${urgent > 0 ? ` · ${urgent} ${urgent === 1 ? 'urgente' : 'urgentes'}` : ''}. Tocá uno para resolverlo.`
            : 'Lo que necesita tu atención, según tu rol y tu alcance.'}
      </p>

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

      {groups.length > 0 && (
        <div className="task-groups pending-groups">
          {groups.map((g) => (
            <section key={g.module} className="card task-group" aria-label={g.module}>
              <div className="task-group-header">
                <span className="list-item-icon" aria-hidden="true">
                  <Icon name={g.icon} size={16} />
                </span>
                <h2 className="task-group-title">{g.module}</h2>
                <span className={`badge ${g.items[0].priority === 'alta' ? 'badge-danger' : 'badge-neutral'}`}>{g.items.length}</span>
              </div>
              <ul className="task-list">
                {g.items.map((p) => (
                  <li key={p.key}>
                    <Link to={p.to} className={`task-item task-item--${p.priority}`}>
                      <span className="task-item-text">
                        <span className="task-item-title">{p.title}</span>
                        {p.description && <span className="task-item-description">{p.description}</span>}
                        <span className="task-item-priority">{PRIORITY_LABEL[p.priority]}</span>
                      </span>
                      <span className="task-item-action">{p.actionLabel}</span>
                      <Icon name="chevronRight" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!loading && otherUnread > 0 && (
        <Link to="/notificaciones" className="card pending-unread">
          <span className="list-item-icon" aria-hidden="true">
            <Icon name="bell" size={16} />
          </span>
          <span>
            {otherUnread} {otherUnread === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}
          </span>
          <span className="task-item-action">Ver notificaciones</span>
        </Link>
      )}
    </AppShell>
  )
}
