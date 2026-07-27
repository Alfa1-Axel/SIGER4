import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

export interface AiAnalysisRequest {
  reportKey: string
  reportLabel: string
  scopeLabel: string
  periodLabel: string
  summary: Record<string, unknown>
}

export type AiAnalysisErrorCode = 'auth' | 'config' | 'payload' | 'gemini_request' | 'gemini_response' | 'unknown'

export interface AiAnalysisResult {
  available: boolean
  analysis?: string
  reason?: string
  code?: AiAnalysisErrorCode
  detail?: string
}

const GENERIC_FALLBACK_REASON = 'IA no disponible. El reporte se generará igualmente sin análisis automático.'

// Llama a la Edge Function "analyze-report" (Gemini). La clave de la API de IA
// vive únicamente como secreto de esa función en Supabase, nunca acá. Si la
// función no está desplegada, no tiene la clave configurada, o Gemini falla,
// devolvemos available:false con un motivo legible en vez de lanzar — el
// llamador debe mostrar un fallback claro sin romper la generación del PDF.
//
// La función puede responder con status 401/400/405 (no solo 200), en cuyo
// caso supabase.functions.invoke() lo trata como FunctionsHttpError: el
// cuerpo JSON con "reason"/"code"/"detail" sigue estando en error.context, no
// se pierde. Antes de este fix, cualquier respuesta no-200 caía directo al
// mensaje genérico y el motivo real (por ej. "modelo no encontrado") quedaba
// invisible incluso para diagnosticar por consola.
export async function requestAiAnalysis(input: AiAnalysisRequest): Promise<AiAnalysisResult> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-report', { body: input })

    if (error) {
      const bodyFromError = error instanceof FunctionsHttpError ? await tryParseErrorBody(error) : null
      logDiagnostics(bodyFromError ?? { code: 'unknown', detail: error.message })
      return { available: false, reason: bodyFromError?.reason ?? GENERIC_FALLBACK_REASON, ...bodyFromError }
    }

    const result = data as AiAnalysisResult
    if (!result.available) logDiagnostics(result)
    return result
  } catch (err) {
    logDiagnostics({ code: 'unknown', detail: err instanceof Error ? err.message : String(err) })
    return { available: false, reason: GENERIC_FALLBACK_REASON, code: 'unknown' }
  }
}

async function tryParseErrorBody(error: FunctionsHttpError): Promise<Partial<AiAnalysisResult> | null> {
  try {
    const body = await error.context.json()
    return body as Partial<AiAnalysisResult>
  } catch {
    return null
  }
}

// Diagnóstico en consola del navegador para que quien reporte el problema
// pueda copiar el motivo técnico exacto (nunca incluye la API key: esta vive
// solo como secreto de la Edge Function, nunca llega al frontend).
function logDiagnostics(info: Partial<AiAnalysisResult>) {
  console.error('[SIGER4] Análisis IA no disponible', { code: info.code, detail: info.detail })
}
