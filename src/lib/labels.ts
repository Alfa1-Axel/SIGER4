// Etiquetas en lenguaje de todos los días de los estados y tipos que se muestran en varias pantallas y en los reportes.
// Viven acá (y no en cada pantalla) para que las pantallas solo exporten componentes y los reportes no dependan de ellas.
import type {
  CalendarEventStatus,
  CalendarEventType,
  DepartmentActivityType,
  InventoryCategory,
  InventoryStatus,
  LoanRequestStatus,
} from '../types/database'

export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  regional: 'Regional',
  cuartel: 'Cuartel',
  escuela: 'Escuela',
  capacitacion: 'Capacitación',
  vencimiento: 'Vencimiento',
  guardia: 'Guardia',
  reunion: 'Reunión',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
}

export const EVENT_STATUS_LABEL: Record<CalendarEventStatus, string> = {
  programado: 'Programado',
  cancelado: 'Cancelado',
  finalizado: 'Finalizado',
}

export const DEPARTMENT_ACTIVITY_TYPE_LABEL: Record<DepartmentActivityType, string> = {
  reunion: 'Reunión',
  capacitacion: 'Capacitación',
  practica: 'Práctica',
  mantenimiento: 'Mantenimiento',
  gestion: 'Gestión',
  informe: 'Informe',
  otro: 'Otro',
}

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

export const LOAN_REQUEST_STATUS_LABEL: Record<LoanRequestStatus, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
  devuelta: 'Devuelta',
  cancelada: 'Cancelada',
}

export const LOAN_REQUEST_STATUS_BADGE: Record<LoanRequestStatus, string> = {
  pendiente: 'badge-warning',
  aprobada: 'badge-info',
  rechazada: 'badge-danger',
  retirada: 'badge-info',
  devuelta: 'badge-success',
  cancelada: 'badge-danger',
}
