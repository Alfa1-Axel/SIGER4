// Carga la Edge Function REAL (backend/supabase/functions/announce-release/index.ts) en Node, con un Deno mínimo y el Supabase falso
// (el import remoto de supabase-js lo redirige hooks.mjs, que quien use este módulo tiene que haber registrado antes).
// Cada carga evalúa el módulo de nuevo: la función lee sus variables de entorno al arrancar, así que cada configuración
// necesita su propia instancia.
const FUNCTION_URL = new URL('../../backend/supabase/functions/announce-release/index.ts', import.meta.url).href
let loads = 0

export async function loadFunction(env) {
  let handler = null
  globalThis.Deno = {
    env: { get: (key) => env[key] },
    serve: (h) => {
      handler = h
    },
  }
  await import(`${FUNCTION_URL}?carga=${++loads}`)
  return handler
}
