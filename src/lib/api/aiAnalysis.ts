import { supabase } from '../supabaseClient'

export interface AiAnalysisRequest {
  reportKey: string
  reportLabel: string
  scopeLabel: string
  periodLabel: string
  summary: Record<string, unknown>
}

export interface AiAnalysisResult {
  available: boolean
  analysis?: string
  reason?: string
}

// Llama a la Edge Function "analyze-report" (Gemini). La clave de la API de IA
// vive únicamente como secreto de esa función en Supabase, nunca acá. Si la
// función no está desplegada, no tiene la clave configurada, o Gemini falla,
// devolvemos available:false con un motivo legible en vez de lanzar — el
// llamador debe mostrar un fallback claro sin romper la generación del PDF.
export async function requestAiAnalysis(input: AiAnalysisRequest): Promise<AiAnalysisResult> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-report', { body: input })
    if (error) {
      return { available: false, reason: 'El análisis con IA no está disponible en este momento.' }
    }
    return data as AiAnalysisResult
  } catch {
    return { available: false, reason: 'El análisis con IA no está disponible en este momento.' }
  }
}
