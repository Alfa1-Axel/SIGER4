// Precarga para correr backend/scripts/announce-release.mjs de punta a punta SIN red: reemplaza fetch por una producción falsa
// (/version.json) y por la Edge Function REAL corriendo en este mismo proceso contra el Supabase falso.
//
// Escenario por variable de entorno FAKE_SCENARIO (JSON):
//   prod:  { status, body, unreachable }   lo que responde la producción falsa para /version.json (por defecto 200)
//   fn:    { RELEASE_ANNOUNCE_TOKEN, SIGER4_PUBLIC_URL, SUPABASE_URL }   entorno con el que arranca la función
//   preAnnounced: ['1.18.0']   versiones que la base ya tiene anunciadas
// y FAKE_STATE_FILE: archivo donde se vuelca, al salir, lo que quedó en la base falsa y las llamadas hechas.
import { register } from 'node:module'
import { writeFileSync } from 'node:fs'

register('./hooks.mjs', import.meta.url)
const { db, reset } = await import('./fake-supabase.mjs')
const { loadFunction } = await import('./function-harness.mjs')

const scenario = JSON.parse(process.env.FAKE_SCENARIO ?? '{}')
reset()
for (const version of scenario.preAnnounced ?? []) db.releases.push({ version, modules: ['Documentos'], commit: null, recipients: 5 })
const handler = await loadFunction({ SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio-falsa', ...scenario.fn })

const calls = []
globalThis.fetch = async (input, init) => {
  const url = String(input)
  calls.push({ url: url.split('?')[0], method: init?.method ?? 'GET' })
  if (/\/version\.json(\?|$)/.test(url)) {
    if (scenario.prod?.unreachable) throw new TypeError('fetch failed')
    return new Response(JSON.stringify(scenario.prod?.body ?? {}), { status: scenario.prod?.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (/\/functions\/v1\/announce-release$/.test(url)) return handler(new Request(url, init))
  throw new Error(`Llamada de red inesperada: ${url}`)
}

process.on('exit', () => {
  if (process.env.FAKE_STATE_FILE) writeFileSync(process.env.FAKE_STATE_FILE, JSON.stringify({ releases: db.releases, notifications: db.notifications.length, rpcCalls: db.calls.length, calls }))
})
