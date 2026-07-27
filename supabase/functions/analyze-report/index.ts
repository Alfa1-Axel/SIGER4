// SIGER4 - Edge Function: analyze-report
//
// Recibe un resumen agregado de un reporte (KPIs, series, texto) y devuelve un
// análisis institucional breve generado con Gemini. La clave de la API de IA
// (GEMINI_API_KEY) vive únicamente como secreto de esta función en Supabase,
// nunca en el frontend. Si la clave no está configurada o la llamada a Gemini
// falla, la función responde con available:false y un motivo legible en vez de
// un error 500 — el frontend debe mostrar un fallback claro sin romper el PDF.
//
// Despliegue: ver la sección "Análisis IA de reportes" en DEPLOYMENT.md.
//
// Nota sobre el modelo: "gemini-1.5-flash" fue dado de baja por Google: los
// modelos 1.5 dejaron de estar disponibles en la API pública. El modelo por
// defecto es "gemini-2.0-flash" (vigente, nivel gratuito). Si Google vuelve a
// cambiar los modelos disponibles, configurar el secreto GEMINI_MODEL en
// Supabase con el nombre del modelo vigente, sin re-desplegar código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AnalyzeRequestBody {
  reportKey: string
  reportLabel: string
  scopeLabel: string
  periodLabel: string
  summary: Record<string, unknown>
}

type ErrorCode = 'auth' | 'config' | 'payload' | 'quota' | 'gemini_request' | 'gemini_response' | 'unknown'

// available siempre viaja junto con "reason" (mensaje institucional, sin
// detalles técnicos) y opcionalmente "code"/"detail"/"model" (diagnóstico
// técnico, nunca incluye la clave — el nombre del modelo no es sensible, solo
// ayuda a diagnosticar problemas de "modelo dado de baja" desde la consola
// del navegador). El frontend muestra "reason" al usuario y puede loguear el
// resto para diagnóstico, sin exponer nada sensible.
function jsonResponse(
  body: { available: boolean; analysis?: string; reason?: string; code?: ErrorCode; detail?: string; model?: string },
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function buildPrompt(input: AnalyzeRequestBody): string {
  return `Sos un asistente institucional para SIGER4, el sistema de gestión de la Regional 4 de
Bomberos Voluntarios de Córdoba, Argentina. Analizá el siguiente resumen de datos reales de un
reporte de tipo "${input.reportLabel}" con alcance "${input.scopeLabel}" y período "${input.periodLabel}".

Datos agregados (JSON):
${JSON.stringify(input.summary, null, 2)}

Redactá un análisis institucional breve en español rioplatense, en texto plano (sin markdown,
sin asteriscos, sin encabezados), de no más de 180 palabras, que incluya en este orden:
1. Un resumen general de los datos.
2. Tendencias detectadas (si los datos lo permiten).
3. Puntos positivos a destacar.
4. Alertas o valores bajos que ameriten atención.
5. Una conclusión institucional simple y accionable.

Si los datos son insuficientes o están vacíos, decilo explícitamente en vez de inventar
información. No repitas los números crudos del JSON, interpretalos.`
}

interface GeminiCallError extends Error {
  code: ErrorCode
}

function geminiError(code: ErrorCode, message: string): GeminiCallError {
  const err = new Error(message) as GeminiCallError
  err.code = code
  return err
}

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      }),
    })
  } catch (err) {
    throw geminiError('gemini_request', `No se pudo contactar a Gemini: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    // 400 en Gemini suele ser modelo inexistente/API key invalida; 403 es
    // clave sin permisos o facturacion; 404 es modelo no encontrado (nombre
    // de modelo dado de baja). Se distinguen para que el diagnostico en
    // consola apunte directo a la causa en vez de un generico "fallo Gemini".
    if (response.status === 400 || response.status === 403) {
      throw geminiError('config', `Gemini respondió ${response.status} (posible API key inválida o sin permisos): ${errText.slice(0, 300)}`)
    }
    if (response.status === 404) {
      throw geminiError('config', `Gemini respondió 404: el modelo "${GEMINI_MODEL}" no existe o fue dado de baja. Detalle: ${errText.slice(0, 300)}`)
    }
    if (response.status === 429) {
      // Cuota/rate limit del nivel gratuito de Gemini, no un bug del sistema.
      // No se arregla redesplegando ni cambiando codigo: hay que esperar a que
      // se renueve la cuota, cambiar de API key/proyecto, o activar billing.
      throw geminiError('quota', `Gemini respondió 429 (límite de cuota/rate limit alcanzado, modelo "${GEMINI_MODEL}"): ${errText.slice(0, 300)}`)
    }
    throw geminiError('gemini_request', `Gemini respondió ${response.status}: ${errText.slice(0, 300)}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    throw geminiError('gemini_response', `Gemini devolvió una respuesta no JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  const blockReason = (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason
  if (blockReason) {
    throw geminiError('gemini_response', `Gemini bloqueó la respuesta (blockReason: ${blockReason}).`)
  }

  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string') {
    throw geminiError('gemini_response', `Gemini no devolvió texto de análisis. Respuesta: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return text.trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return jsonResponse({ available: false, reason: 'Método no permitido.', code: 'payload' }, 405)
  }

  let body: AnalyzeRequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ available: false, reason: 'Solicitud inválida.', code: 'payload' }, 400)
  }

  if (!body.reportKey || !body.summary) {
    return jsonResponse({ available: false, reason: 'Faltan datos del reporte.', code: 'payload' }, 400)
  }

  // Requiere un usuario autenticado real (no expone la función a anónimos):
  // se valida el JWT recibido contra Supabase Auth usando la anon key del
  // proyecto, igual que cualquier llamado autenticado del frontend.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ available: false, reason: 'No autenticado.', code: 'auth', detail: 'Falta el header Authorization.' }, 401)
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({
      available: false,
      reason: 'La función de IA no está configurada correctamente en el servidor.',
      code: 'config',
      detail: 'Faltan las variables de entorno SUPABASE_URL/SUPABASE_ANON_KEY (deberían estar disponibles automáticamente en toda Edge Function).',
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({
      available: false,
      reason: 'No autenticado.',
      code: 'auth',
      detail: userError?.message ?? 'No se pudo resolver el usuario a partir del token recibido.',
    }, 401)
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse({
      available: false,
      reason: 'El análisis con IA todavía no está configurado (falta GEMINI_API_KEY en el proyecto de Supabase).',
      code: 'config',
    })
  }

  try {
    const analysis = await callGemini(buildPrompt(body))
    return jsonResponse({ available: true, analysis })
  } catch (err) {
    const code: ErrorCode = (err as Partial<GeminiCallError>)?.code ?? 'unknown'
    const reason =
      code === 'quota'
        ? 'IA no disponible por límite de cuota de Gemini. El reporte se generó correctamente sin análisis automático.'
        : 'No pudimos generar el análisis con IA en este momento. Podés reintentar más tarde.'
    return jsonResponse({
      available: false,
      reason,
      code,
      detail: err instanceof Error ? err.message : String(err),
      model: GEMINI_MODEL,
    })
  }
})
