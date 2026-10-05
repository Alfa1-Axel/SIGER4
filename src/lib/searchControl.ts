// Abre la búsqueda global (GlobalSearch, en el encabezado) desde cualquier
// pantalla, por ejemplo el campo "Buscar en SIGER4" del Inicio.
export const OPEN_SEARCH_EVENT = 'siger4:open-search'

export function openGlobalSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}
