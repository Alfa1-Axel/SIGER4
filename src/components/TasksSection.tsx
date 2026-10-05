import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui/Icon'
import { fetchPendingItems } from '../lib/api/pendingItems'
import type { PendingItemPriority } from '../lib/api/pendingItems'
import { countRecentAvales, countRecentDepartmentReports, fetchOpenLoanRequests } from '../lib/api/homeTasks'
import { useAuth } from '../hooks/useAuth'
import { useLoanRequestAccess } from '../hooks/useLoanRequestAccess'
import { useSchoolAvalesAccess } from '../hooks/useSchoolAvalesAccess'
import { useDepartmentReportsAccess } from '../hooks/useDepartmentReportsAccess'
import { isImportantNotification, timeAgo } from '../lib/notificationMeta'
import type { Notification } from '../types/database'

interface Task {
  key: string
  title: string
  description?: string
  priority: PendingItemPriority
  to: string
}

interface TaskGroup {
  module: string
  icon: string
  link: string
  tasks: Task[]
  // Total real cuando el grupo muestra solo una parte (notificaciones).
  total?: number
}

const PRIORITY_RANK: Record<PendingItemPriority, number> = { alta: 0, media: 1, baja: 2 }
const PRIORITY_LABEL: Record<PendingItemPriority, string> = { alta: 'Urgente', media: 'Pendiente', baja: 'Para revisar' }

// Módulos de get_pending_items (0075) → grupo del Inicio.
const MODULE_GROUP: Record<string, { name: string; icon: string; link: string }> = {
  Cuarteles: { name: 'Cuarteles', icon: 'building', link: '/cuarteles' },
  Inventario: { name: 'Inventario', icon: 'tag', link: '/inventario/solicitudes' },
  Calendario: { name: 'Calendario', icon: 'calendar', link: '/calendario' },
  Documentos: { name: 'Documentos', icon: 'file', link: '/documentos' },
  Usuarios: { name: 'Usuarios', icon: 'user', link: '/usuarios' },
  Escuela: { name: 'Escuela', icon: 'school', link: '/escuela' },
  Departamentos: { name: 'Departamentos', icon: 'clipboardList', link: '/departamentos' },
  Notificaciones: { name: 'Notificaciones', icon: 'bell', link: '/notificaciones' },
}

function groupFor(module: string) {
  if (/pr[ée]stamo/i.test(module)) return MODULE_GROUP.Inventario
  return MODULE_GROUP[module] ?? { name: module, icon: 'info', link: '/panel' }
}

const MAX_PER_GROUP = 3

// "Tareas y pendientes" del Inicio: lo que pide una acción del usuario,
// agrupado por módulo y ordenado por urgencia. Combina get_pending_items
// (servidor) con datos propios: préstamos para retirar o entregar, mis
// solicitudes, notificaciones sin leer y lo nuevo en Escuela y Departamentos.
// Todo pasa por la RLS: nunca aparece algo que el usuario no pueda abrir.
export function TasksSection({ unreadNotifications, unreadTotal }: { unreadNotifications: Notification[]; unreadTotal: number }) {
  const { profile, isAdmin, hasRole } = useAuth()
  const { ownStationIds } = useLoanRequestAccess()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const { hasAnyAccess: hasReportsAccess } = useDepartmentReportsAccess()
  const isLoanManager = isAdmin || hasRole('secretario_regional', 'director_escuela')
  const profileId = profile?.id ?? null

  const [tasks, setTasks] = useState<(Task & { module: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!profileId) return
    let active = true
    Promise.allSettled([
      fetchPendingItems(),
      fetchOpenLoanRequests(),
      hasAvalesAccess ? countRecentAvales() : Promise.resolve(0),
      hasReportsAccess ? countRecentDepartmentReports(profileId) : Promise.resolve(0),
    ]).then(([pendingRes, loansRes, avalesRes, reportsRes]) => {
      if (!active) return
      const list: (Task & { module: string })[] = []
      if (pendingRes.status === 'fulfilled') {
        for (const item of pendingRes.value) {
          list.push({ key: item.itemKey, title: item.title, description: item.description, priority: item.priority, to: item.linkPath, module: groupFor(item.module).name })
        }
      }
      if (loansRes.status === 'fulfilled') {
        const loans = loansRes.value
        for (const loan of loans) {
          const name = loan.item?.name ?? 'un elemento'
          const mine = ownStationIds.includes(loan.requesting_station_id) || loan.requested_by_profile_id === profileId
          const manages = isLoanManager || loan.item?.responsible_profile_id === profileId || loan.responsible_profile_id === profileId
          if (loan.status === 'aprobada' && mine) {
            list.push({ key: `retirar_${loan.id}`, title: `Retirá ${name}`, description: 'Tu solicitud fue aprobada: coordiná el retiro con el responsable.', priority: 'alta', to: `/inventario/solicitudes/${loan.id}`, module: 'Inventario' })
          } else if (loan.status === 'aprobada' && manages) {
            list.push({ key: `entregar_${loan.id}`, title: `Entregar ${name}`, description: 'Aprobada, falta registrar el retiro.', priority: 'media', to: `/inventario/solicitudes/${loan.id}`, module: 'Inventario' })
          }
        }
        const myPending = loans.filter((l) => l.status === 'pendiente' && (l.requested_by_profile_id === profileId || ownStationIds.includes(l.requesting_station_id)))
        if (myPending.length > 0) {
          list.push({
            key: 'mis_pendientes',
            title: myPending.length === 1 ? `Tu solicitud de ${myPending[0].item?.name ?? 'préstamo'} espera respuesta` : `${myPending.length} solicitudes tuyas esperan respuesta`,
            description: 'Te avisamos cuando el responsable responda.',
            priority: 'baja',
            to: myPending.length === 1 ? `/inventario/solicitudes/${myPending[0].id}` : '/inventario/solicitudes',
            module: 'Inventario',
          })
        }
      }
      if (avalesRes.status === 'fulfilled' && avalesRes.value > 0) {
        list.push({ key: 'avales_nuevos', title: avalesRes.value === 1 ? '1 aval nuevo esta semana' : `${avalesRes.value} avales nuevos esta semana`, priority: 'baja', to: '/escuela/avales', module: 'Escuela' })
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value > 0) {
        // Informática ve los informes de todos los departamentos, no solo los suyos.
        const where = isAdmin ? 'en Departamentos' : 'en tus departamentos'
        list.push({ key: 'informes_nuevos', title: reportsRes.value === 1 ? `1 informe nuevo ${where}` : `${reportsRes.value} informes nuevos ${where}`, description: 'Cargados por otras personas en los últimos 7 días.', priority: 'baja', to: '/departamentos', module: 'Departamentos' })
      }
      setTasks(list)
      setFailed(pendingRes.status === 'rejected' && loansRes.status === 'rejected')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [profileId, ownStationIds, isLoanManager, isAdmin, hasAvalesAccess, hasReportsAccess])

  // Las notificaciones sin leer entran como un grupo más, con su título real.
  const allTasks = useMemo(
    () => [
      ...tasks,
      ...unreadNotifications.map((n) => ({
        key: `notif_${n.id}`,
        title: n.title,
        description: timeAgo(n.created_at),
        priority: (isImportantNotification(n) ? 'media' : 'baja') as PendingItemPriority,
        to: '/notificaciones',
        module: 'Notificaciones',
      })),
    ],
    [tasks, unreadNotifications],
  )

  const groups = useMemo<TaskGroup[]>(() => {
    const byModule = new Map<string, TaskGroup>()
    for (const task of allTasks) {
      const meta = Object.values(MODULE_GROUP).find((g) => g.name === task.module) ?? groupFor(task.module)
      const group = byModule.get(meta.name) ?? { module: meta.name, icon: meta.icon, link: meta.link, tasks: [] }
      group.tasks.push(task)
      byModule.set(meta.name, group)
    }
    const list = [...byModule.values()]
    for (const g of list) g.tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    const notif = byModule.get('Notificaciones')
    if (notif) notif.total = unreadTotal
    return list.sort((a, b) => PRIORITY_RANK[a.tasks[0].priority] - PRIORITY_RANK[b.tasks[0].priority] || b.tasks.length - a.tasks.length)
  }, [allTasks, unreadTotal])

  const totalCount = tasks.length + unreadTotal
  const urgentCount = allTasks.filter((t) => t.priority === 'alta').length

  return (
    <section aria-labelledby="tareas-title" style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2 className="section-title" id="tareas-title">
          Tareas y pendientes
        </h2>
        {!loading && totalCount > 0 && (
          <span className="field-help">
            {totalCount} {totalCount === 1 ? 'pendiente' : 'pendientes'}
            {urgentCount > 0 && ` · ${urgentCount} ${urgentCount === 1 ? 'urgente' : 'urgentes'}`}
          </span>
        )}
      </div>

      {loading && <div className="loading-state" role="status">Revisando pendientes…</div>}
      {!loading && failed && (
        <div className="alert alert-warning" role="status">
          No pudimos revisar todos tus pendientes. Probá recargar la página en unos segundos.
        </div>
      )}
      {!loading && !failed && allTasks.length === 0 && (
        <div className="card tasks-empty" role="status">
          <span className="tasks-empty-icon" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <div>
            <strong>Todo al día</strong>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>No tenés tareas pendientes. Cuando algo necesite tu acción, aparece acá.</p>
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="task-groups">
          {groups.map((g) => (
            <div key={g.module} className="card task-group">
              <div className="task-group-header">
                <span className="list-item-icon" aria-hidden="true">
                  <Icon name={g.icon} size={16} />
                </span>
                <h3 className="task-group-title">{g.module}</h3>
                <span className={`badge ${g.tasks[0].priority === 'alta' ? 'badge-danger' : 'badge-neutral'}`}>{g.total ?? g.tasks.length}</span>
              </div>
              <ul className="task-list">
                {g.tasks.slice(0, MAX_PER_GROUP).map((t) => (
                  <li key={t.key}>
                    <Link to={t.to} className={`task-item task-item--${t.priority}`}>
                      <span className="task-item-text">
                        <span className="task-item-title">{t.title}</span>
                        {t.description && <span className="task-item-description">{t.description}</span>}
                      </span>
                      <span className="sr-only">{PRIORITY_LABEL[t.priority]}</span>
                      <Icon name="chevronRight" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
              {(g.total ?? g.tasks.length) > MAX_PER_GROUP && (
                <Link to={g.link} className="link-muted task-group-more">
                  Ver {(g.total ?? g.tasks.length) - MAX_PER_GROUP} más →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
