import { supabase } from '../supabaseClient'

export type PendingItemPriority = 'alta' | 'media' | 'baja'

export interface PendingItem {
  itemKey: string
  title: string
  description: string
  priority: PendingItemPriority
  module: string
  linkPath: string
  sortKey: string
}

interface PendingItemApiRow {
  item_key: string
  title: string
  description: string
  priority: string
  module: string
  link_path: string
  sort_key: string
}

// get_pending_items() (migración 0075) ya viene scopeado del lado del
// servidor -- reutiliza los mismos helpers de alcance que el resto del
// sistema (is_informatica_r4/is_regional_role/is_escuela_role/
// my_station_ids/my_region_ids), así que no hace falta (ni corresponde)
// filtrar nada más acá del lado del cliente. El orden final (prioridad,
// después fecha) también se decide acá, no en SQL, para no atar el orden de
// presentación a la implementación de la función.
const PRIORITY_ORDER: Record<PendingItemPriority, number> = { alta: 0, media: 1, baja: 2 }

export async function fetchPendingItems(): Promise<PendingItem[]> {
  const { data, error } = await supabase.rpc('get_pending_items')
  if (error) throw error
  const items = ((data ?? []) as PendingItemApiRow[]).map((row) => ({
    itemKey: row.item_key,
    title: row.title,
    description: row.description,
    priority: row.priority as PendingItemPriority,
    module: row.module,
    linkPath: row.link_path,
    sortKey: row.sort_key,
  }))
  return items.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime()
  })
}
