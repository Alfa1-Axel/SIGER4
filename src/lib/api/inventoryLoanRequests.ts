import { supabase } from '../supabaseClient'
import type { InventoryLoanRequest, LoanRequestStatus } from '../../types/database'

export async function fetchLoanRequests(): Promise<InventoryLoanRequest[]> {
  const { data, error } = await supabase.from('inventory_loan_requests').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InventoryLoanRequest[]
}

export async function fetchLoanRequestsByItem(itemId: string): Promise<InventoryLoanRequest[]> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .select('*')
    .eq('inventory_item_id', itemId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InventoryLoanRequest[]
}

// Distingue "no existe" (PGRST116, 0 filas -- id inválido o borrado, caso
// legítimo de devolver null) de cualquier otro error real (RLS, red, etc.)
// -- antes esta función devolvía null ante CUALQUIER error, incluida una
// falla real de la base, y la pantalla de detalle mostraba "No se encontró
// la solicitud" sin ninguna pista de qué había fallado en realidad.
export async function fetchLoanRequestById(id: string): Promise<InventoryLoanRequest | null> {
  const { data, error } = await supabase.from('inventory_loan_requests').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as InventoryLoanRequest
}

export interface CreateLoanRequestInput {
  inventory_item_id: string
  requesting_station_id: string
  requested_by_profile_id: string
  responsible_profile_id?: string | null
  request_reason?: string | null
  requested_from?: string
  expected_return_at?: string | null
  notes?: string | null
}

export async function createLoanRequest(input: CreateLoanRequestInput): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase.from('inventory_loan_requests').insert(input).select('*').single()
  if (error) throw error
  return data as InventoryLoanRequest
}

// Las transiciones de estado se hacen con updates puntuales (no un update
// generico): cada accion (aprobar/rechazar/retirar/devolver/cancelar) solo
// toca las columnas que le corresponden, para no pisar por accidente un
// campo de otra etapa del flujo (ej. rechazar no debe poder tocar
// delivered_at). El status en si SIEMPRE es parte de cada llamada, nunca se
// actualiza por separado.

export async function approveLoanRequest(id: string, approvedByProfileId: string): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .update({ status: 'aprobada' as LoanRequestStatus, approved_by_profile_id: approvedByProfileId, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryLoanRequest
}

export async function rejectLoanRequest(id: string, rejectedByProfileId: string, reason: string | null): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .update({
      status: 'rechazada' as LoanRequestStatus,
      rejected_by_profile_id: rejectedByProfileId,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryLoanRequest
}

export async function registerLoanDelivery(id: string, deliveredByProfileId: string, condition: string | null): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .update({
      status: 'retirada' as LoanRequestStatus,
      delivered_by_profile_id: deliveredByProfileId,
      delivered_at: new Date().toISOString(),
      delivery_condition: condition,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryLoanRequest
}

export async function registerLoanReturn(id: string, returnedByProfileId: string, condition: string | null): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .update({
      status: 'devuelta' as LoanRequestStatus,
      returned_by_profile_id: returnedByProfileId,
      returned_at: new Date().toISOString(),
      return_condition: condition,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryLoanRequest
}

export async function cancelLoanRequest(id: string): Promise<InventoryLoanRequest> {
  const { data, error } = await supabase
    .from('inventory_loan_requests')
    .update({ status: 'cancelada' as LoanRequestStatus })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryLoanRequest
}
