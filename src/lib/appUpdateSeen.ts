// SIGER4 - Control de "el usuario ya vio esta novedad" (ver
// AppUpdateBanner.tsx / src/config/appUpdates.ts).
//
// localStorage, no una tabla en la base: la única función de esto es "no
// repetir el banner en el mismo navegador" — no hace falta que sobreviva a
// un cambio de dispositivo, no hace falta consultarlo desde otro lugar del
// sistema, no hace falta auditoría de quién vio qué. Agregar una tabla
// (user_id/update_id/seen_at) sería una migración + políticas RLS + una
// llamada de red extra en cada login solo para guardar un booleano por
// usuario que ya vive perfectamente bien en el propio navegador. Si en el
// futuro hiciera falta saber "cuántos usuarios vieron la última novedad"
// (métrica agregada, no por-usuario), ahí sí valdría la pena reconsiderar.
//
// localStorage (no sessionStorage) a propósito: el banner debe aparecer una
// vez por usuario, no una vez por pestaña — si se repitiera en cada sesión
// nueva del navegador dejaría de ser "no invasivo".
const STORAGE_PREFIX = 'siger4:update-seen:'

export function hasSeenAppUpdate(updateId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + updateId) === '1'
  } catch {
    // localStorage puede fallar (modo privado, cuota agotada) — en ese caso
    // se prefiere mostrar el banner de más antes que asumir "ya visto" sin
    // poder confirmarlo.
    return false
  }
}

export function markAppUpdateSeen(updateId: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + updateId, '1')
  } catch {
    // Si falla, el banner puede volver a aparecer en la próxima carga — no
    // es un error que deba interrumpir el cierre del banner.
  }
}
