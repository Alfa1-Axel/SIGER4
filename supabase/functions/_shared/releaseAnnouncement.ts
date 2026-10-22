// Contrato de los avisos de actualización publicada, compartido por la Edge Function announce-release (Deno) y el comando
// `npm run release:announce` (Node). Solo funciones puras y datos, sin APIs de ninguno de los dos entornos, para poder
// probarlas en Node (tests/release/) y usarlas igual en Deno.
//
// La lista de módulos y el texto del aviso también están en la base (0122_release_announcements.sql: release_modules() y
// release_announcement_body()). Si se cambia uno, se cambia el otro: las pruebas de tests/db y tests/release lo comparan.

export const ANNOUNCEMENT_TITLE = 'Nueva actualización'

// Nombres visibles de los módulos que se pueden nombrar en un aviso. Lenguaje de todos los días: nunca nombres técnicos de
// tablas, rutas o componentes. "Regional", nunca "Región".
export const RELEASE_MODULES = [
  'Inicio',
  'Usuarios y roles',
  'Cuarteles',
  'Efectivos',
  'Asistencia',
  'Móviles',
  'Departamentos',
  'Informes y actas',
  'Escuela',
  'Avales',
  'Documentos',
  'Inventario',
  'Calendario',
  'Mapa Regional',
  'Reportes',
  'Notificaciones',
  'Mi perfil',
  'Seguridad',
] as const

export const MAX_RELEASE_MODULES = 6
export const VERSION_PATTERN = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}$/
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/

export interface ReleaseRequest {
  version: string
  modules: string[]
  commit: string | null
}

export type ReleaseParseResult = { ok: true; value: ReleaseRequest } | { ok: false; message: string }

// Valida y normaliza lo que llega en el pedido: versión con formato 1.18.0, entre 1 y 6 módulos de la lista, sin repetir y
// en el orden en que se pasaron, y un commit opcional. Todo lo demás se rechaza; nada de texto libre.
export function parseReleaseRequest(input: unknown): ReleaseParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, message: 'El pedido no es válido.' }
  const body = input as Record<string, unknown>

  const version = typeof body.version === 'string' ? body.version.trim() : ''
  if (!VERSION_PATTERN.test(version)) return { ok: false, message: 'La versión no es válida: usá el formato 1.18.0.' }

  if (!Array.isArray(body.modules)) return { ok: false, message: 'Indicá los módulos actualizados.' }
  const modules: string[] = []
  for (const item of body.modules) {
    if (typeof item !== 'string') return { ok: false, message: 'Los módulos tienen que ser texto.' }
    const name = item.trim()
    if (!(RELEASE_MODULES as readonly string[]).includes(name)) return { ok: false, message: `El módulo "${name.slice(0, 40)}" no figura en la lista permitida.` }
    if (!modules.includes(name)) modules.push(name)
  }
  if (modules.length < 1 || modules.length > MAX_RELEASE_MODULES) return { ok: false, message: `Indicá entre 1 y ${MAX_RELEASE_MODULES} módulos actualizados.` }

  let commit: string | null = null
  if (body.commit !== undefined && body.commit !== null && body.commit !== '') {
    const raw = typeof body.commit === 'string' ? body.commit.trim().toLowerCase() : ''
    if (!COMMIT_PATTERN.test(raw)) return { ok: false, message: 'El identificador del commit no es válido.' }
    commit = raw
  }

  return { ok: true, value: { version, modules, commit } }
}

// "Hay una nueva actualización en Documentos." / "Hay nuevas actualizaciones en Roles, Mapa Regional y Documentos."
export function releaseAnnouncementBody(modules: readonly string[]): string {
  if (modules.length === 1) return `Hay una nueva actualización en ${modules[0]}.`
  return `Hay nuevas actualizaciones en ${modules.slice(0, -1).join(', ')} y ${modules[modules.length - 1]}.`
}

// Comparación sin cortar en la primera diferencia, para que el tiempo de respuesta no delate cuántos caracteres del secreto
// coinciden.
export function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

// Lo que publica cada despliegue en /version.json: la versión técnica, el commit y el servidor de datos con el que se armó
// (solo el nombre del servidor, que de todos modos viaja en el código de la aplicación). Devuelve null si lo recibido no
// tiene el formato esperado.
export interface ServedBuild {
  version: string
  commit: string | null
  supabaseHost: string | null
}

export function parseServedBuild(input: unknown): ServedBuild | null {
  if (typeof input !== 'object' || input === null) return null
  const data = input as Record<string, unknown>
  if (typeof data.version !== 'string' || !VERSION_PATTERN.test(data.version.trim())) return null
  const host = typeof data.supabaseHost === 'string' && /^[a-z0-9.-]{1,120}$/i.test(data.supabaseHost) ? data.supabaseHost.toLowerCase() : null
  const commit = typeof data.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(data.commit) ? data.commit.toLowerCase() : null
  return { version: data.version.trim(), commit, supabaseHost: host }
}

// Sin la barra final y solo https (o http en localhost, para pruebas): evita apuntar la verificación a cualquier lado.
export function normalizePublicUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? '').trim().replace(/\/+$/, '')
  if (!value) return null
  if (/^https:\/\/[a-z0-9.-]+(:[0-9]{2,5})?$/i.test(value)) return value
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{2,5})?$/i.test(value)) return value
  return null
}
