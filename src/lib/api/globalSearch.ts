import { supabase } from '../supabaseClient'
import { fetchCoordinatingProfileIds } from './departments'
import { DEPARTMENT_REPORT_TYPE_LABEL } from './departmentReports'
import { HIDDEN_NOTIFICATION_TYPE, NOTIFICATION_TYPE_LABEL } from '../notificationMeta'
import { canUseModule } from '../moduleAccess'
import type { AppModule } from '../moduleAccess'
import type { RoleKey } from '../../types/roles'
import type {
  CalendarEvent,
  Course,
  Department,
  DepartmentReport,
  DocumentRecord,
  InventoryItem,
  InventoryLoanRequest,
  Notification,
  Profile,
  SchoolAvalDocument,
  Station,
} from '../../types/database'

// Búsqueda global (barra "Buscar en SIGER4"). Una consulta liviana por
// módulo, en paralelo y con límite. Cada consulta pasa por la RLS de su
// tabla: lo que el usuario no puede leer no aparece. Donde la RLS deja leer
// más de lo que la pantalla deja abrir (perfiles), se filtra además acá.

export type SearchModule =
  | 'usuarios'
  | 'cuarteles'
  | 'departamentos'
  | 'informes'
  | 'documentos'
  | 'avales'
  | 'inventario'
  | 'solicitudes'
  | 'cursos'
  | 'calendario'
  | 'notificaciones'

export interface SearchResult {
  id: string
  module: SearchModule
  title: string
  subtitle?: string
  to: string
}

export const SEARCH_MODULE_LABEL: Record<SearchModule, string> = {
  usuarios: 'Usuarios',
  cuarteles: 'Cuarteles',
  departamentos: 'Departamentos',
  informes: 'Informes y actas',
  documentos: 'Documentos',
  avales: 'Avales de Escuela',
  inventario: 'Inventario',
  solicitudes: 'Solicitudes de préstamo',
  cursos: 'Cursos de Escuela',
  calendario: 'Calendario',
  notificaciones: 'Notificaciones',
}

export const SEARCH_MODULE_ICON: Record<SearchModule, string> = {
  usuarios: 'user',
  cuarteles: 'building',
  departamentos: 'clipboardList',
  informes: 'file',
  documentos: 'file',
  avales: 'school',
  inventario: 'tag',
  solicitudes: 'tag',
  cursos: 'school',
  calendario: 'calendar',
  notificaciones: 'bell',
}

export const SEARCH_MODULE_ORDER: SearchModule[] = [
  'usuarios',
  'cuarteles',
  'departamentos',
  'informes',
  'documentos',
  'avales',
  'inventario',
  'solicitudes',
  'cursos',
  'calendario',
  'notificaciones',
]

// Módulo de la aplicación al que pertenece cada módulo de búsqueda: en modo
// departamento solo se busca en los que ese modo abre.
const APP_MODULE_OF: Record<SearchModule, AppModule> = {
  usuarios: 'usuarios',
  cuarteles: 'cuarteles',
  departamentos: 'departamentos',
  informes: 'departamentos',
  documentos: 'documentos',
  avales: 'avales',
  inventario: 'inventario',
  solicitudes: 'inventario',
  cursos: 'escuela',
  calendario: 'calendario',
  notificaciones: 'notificaciones',
}

export function canSearchModule(module: SearchModule, ctx: Pick<SearchContext, 'departmentOnly'>): boolean {
  return canUseModule(APP_MODULE_OF[module], ctx.departmentOnly)
}

// Qué puede buscar quien mira. Espejo de las guardas de cada pantalla; la
// base (RLS) sigue decidiendo qué devuelve cada consulta.
export interface SearchContext {
  // Modo departamento: solo se busca en los módulos que ese modo abre.
  departmentOnly: boolean
  hasReportsAccess: boolean
  hasAvalesAccess: boolean
  profileId: string | null
  ownStationIds: string[]
  canSearchUsers: boolean
  // Jefe de Cuerpo Activo: solo usuarios de su cuartel que puede editar.
  usersLimitedToOwnStation: boolean
}

export const MIN_SEARCH_LENGTH = 2

// Deja letras, números y espacios: evita comodines de LIKE y caracteres que
// rompen los filtros .or() de PostgREST.
export function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[%_\\,()*:."'`;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function formatDay(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Usuarios privilegiados que un Jefe de Cuerpo Activo no puede abrir (mismo
// criterio que UsuarioDetallePage / admin-update-user).
const PRIVILEGED_FOR_JEFE: RoleKey[] = [
  'informatica_r4',
  'integrante_informatica',
  'director_escuela',
  'instructor',
  'secretario_regional',
  'coordinador_escuela',
  'secretario_escuela',
]

async function searchUsers(like: string, ctx: SearchContext, limit: number): Promise<SearchResult[]> {
  if (!ctx.canSearchUsers) return []
  let query = supabase
    .from('profiles')
    .select('id, full_name, email, rank, station_id, is_active')
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order('full_name')
    .limit(limit)
  if (ctx.usersLimitedToOwnStation) {
    if (ctx.ownStationIds.length === 0) return []
    query = query.in('station_id', ctx.ownStationIds)
  }
  const { data, error } = await query
  if (error) throw error
  let rows = (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'rank' | 'station_id' | 'is_active'>[]
  if (ctx.usersLimitedToOwnStation && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const [{ data: roles }, { data: coordinated }] = await Promise.all([
      supabase.from('user_roles').select('profile_id, role').in('profile_id', ids),
      fetchCoordinatingProfileIds(ids).then((data) => ({ data })),
    ])
    const blocked = new Set<string>([
      ...((roles ?? []) as { profile_id: string; role: RoleKey }[]).filter((r) => PRIVILEGED_FOR_JEFE.includes(r.role)).map((r) => r.profile_id),
      ...coordinated,
    ])
    rows = rows.filter((r) => !blocked.has(r.id))
  }
  return rows.map((p) => ({
    id: p.id,
    module: 'usuarios',
    title: p.full_name,
    subtitle: [p.rank, p.email, p.is_active ? null : 'Inactivo'].filter(Boolean).join(' · '),
    to: `/usuarios/${p.id}`,
  }))
}

async function searchStations(like: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id, name, code, address')
    .or(`name.ilike.${like},code.ilike.${like},address.ilike.${like}`)
    .order('name')
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<Station, 'id' | 'name' | 'code' | 'address'>[]).map((s) => ({
    id: s.id,
    module: 'cuarteles',
    title: s.name,
    subtitle: [s.code, s.address].filter(Boolean).join(' · '),
    to: `/cuarteles/${s.id}`,
  }))
}

async function searchDepartments(like: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, description, is_active')
    .or(`name.ilike.${like},description.ilike.${like}`)
    .order('name')
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<Department, 'id' | 'name' | 'description' | 'is_active'>[]).map((d) => ({
    id: d.id,
    module: 'departamentos',
    title: d.name,
    subtitle: [d.description, d.is_active ? null : 'Inactivo'].filter(Boolean).join(' · '),
    to: `/departamentos/${d.id}`,
  }))
}

async function searchReports(like: string, ctx: SearchContext, limit: number, departmentName: (id: string) => string): Promise<SearchResult[]> {
  if (!ctx.hasReportsAccess) return []
  const { data, error } = await supabase
    .from('department_reports')
    .select('id, title, report_type, report_date, department_id, is_archived')
    .or(`title.ilike.${like},body.ilike.${like}`)
    .order('report_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<DepartmentReport, 'id' | 'title' | 'report_type' | 'report_date' | 'department_id' | 'is_archived'>[]).map((r) => ({
    id: r.id,
    module: 'informes',
    title: r.title,
    subtitle: [departmentName(r.department_id), DEPARTMENT_REPORT_TYPE_LABEL[r.report_type], formatDay(r.report_date), r.is_archived ? 'Archivado' : null]
      .filter(Boolean)
      .join(' · '),
    to: `/departamentos/informes/${r.id}`,
  }))
}

async function searchDocuments(like: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, category, folder_id, created_at, storage_path, deleted_at')
    .or(`title.ilike.${like},category.ilike.${like}`)
    .is('deleted_at', null)
    .neq('storage_path', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<DocumentRecord, 'id' | 'title' | 'category' | 'folder_id' | 'created_at'>[]).map((d) => ({
    id: d.id,
    module: 'documentos',
    title: d.title,
    subtitle: [d.category, formatDay(d.created_at)].filter(Boolean).join(' · '),
    to: `/documentos/carpetas/${d.folder_id ?? 'general'}`,
  }))
}

async function searchAvales(like: string, ctx: SearchContext, limit: number, departmentName: (id: string) => string): Promise<SearchResult[]> {
  if (!ctx.hasAvalesAccess) return []
  const { data, error } = await supabase
    .from('school_avales_documents')
    .select('id, title, department_id, created_at, is_archived')
    .or(`title.ilike.${like},description.ilike.${like}`)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<SchoolAvalDocument, 'id' | 'title' | 'department_id' | 'created_at'>[]).map((a) => ({
    id: a.id,
    module: 'avales',
    title: a.title,
    subtitle: [departmentName(a.department_id), formatDay(a.created_at)].filter(Boolean).join(' · '),
    to: `/escuela/avales?departamento=${a.department_id}`,
  }))
}

const LOAN_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  retirada: 'Prestado',
  devuelta: 'Devuelto',
  cancelada: 'Cancelada',
}

async function searchInventory(like: string, limit: number, stationName: (id: string) => string): Promise<{ items: SearchResult[]; requests: SearchResult[] }> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, category, status')
    .or(`name.ilike.${like},description.ilike.${like}`)
    .neq('status', 'baja')
    .order('name')
    .limit(limit)
  if (error) throw error
  const items = (data ?? []) as Pick<InventoryItem, 'id' | 'name' | 'category' | 'status'>[]
  const itemResults: SearchResult[] = items.map((i) => ({
    id: i.id,
    module: 'inventario',
    title: i.name,
    subtitle: i.status === 'disponible' ? 'Disponible' : i.status === 'mantenimiento' ? 'En mantenimiento' : 'No disponible',
    to: `/inventario/${i.id}`,
  }))
  if (items.length === 0) return { items: itemResults, requests: [] }
  const { data: loans, error: loansError } = await supabase
    .from('inventory_loan_requests')
    .select('id, inventory_item_id, requesting_station_id, status, created_at')
    .in('inventory_item_id', items.map((i) => i.id))
    .order('created_at', { ascending: false })
    .limit(limit)
  if (loansError) throw loansError
  const nameOf = new Map(items.map((i) => [i.id, i.name]))
  const requestResults: SearchResult[] = ((loans ?? []) as Pick<InventoryLoanRequest, 'id' | 'inventory_item_id' | 'requesting_station_id' | 'status' | 'created_at'>[]).map((l) => ({
    id: l.id,
    module: 'solicitudes',
    title: `${nameOf.get(l.inventory_item_id) ?? 'Elemento'} · ${stationName(l.requesting_station_id)}`,
    subtitle: `${LOAN_STATUS_LABEL[l.status] ?? l.status} · ${formatDay(l.created_at)}`,
    to: `/inventario/solicitudes/${l.id}`,
  }))
  return { items: itemResults, requests: requestResults }
}

async function searchCourses(like: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, category, status, start_date')
    .or(`title.ilike.${like},category.ilike.${like}`)
    .order('start_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<Course, 'id' | 'title' | 'category' | 'status' | 'start_date'>[]).map((c) => ({
    id: c.id,
    module: 'cursos',
    title: c.title,
    subtitle: [c.category, c.start_date ? formatDay(c.start_date) : null].filter(Boolean).join(' · '),
    to: '/escuela',
  }))
}

async function searchEvents(like: string, limit: number, onlyDepartments: boolean): Promise<SearchResult[]> {
  let query = supabase
    .from('calendar_events')
    .select('id, title, starts_at, status')
    .or(`title.ilike.${like},description.ilike.${like}`)
    .neq('status', 'cancelado')
    .order('starts_at', { ascending: false })
    .limit(limit)
  // Modo departamento: solo eventos de sus departamentos (la RLS ya lo exige).
  if (onlyDepartments) query = query.not('department_id', 'is', null)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Pick<CalendarEvent, 'id' | 'title' | 'starts_at'>[]).map((e) => ({
    id: e.id,
    module: 'calendario',
    title: e.title,
    subtitle: formatDay(e.starts_at),
    to: `/calendario/${e.id}`,
  }))
}

async function searchNotifications(like: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('my_notifications')
    .select('id, title, type, created_at')
    .neq('type', HIDDEN_NOTIFICATION_TYPE)
    .or(`title.ilike.${like},body.ilike.${like}`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Pick<Notification, 'id' | 'title' | 'type' | 'created_at'>[]).map((n) => ({
    id: n.id,
    module: 'notificaciones',
    title: n.title,
    subtitle: `${NOTIFICATION_TYPE_LABEL[n.type] ?? 'Aviso'} · ${formatDay(n.created_at)}`,
    to: '/notificaciones',
  }))
}

export interface SearchLookups {
  departmentName: (id: string) => string
  stationName: (id: string) => string
}

export interface SearchOutcome {
  results: Partial<Record<SearchModule, SearchResult[]>>
  failedModules: SearchModule[]
}

// limit: por módulo. Con "only" se busca en un solo módulo (más resultados).
export async function searchEverything(rawQuery: string, ctx: SearchContext, lookups: SearchLookups, options: { limit: number; only?: SearchModule }): Promise<SearchOutcome> {
  const term = sanitizeSearchTerm(rawQuery)
  if (term.length < MIN_SEARCH_LENGTH) return { results: {}, failedModules: [] }
  const like = `%${term}%`
  const { limit, only } = options
  // Un módulo que el rol no abre (modo departamento) ni se consulta.
  const wants = (m: SearchModule) => canSearchModule(m, ctx) && (!only || only === m)

  const tasks: [SearchModule[], () => Promise<Partial<Record<SearchModule, SearchResult[]>>>][] = []
  const add = (modules: SearchModule[], fn: () => Promise<Partial<Record<SearchModule, SearchResult[]>>>) => {
    if (modules.some(wants)) tasks.push([modules, fn])
  }
  add(['usuarios'], async () => ({ usuarios: await searchUsers(like, ctx, limit) }))
  add(['cuarteles'], async () => ({ cuarteles: await searchStations(like, limit) }))
  add(['departamentos'], async () => ({ departamentos: await searchDepartments(like, limit) }))
  add(['informes'], async () => ({ informes: await searchReports(like, ctx, limit, lookups.departmentName) }))
  add(['documentos'], async () => ({ documentos: await searchDocuments(like, limit) }))
  add(['avales'], async () => ({ avales: await searchAvales(like, ctx, limit, lookups.departmentName) }))
  add(['inventario', 'solicitudes'], async () => {
    const r = await searchInventory(like, limit, lookups.stationName)
    return { inventario: r.items, solicitudes: r.requests }
  })
  add(['cursos'], async () => ({ cursos: await searchCourses(like, limit) }))
  add(['calendario'], async () => ({ calendario: await searchEvents(like, limit, ctx.departmentOnly) }))
  add(['notificaciones'], async () => ({ notificaciones: await searchNotifications(like, limit) }))

  const outcome: SearchOutcome = { results: {}, failedModules: [] }
  const settled = await Promise.allSettled(tasks.map(([, fn]) => fn()))
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      for (const [module, list] of Object.entries(res.value) as [SearchModule, SearchResult[]][]) {
        if (wants(module)) outcome.results[module] = list
      }
    } else {
      outcome.failedModules.push(...tasks[i][0].filter(wants))
    }
  })
  return outcome
}
