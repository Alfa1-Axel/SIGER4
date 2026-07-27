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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-1.5-flash'
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

function jsonResponse(body: unknown, status = 200): Response {
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

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Gemini respondió ${response.status}: ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string') throw new Error('Gemini no devolvió texto de análisis.')
  return text.trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ available: false, reason: 'Método no permitido.' }, 405)

  let body: AnalyzeRequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ available: false, reason: 'Solicitud inválida.' }, 400)
  }

  if (!body.reportKey || !body.summary) {
    return jsonResponse({ available: false, reason: 'Faltan datos del reporte.' }, 400)
  }

  // Requiere un usuario autenticado real (no expone la función a anónimos):
  // se valida el JWT recibido contra Supabase Auth usando la anon key del
  // proyecto, igual que cualquier llamado autenticado del frontend.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ available: false, reason: 'No autenticado.' }, 401)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ available: false, reason: 'No autenticado.' }, 401)
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse({
      available: false,
      reason: 'El análisis con IA todavía no está configurado (falta GEMINI_API_KEY en el proyecto de Supabase).',
    })
  }

  try {
    const analysis = await callGemini(buildPrompt(body))
    return jsonResponse({ available: true, analysis })
  } catch (err) {
    return jsonResponse({
      available: false,
      reason: 'No pudimos generar el análisis con IA en este momento. Podés reintentar más tarde.',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})
