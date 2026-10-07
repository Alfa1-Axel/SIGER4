import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Icon } from './ui/Icon'
import { DepartmentDashboard } from './DepartmentDashboard'
import { openGlobalSearch } from '../lib/searchControl'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { fetchUnreadNotificationCount } from '../lib/api/notifications'
import { describeSupabaseError } from '../lib/api/errors'
import { greeting, longToday } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import type { VisibleDepartment } from '../types/database'

interface QuickAction {
  to: string
  label: string
  description: string
  icon: string
  badge?: number
}

// Inicio del modo departamento (quien solo es Coordinador o Miembro de
// Departamento): su departamento con lo pendiente, lo último y lo próximo, y
// accesos solo a lo que su rol puede abrir. Sin cuarteles, documentos,
// inventario, estado de la Regional ni tareas de otros módulos.
export function DepartmentHome() {
  const { profile } = useAuth()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  // null mientras carga: así no se muestra "sin departamento" por un instante.
  const [departments, setDepartments] = useState<VisibleDepartment[] | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVisibleDepartments()
      .then((list) => active && setDepartments(list.filter((d) => d.my_relation)))
      .catch((err) => {
        if (!active) return
        setDepartments([])
        setError(describeSupabaseError(err, 'No pudimos cargar tu departamento. Reintentá en unos segundos.'))
      })
    fetchUnreadNotificationCount()
      .then((count) => active && setUnreadCount(count))
      .catch(() => {
        // Las notificaciones siguen disponibles en su sección.
      })
    return () => {
      active = false
    }
  }, [])

  const mine = departments ?? []
  const coordinatedNames = mine.filter((d) => d.my_relation === 'coordinador').map((d) => d.name)
  const memberNames = mine.filter((d) => d.my_relation === 'integrante').map((d) => d.name)
  const roleSummary = [
    ...(coordinatedNames.length ? [`Coordinador de ${coordinatedNames.join(', ')}`] : []),
    ...(memberNames.length ? [`Miembro de ${memberNames.join(', ')}`] : []),
  ]
  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  const actions: QuickAction[] = [
    { to: '/notificaciones', label: 'Notificaciones', description: unreadCount ? `${unreadCount} sin leer` : 'Al día', icon: 'bell', badge: unreadCount },
    { to: '/calendario', label: 'Calendario', description: 'Eventos de tu departamento', icon: 'calendar' },
  ]
  if (hasAvalesAccess) actions.push({ to: '/escuela/avales', label: 'Avales regionales', description: 'Ver y subir los avales de tu departamento', icon: 'school' })
  actions.push({ to: '/ayuda#que-puedo-hacer-departamento', label: 'Qué puedo hacer', description: 'Lo que permite tu rol, paso a paso', icon: 'help' })

  return (
    <AppShell title="Inicio">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="page-subtitle">
            {longToday()}
            {roleSummary.length > 0 && ` · ${roleSummary.slice(0, 3).join(' · ')}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <button type="button" className="home-search" onClick={openGlobalSearch}>
        <Icon name="search" size={18} />
        <span>Buscar en SIGER4: tu departamento, informes, eventos, avisos…</span>
      </button>

      {departments === null && (
        <div className="loading-state" role="status">
          Cargando tu departamento…
        </div>
      )}

      {departments !== null && mine.length === 0 && !error && (
        <div className="card dept-home-empty">
          <h2 className="section-title">Todavía no tenés un departamento asignado</h2>
          <p>
            Tu rol trabaja con un departamento, pero Informática R4 todavía no te asignó uno. Cuando te sumen, lo vas a ver acá con sus informes,
            actas, eventos y avisos.
          </p>
          <Link to="/ayuda#sin-seccion-departamento" className="btn btn-outlined btn-sm">
            Qué hacer si no veo una sección
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      )}

      {mine.length > 0 && <DepartmentDashboard departments={mine} />}

      <div className="section-header">
        <h2 className="section-title">Accesos rápidos</h2>
      </div>
      <nav className="quick-actions" aria-label="Accesos rápidos">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="quick-action">
            <span className="list-item-icon" style={{ position: 'relative' }}>
              <Icon name={a.icon} size={18} />
              {a.badge ? (
                <span className="header-badge" style={{ top: -6, right: -6 }}>
                  {a.badge > 9 ? '9+' : a.badge}
                </span>
              ) : null}
            </span>
            <span className="quick-action-text">
              <strong>{a.label}</strong>
              <span>{a.description}</span>
            </span>
          </Link>
        ))}
      </nav>
    </AppShell>
  )
}
