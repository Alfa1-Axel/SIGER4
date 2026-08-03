import { supabase } from '../supabaseClient'
import type { InventoryItem, InventoryItemHistory, InventoryCategory, InventoryStatus } from '../../types/database'

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from('inventory_items').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as InventoryItem[]
}

export async function fetchInventoryItemById(id: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase.from('inventory_items').select('*').eq('id', id).single()
  if (error) return null
  return data as InventoryItem
}

export interface InventoryItemInput {
  name: string
  category: InventoryCategory
  category_other_label?: string | null
  description?: string | null
  status?: InventoryStatus
  region_id: string
  subsede_id?: string | null
  station_id?: string | null
  responsible_profile_id?: string | null
  responsible_name?: string | null
  contact_info?: string | null
  observations?: string | null
  created_by_profile_id?: string | null
}

export async function createInventoryItem(input: InventoryItemInput): Promise<InventoryItem> {
  const { data, error } = await supabase.from('inventory_items').insert(input).select('*').single()
  if (error) throw error
  return data as InventoryItem
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItemInput>): Promise<InventoryItem> {
  const { data, error } = await supabase.from('inventory_items').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as InventoryItem
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

export async function fetchInventoryItemHistory(itemId: string): Promise<InventoryItemHistory[]> {
  const { data, error } = await supabase
    .from('inventory_item_history')
    .select('*')
    .eq('inventory_item_id', itemId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InventoryItemHistory[]
}
