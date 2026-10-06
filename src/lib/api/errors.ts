import { PostgrestError } from '@supabase/supabase-js'
import { FIELD_LABELS } from '../audit/humanize'

// Traduce un error real de Supabase/Postgres a un mensaje que un usuario
// pueda entender, en vez de dejar pasar el texto crudo de Postgres (a veces
// en inglés, a veces con nombres de columna/tabla) o, peor, un mensaje
// genérico que oculta la causa real. Pensado especialmente para RLS
// (código 42501 -- "no tenés permiso"), NOT NULL (23502 -- "falta un campo")
// y check constraints (23514 -- "el valor no es válido para el estado
// actual"), que son los tres casos que más golpean a un usuario común
// operando sobre una solicitud (aprobar/rechazar/retirar/devolver/cancelar).
//
// IMPORTANTE: cuando el UPDATE de una transición de estado no encuentra
// ninguna fila para actualizar (la policy RLS "using" rechazó la fila antes
// de llegar al check de permisos explícito, o alguien mandó un id que no
// existe), PostgREST no devuelve un error 42501 -- .update().select().single()
// simplemente no encuentra ninguna fila para el .select() posterior y
// PostgREST devuelve error code PGRST116 ("JSON object requested, multiple
// (or no) rows returned"). Ese caso hay que tratarlo explícitamente como
// "no tenés permiso" (la causa más común) en vez de mostrar ese texto
// técnico.
// fallback: mensaje a mostrar cuando el error NO es un PostgrestError (por
// ejemplo, una falla de Storage/caches/red que no viene de una tabla) y
// tampoco tiene su propio .message útil -- cada pantalla puede pasar un
// texto más específico que el genérico si lo tiene (ej. AjustesPage.tsx:
// "Cerrá y reabrí la app manualmente" para el botón de limpiar caché). Los
// errores de Postgres/RLS SIEMPRE se traducen primero sin importar este
// parámetro -- es solo el último recurso para errores que no vienen de la
// base o que no traen ningún mensaje propio.
const NETWORK_MESSAGE = 'No hay conexión con el servidor. Revisá tu conexión a internet y volvé a intentar.'
const PENDING_UPDATE_MESSAGE =
  'Esta función necesita una actualización de la base de datos que todavía no se aplicó. Avisá al Dpto. de Informática y Estadística R4.'

// Errores de red: fetch falla con TypeError ("Failed to fetch" en Chrome,
// "Load failed" en Safari, "NetworkError..." en Firefox).
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return ''
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /failed to fetch|load failed|networkerror|network request failed/i.test(errorMessage(err))
}

interface PostgrestLikeError {
  code: string
  message: string
}

// supabase-js devuelve los errores de la base como objeto plano
// ({ code, message, details, hint }), no como instancia de PostgrestError
// (solo lo es con .throwOnError()). Con "instanceof" ningún código se
// reconocía y todo terminaba en el mensaje genérico.
function isPostgrestError(err: unknown): err is PostgrestLikeError {
  if (err instanceof PostgrestError) return true
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string' &&
    ('details' in err || 'hint' in err)
  )
}

// Código de error de la base (ej. '23505') o null si no es un error de la base.
export function postgrestCode(err: unknown): string | null {
  return isPostgrestError(err) ? err.code : null
}

// Errores de Supabase Storage (StorageApiError/StorageUnknownError): llegan
// con mensajes en inglés. Se traducen los casos que el usuario puede
// resolver; el resto cae en el mensaje de respaldo de cada pantalla.
function describeStorageError(err: unknown): string | null {
  if (!(err instanceof Error) || !/^Storage/.test(err.name)) return null
  const text = err.message.toLowerCase()
  if (text.includes('row-level security') || text.includes('unauthorized') || text.includes('not authorized')) {
    return 'No tenés permiso para subir o ver este archivo.'
  }
  if (text.includes('mime') || text.includes('invalid_mime_type')) return 'Ese tipo de archivo no se admite en esta sección.'
  if (text.includes('exceeded') || text.includes('too large') || text.includes('payload')) return 'El archivo supera el tamaño máximo permitido.'
  if (text.includes('not found')) return 'El archivo no existe o fue eliminado.'
  return null
}

// Restricciones CHECK de la base con un mensaje que el usuario puede
// resolver. Si la restricción no está acá, se usa un mensaje general.
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  attendance_rate_range: 'La tasa de asistencia tiene que estar entre 0 y 100.',
  attendance_period_valid: 'La fecha de fin tiene que ser igual o posterior a la de inicio.',
  attendance_total_members_non_negative: 'La dotación no puede ser negativa.',
  attendance_present_average_non_negative: 'El promedio de presentes no puede ser negativo.',
  attendance_observations_length: 'Las observaciones pueden tener hasta 1000 caracteres.',
  calendar_events_dates_check: 'La fecha de fin del evento tiene que ser posterior al inicio.',
  calendar_events_single_scope: 'Elegí un solo destino para el evento: un cuartel, una subsede, la Regional o un departamento.',
  notifications_scope_not_ambiguous: 'No pudimos generar el aviso automático de este cambio. Avisale al Dpto. de Informática.',
}

// Permiso denegado por la RLS al guardar: mensaje según la sección.
const RLS_TABLE_MESSAGES: Record<string, string> = {
  attendance_summaries: 'No tenés permiso para cargar asistencia de este cuartel.',
  intervention_summaries: 'No tenés permiso para cargar intervenciones de este cuartel.',
  calendar_events: 'No tenés permiso para cargar eventos con ese destino.',
}

export function describeSupabaseError(err: unknown, fallback = 'Ocurrió un error inesperado. Intentá de nuevo.'): string {
  if (isNetworkError(err)) return NETWORK_MESSAGE
  const storageMessage = describeStorageError(err)
  if (storageMessage) return storageMessage
  if (isPostgrestError(err)) {
    if (err.code === '42501') {
      const table = err.message.match(/row-level security policy for table "([^"]+)"/)?.[1]
      return (table && RLS_TABLE_MESSAGES[table]) || 'No tenés permisos para realizar esta acción.'
    }
    // Función o tabla que la app espera y la base todavía no tiene: falta
    // correr una migración (PGRST202/PGRST205 de PostgREST, 42883/42P01 de
    // Postgres). Mejor decirlo así que mostrar un error genérico.
    if (err.code === 'PGRST202' || err.code === 'PGRST205' || err.code === '42883' || err.code === '42P01') return PENDING_UPDATE_MESSAGE
    if (err.code === 'PGRST116') {
      return 'No tenés permisos para realizar esta acción, o la solicitud ya no está en el estado esperado. Recargá la página e intentá de nuevo.'
    }
    if (err.code === '23502') {
      const match = err.message.match(/column "([^"]+)"/)
      const columnName = match?.[1]
      // FIELD_LABELS (mismo diccionario que traduce los diffs de Auditoría a
      // español) ya cubre los campos obligatorios reales del esquema -- si
      // el nombre de columna no está ahí (constraint nueva sin agregar al
      // diccionario), mejor el mensaje genérico que el nombre técnico crudo.
      const label = columnName ? FIELD_LABELS[columnName] : undefined
      return label ? `Falta completar un campo obligatorio: ${label}.` : 'Faltan completar campos obligatorios.'
    }
    if (err.code === '23503') return 'El registro está vinculado a otros datos y no puede eliminarse, o hace referencia a algo que no existe.'
    if (err.code === '23505') return 'Ya existe un registro con esos datos.'
    if (err.code === '23514') {
      const constraint = err.message.match(/check constraint "([^"]+)"/)?.[1]
      return (constraint && CHECK_CONSTRAINT_MESSAGES[constraint]) || 'Algún dato no cumple las reglas del sistema. Revisá los valores e intentá de nuevo.'
    }
    // P0001: "raise exception" explícito de un trigger nuestro (ver
    // validate_inventory_loan_request_item_status en 0057) -- el mensaje ya
    // está pensado para mostrarse tal cual, en español, al usuario.
    if (err.code === 'P0001') return err.message
    // Cualquier otro código de Postgres no contemplado explícitamente: nunca
    // mostrar err.message/err.hint crudo (viene en inglés, a veces con
    // nombres de tabla/columna/constraint) -- mensaje genérico institucional.
    return fallback
  }
  if (err instanceof Error) return err.message || fallback
  return fallback
}
