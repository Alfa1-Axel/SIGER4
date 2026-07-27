import type { AiAnalysisResult } from './aiAnalysis'

// Cache local (localStorage) de análisis de IA exitosos, por reporte + filtros
// + usuario + día. Objetivo: si alguien genera el mismo reporte (mismos
// filtros) varias veces el mismo día, no volver a gastar cuota de Gemini —
// se reutiliza el análisis ya generado. Solo se cachean resultados
// disponibles (available: true); un fallo (incluida cuota agotada) nunca se
// cachea, para que la próxima generación del reporte —que ya es en sí un
// reintento manual simple, no hace falta un botón aparte— vuelva a intentar
// contra Gemini con normalidad.
const CACHE_PREFIX = 'siger4:ai-analysis:'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CacheEntry {
  result: AiAnalysisResult
  cachedAt: number
}

function buildCacheKey(reportKey: string, filters: unknown, profileId: string | null): string {
  const day = new Date().toISOString().slice(0, 10)
  const filtersKey = JSON.stringify(filters, Object.keys(filters as object).sort())
  return `${CACHE_PREFIX}${profileId ?? 'anon'}:${reportKey}:${day}:${filtersKey}`
}

export function getCachedAnalysis(reportKey: string, filters: unknown, profileId: string | null): AiAnalysisResult | null {
  try {
    const raw = localStorage.getItem(buildCacheKey(reportKey, filters, profileId))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null
    return entry.result
  } catch {
    return null
  }
}

export function setCachedAnalysis(reportKey: string, filters: unknown, profileId: string | null, result: AiAnalysisResult): void {
  if (!result.available) return
  try {
    const key = buildCacheKey(reportKey, filters, profileId)
    const entry: CacheEntry = { result, cachedAt: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // localStorage lleno o no disponible (modo privado, etc.): no cachear,
    // no es un error que deba interrumpir la generación del reporte.
  }
}
