import { PostgrestError } from '@supabase/supabase-js'

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
export function describeSupabaseError(err: unknown, fallback = 'Ocurrió un error inesperado. Intentá de nuevo.'): string {
  if (err instanceof PostgrestError) {
    if (err.code === '42501') return 'No tenés permisos para realizar esta acción.'
    if (err.code === 'PGRST116') {
      return 'No tenés permisos para realizar esta acción, o la solicitud ya no está en el estado esperado. Recargá la página e intentá de nuevo.'
    }
    if (err.code === '23502') {
      const match = err.message.match(/column "([^"]+)"/)
      return match ? `Falta completar un campo obligatorio: ${match[1]}.` : 'Falta completar un campo obligatorio.'
    }
    if (err.code === '23503') return 'Uno de los datos hace referencia a un registro que no existe o fue eliminado.'
    if (err.code === '23514') return 'El valor ingresado no es válido para el estado actual del registro.'
    // P0001: "raise exception" explícito de un trigger nuestro (ver
    // validate_inventory_loan_request_item_status en 0057) -- el mensaje ya
    // está pensado para mostrarse tal cual, en español, al usuario.
    if (err.code === 'P0001') return err.message
    if (err.hint) return `${err.message} (${err.hint})`
    return err.message
  }
  if (err instanceof Error) return err.message || fallback
  return fallback
}
