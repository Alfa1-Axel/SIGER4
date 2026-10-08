import { useEffect, useMemo, useState } from 'react'
import { fetchPendingItems } from '../lib/api/pendingItems'
import type { PendingItemPriority } from '../lib/api/pendingItems'
import { countRecentAvales, countRecentDepartmentReports, fetchOpenLoanRequests } from '../lib/api/homeTasks'
import type { OpenLoan } from '../lib/api/homeTasks'
import { fetchLatestUnreadNotifications, fetchUnreadNotificationCount } from '../lib/api/notifications'
import { canOpenPath } from '../lib/moduleAccess'
import { isImportantNotification, openableNotificationLink, timeAgo } from '../lib/notificationMeta'
import { useAuth } from './useAuth'
import { useLoanRequestAccess } from './useLoanRequestAccess'
import { useSchoolAvalesAccess } from './useSchoolAvalesAccess'
import { useDepartmentReportsAccess } from './useDepartmentReportsAccess'

// Pendientes del usuario: lo que pide una acción suya, según su rol y su
// alcance. Los usa el resumen del Inicio y la pantalla interna /pendientes.
// Todo sale de consultas que pasan por la RLS (get_pending_items filtra del
// lado del servidor) y, además, no se ofrece ningún pendiente cuyo destino el
// rol no pueda abrir.

export interface Pendiente {
  key: string
  title: string
  description?: string
  priority: PendingItemPriority
  to: string
  // Módulo al que pertenece, como lo ve el usuario ("Inventario", "Cuarteles").
  module: string
  // Qué hace el botón: "Cargar efectivos", "Ver solicitud"…
  actionLabel: string
}

export interface PendienteGroup {
  module: string
  icon: string
  items: Pendiente[]
}

export const PRIORITY_RANK: Record<PendingItemPriority, number> = { alta: 0, media: 1, baja: 2 }
export const PRIORITY_LABEL: Record<PendingItemPriority, string> = { alta: 'Urgente', media: 'Pendiente', baja: 'Para revisar' }

// Módulos de get_pending_items (0075) → grupo de la pantalla.
const MODULE_GROUP: Record<string, { name: string; icon: string }> = {
  Cuarteles: { name: 'Cuarteles', icon: 'building' },
  Inventario: { name: 'Inventario', icon: 'tag' },
  Calendario: { name: 'Calendario', icon: 'calendar' },
  Documentos: { name: 'Documentos', icon: 'file' },
  Usuarios: { name: 'Usuarios', icon: 'user' },
  Escuela: { name: 'Escuela', icon: 'school' },
  Departamentos: { name: 'Departamentos', icon: 'clipboardList' },
  Notificaciones: { name: 'Notificaciones', icon: 'bell' },
}

function groupMeta(module: string): { name: string; icon: string } {
  if (/pr[ée]stamo/i.test(module)) return MODULE_GROUP.Inventario
  return MODULE_GROUP[module] ?? { name: module, icon: 'info' }
}

// Texto del botón de un pendiente que viene del servidor, según de qué se trate.
function serverActionLabel(module: string, title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase()
  if (module === 'Cuarteles') {
    if (text.includes('efectivos')) return 'Cargar efectivos'
    if (text.includes('asistencia')) return 'Registrar asistencia'
    if (text.includes('intervenciones')) return 'Registrar intervenciones'
    if (text.includes('móviles') || text.includes('vehículos')) return 'Cargar móviles'
    if (text.includes('contacto')) return 'Completar contacto'
    return 'Revisar cuartel'
  }
  if (groupMeta(module).name === 'Inventario') return 'Ver solicitud'
  if (module === 'Calendario') return 'Ver evento'
  if (module === 'Documentos') return 'Ver documentos'
  if (module === 'Usuarios') return 'Ver usuarios'
  if (module === 'Escuela') return 'Ver Escuela'
  if (module === 'Departamentos') return 'Ver departamento'
  return 'Revisar'
}

export interface UsePendientesResult {
  items: Pendiente[]
  groups: PendienteGroup[]
  // Avisos sin leer que no están entre los pendientes (no son importantes).
  otherUnread: number
  unreadTotal: number
  total: number
  urgent: number
  loading: boolean
  failed: boolean
}

export function usePendientes(): UsePendientesResult {
  const { profile, isAdmin, isDepartmentOnly, hasRole } = useAuth()
  const { ownStationIds } = useLoanRequestAccess()
  const { hasAccess: hasAvalesAccess } = useSchoolAvalesAccess()
  const { hasAnyAccess: hasReportsAccess } = useDepartmentReportsAccess()
  const isLoanManager = isAdmin || hasRole('secretario_regional', 'director_escuela')
  const canManageUsers = isAdmin || hasRole('jefe_cuerpo_activo')
  const profileId = profile?.id ?? null

  const [items, setItems] = useState<Pendiente[]>([])
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [shownUnread, setShownUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!profileId) return
    let active = true
    Promise.allSettled([
      fetchPendingItems(),
      // Inventario es un módulo cerrado para quien solo trabaja en departamentos:
      // ni siquiera se consulta.
      isDepartmentOnly ? Promise.resolve<OpenLoan[]>([]) : fetchOpenLoanRequests(),
      hasAvalesAccess ? countRecentAvales() : Promise.resolve(0),
      hasReportsAccess ? countRecentDepartmentReports(profileId) : Promise.resolve(0),
      fetchLatestUnreadNotifications(30),
      fetchUnreadNotificationCount(),
    ]).then(([pendingRes, loansRes, avalesRes, reportsRes, unreadRes, unreadCountRes]) => {
      if (!active) return
      const list: Pendiente[] = []

      if (pendingRes.status === 'fulfilled') {
        for (const item of pendingRes.value) {
          const module = groupMeta(item.module).name
          list.push({
            key: item.itemKey,
            title: item.title,
            description: item.description,
            priority: item.priority,
            to: item.linkPath,
            module,
            actionLabel: serverActionLabel(item.module, item.title, item.description),
          })
        }
      }

      if (loansRes.status === 'fulfilled') {
        const loans = loansRes.value
        for (const loan of loans) {
          const name = loan.item?.name ?? 'un elemento'
          const mine = ownStationIds.includes(loan.requesting_station_id) || loan.requested_by_profile_id === profileId
          const manages = isLoanManager || loan.item?.responsible_profile_id === profileId || loan.responsible_profile_id === profileId
          if (loan.status === 'aprobada' && mine) {
            list.push({ key: `retirar_${loan.id}`, title: `Retirá ${name}`, description: 'Tu solicitud fue aprobada: coordiná el retiro con el responsable.', priority: 'alta', to: `/inventario/solicitudes/${loan.id}`, module: 'Inventario', actionLabel: 'Ver solicitud' })
          } else if (loan.status === 'aprobada' && manages) {
            list.push({ key: `entregar_${loan.id}`, title: `Entregar ${name}`, description: 'Aprobada, falta registrar el retiro.', priority: 'media', to: `/inventario/solicitudes/${loan.id}`, module: 'Inventario', actionLabel: 'Registrar entrega' })
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
            actionLabel: 'Ver solicitud',
          })
        }
      }

      if (avalesRes.status === 'fulfilled' && avalesRes.value > 0) {
        list.push({ key: 'avales_nuevos', title: avalesRes.value === 1 ? '1 aval nuevo esta semana' : `${avalesRes.value} avales nuevos esta semana`, priority: 'baja', to: '/escuela/avales', module: 'Escuela', actionLabel: 'Ver avales' })
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value > 0) {
        // Informática ve los informes de todos los departamentos, no solo los suyos.
        const where = isAdmin ? 'en Departamentos' : 'en tus departamentos'
        list.push({ key: 'informes_nuevos', title: reportsRes.value === 1 ? `1 informe nuevo ${where}` : `${reportsRes.value} informes nuevos ${where}`, description: 'Cargados por otras personas en los últimos 7 días.', priority: 'baja', to: '/departamentos', module: 'Departamentos', actionLabel: 'Ver informes' })
      }

      // Avisos sin leer: entran como pendientes los importantes (piden hacer
      // algo) y los de un departamento. El resto solo se cuenta.
      let shown = 0
      if (unreadRes.status === 'fulfilled') {
        for (const n of unreadRes.value) {
          const asksForAction = isImportantNotification(n)
          if (!asksForAction && !n.department_id) continue
          shown += 1
          list.push({
            key: `notif_${n.id}`,
            title: n.title,
            description: timeAgo(n.created_at),
            priority: asksForAction ? 'media' : 'baja',
            to: openableNotificationLink(n, canManageUsers, isDepartmentOnly, hasAvalesAccess) ?? '/notificaciones',
            module: 'Notificaciones',
            actionLabel: 'Ver aviso',
          })
        }
      }

      // Nunca se ofrece un pendiente que el rol no pueda abrir.
      setItems(list.filter((p) => canOpenPath(p.to, isDepartmentOnly, hasAvalesAccess)))
      setShownUnread(shown)
      setUnreadTotal(unreadCountRes.status === 'fulfilled' ? unreadCountRes.value : 0)
      // Se avisa solo si fallaron las dos fuentes principales (en modo
      // departamento, que no consulta préstamos, alcanza con la del servidor).
      setFailed(pendingRes.status === 'rejected' && (isDepartmentOnly || loansRes.status === 'rejected'))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [profileId, ownStationIds, isLoanManager, isAdmin, canManageUsers, isDepartmentOnly, hasAvalesAccess, hasReportsAccess])

  const sorted = useMemo(
    () => [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [items],
  )

  const groups = useMemo<PendienteGroup[]>(() => {
    const byModule = new Map<string, PendienteGroup>()
    for (const item of sorted) {
      const meta = Object.values(MODULE_GROUP).find((g) => g.name === item.module) ?? groupMeta(item.module)
      const group = byModule.get(meta.name) ?? { module: meta.name, icon: meta.icon, items: [] }
      group.items.push(item)
      byModule.set(meta.name, group)
    }
    return [...byModule.values()].sort(
      (a, b) => PRIORITY_RANK[a.items[0].priority] - PRIORITY_RANK[b.items[0].priority] || b.items.length - a.items.length,
    )
  }, [sorted])

  return {
    items: sorted,
    groups,
    otherUnread: Math.max(0, unreadTotal - shownUnread),
    unreadTotal,
    total: sorted.length,
    urgent: sorted.filter((p) => p.priority === 'alta').length,
    loading,
    failed,
  }
}
