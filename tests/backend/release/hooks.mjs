// Redirige el import remoto de supabase-js (esm.sh) al Supabase falso en memoria, para correr la Edge Function REAL en Node.
const STUB = new URL('./fake-supabase.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) return { url: STUB, shortCircuit: true }
  return nextResolve(specifier, context)
}
