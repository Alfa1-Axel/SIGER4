import type { Notification, NotificationType } from '../types/database'

// Etiqueta, módulo, importancia y destino de cada tipo de notificación. Lo
// usan la bandeja (/notificaciones), el Inicio y la búsqueda global.

export type NotificationCategory = 'sistema' | 'escuela' | 'inventario' | 'documentos' | 'calendario' | 'cuarteles' | 'departamentos'

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  curso_nuevo: 'Curso nuevo',
  circular_nueva: 'Circular nueva',
  asistencia_pendiente: 'Asistencia pendiente',
  estadisticas_nuevas: 'Estadísticas nuevas',
  cambio_estado: 'Cambio de estado',
  actividad_proxima: 'Actividad próxima',
  documento_actualizado: 'Documento actualizado',
  reporte_generado: 'Reporte generado',
  prueba: 'Prueba',
  recordatorio_semanal: 'Recordatorio semanal',
  prestamo_solicitado: 'Préstamo solicitado',
  prestamo_aprobado: 'Préstamo aprobado',
  prestamo_rechazado: 'Préstamo rechazado',
  prestamo_devuelto: 'Préstamo devuelto',
  alerta_admin: 'Alerta administrativa',
  prestamo_por_vencer: 'Préstamo por vencer',
  prestamo_vencido: 'Préstamo vencido',
  actualizacion_sistema: 'Novedad del sistema',
  informe_departamento: 'Informe de departamento',
  aviso_departamento: 'Aviso de departamento',
}

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory> = {
  curso_nuevo: 'escuela',
  circular_nueva: 'documentos',
  documento_actualizado: 'documentos',
  asistencia_pendiente: 'cuarteles',
  cambio_estado: 'cuarteles',
  estadisticas_nuevas: 'sistema',
  reporte_generado: 'sistema',
  actividad_proxima: 'calendario',
  prueba: 'sistema',
  recordatorio_semanal: 'sistema',
  alerta_admin: 'sistema',
  actualizacion_sistema: 'sistema',
  prestamo_solicitado: 'inventario',
  prestamo_aprobado: 'inventario',
  prestamo_rechazado: 'inventario',
  prestamo_devuelto: 'inventario',
  prestamo_por_vencer: 'inventario',
  prestamo_vencido: 'inventario',
  informe_departamento: 'departamentos',
  aviso_departamento: 'departamentos',
}

// Módulo de un aviso: los que vienen de un departamento (0106) van a
// Departamentos aunque sean de otro tipo (un evento, una circular).
export function notificationCategory(n: Pick<Notification, 'type' | 'department_id'>): NotificationCategory {
  return n.department_id ? 'departamentos' : NOTIFICATION_CATEGORY[n.type]
}

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  sistema: 'Sistema',
  escuela: 'Escuela',
  inventario: 'Inventario',
  documentos: 'Documentos',
  calendario: 'Calendario',
  cuarteles: 'Cuarteles',
  departamentos: 'Departamentos',
}

export const NOTIFICATION_CATEGORY_ICON: Record<NotificationCategory, string> = {
  sistema: 'info',
  escuela: 'school',
  inventario: 'tag',
  documentos: 'file',
  calendario: 'calendar',
  cuarteles: 'building',
  departamentos: 'clipboardList',
}

// Importantes: piden hacer algo o avisan un problema.
const IMPORTANT_TYPES = new Set<NotificationType>([
  'alerta_admin',
  'prestamo_vencido',
  'prestamo_por_vencer',
  'prestamo_aprobado',
  'prestamo_solicitado',
  'asistencia_pendiente',
])

export function isImportantNotification(n: Pick<Notification, 'type'>): boolean {
  return IMPORTANT_TYPES.has(n.type)
}

// Adónde lleva "Abrir": el elemento exacto si el aviso trae link_path (0102);
// si no, el módulo donde está lo que se avisa.
export function notificationLink(n: Pick<Notification, 'type' | 'link_path' | 'station_id'>, canManageUsers: boolean): string | null {
  if (n.link_path && n.link_path.startsWith('/')) return n.link_path
  switch (n.type) {
    case 'prestamo_solicitado':
    case 'prestamo_aprobado':
    case 'prestamo_rechazado':
    case 'prestamo_devuelto':
    case 'prestamo_por_vencer':
    case 'prestamo_vencido':
      return '/inventario/solicitudes'
    case 'curso_nuevo':
      return '/escuela'
    case 'circular_nueva':
    case 'documento_actualizado':
      return '/documentos'
    case 'actividad_proxima':
      return '/calendario'
    case 'asistencia_pendiente':
    case 'cambio_estado':
      return n.station_id ? `/cuarteles/${n.station_id}` : '/cuarteles'
    case 'reporte_generado':
    case 'estadisticas_nuevas':
      return '/reportes'
    case 'informe_departamento':
      return '/departamentos'
    case 'actualizacion_sistema':
      return '/novedades'
    case 'alerta_admin':
      return canManageUsers ? '/usuarios' : null
    case 'recordatorio_semanal':
      return '/panel'
    default:
      return null
  }
}

export function timeAgo(iso: string): string {
  const diffMs = Date.parse(iso) ? Date.now() - Date.parse(iso) : 0
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
