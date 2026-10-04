import { AppShell } from '../components/layout/AppShell'
import { APP_UPDATES, CHANGE_TYPE_LABEL, CURRENT_APP_UPDATE, formatUpdateDate } from '../config/appUpdates'
import type { AppUpdateChangeType } from '../config/appUpdates'

const TYPE_ORDER: AppUpdateChangeType[] = ['nuevo', 'mejora', 'correccion']
const TYPE_BADGE: Record<AppUpdateChangeType, string> = {
  nuevo: 'badge-success',
  mejora: 'badge-info',
  correccion: 'badge-warning',
}
const TYPE_HEADING: Record<AppUpdateChangeType, string> = {
  nuevo: 'Nuevo',
  mejora: 'Mejoras',
  correccion: 'Correcciones',
}

// Versión actual y qué cambió en cada actualización (src/config/appUpdates.ts).
export function NovedadesPage() {
  return (
    <AppShell title="Novedades">
      <h1 className="page-title">Novedades</h1>
      <p className="page-subtitle">
        Estás usando SIGER4 <strong>{CURRENT_APP_UPDATE.version}</strong>, actualizado el {formatUpdateDate(CURRENT_APP_UPDATE.date)}. Acá
        está qué cambió en cada versión.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {APP_UPDATES.map((update, index) => (
          <article key={update.id} className="card-solid release" aria-labelledby={`release-${update.id}`}>
            <header className="release-header">
              <span className={`badge ${index === 0 ? 'badge-primary' : 'badge-neutral'}`}>
                Versión {update.version}
                {index === 0 && ' · actual'}
              </span>
              <time dateTime={update.date} className="release-date">
                {formatUpdateDate(update.date)}
              </time>
            </header>
            <h2 id={`release-${update.id}`} className="release-title">
              {update.title}
            </h2>
            <p className="release-summary">{update.summary}</p>
            {TYPE_ORDER.map((type) => {
              const items = update.changes.filter((c) => c.type === type)
              if (items.length === 0) return null
              return (
                <section key={type} className="release-group">
                  <h3 className="release-group-title">{TYPE_HEADING[type]}</h3>
                  <ul className="release-list">
                    {items.map((change, i) => (
                      <li key={i}>
                        <span className={`badge ${TYPE_BADGE[type]}`} title={CHANGE_TYPE_LABEL[type]}>
                          {change.module}
                        </span>
                        <span>{change.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </article>
        ))}
      </div>
    </AppShell>
  )
}
