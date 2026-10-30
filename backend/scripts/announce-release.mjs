// Anuncia una versión nueva a las personas usuarias de SIGER4: una notificación interna breve por perfil activo
// ("Hay una nueva actualización en Documentos."). Se corre A MANO, DESPUÉS de que la versión quedó publicada en producción.
//
//   npm run release:announce -- --version 1.18.0 --modules "Documentos,Mapa Regional" [--commit <hash>] [--dry-run]
//
// Variables de entorno (NUNCA en el repositorio ni en un archivo que se suba):
//   RELEASE_ANNOUNCE_TOKEN   el secreto de la función announce-release (32 caracteres o más)
//   SIGER4_FUNCTIONS_URL     dirección de las funciones del proyecto, ej. https://<proyecto>.supabase.co/functions/v1
//   SIGER4_PUBLIC_URL        dirección pública de producción, ej. https://siger4.ejemplo.com.ar
//
// Falla, sin enviar nada, si: faltan credenciales; el pedido no es válido (versión o módulos); la versión de este repositorio
// no coincide con la que se quiere anunciar; producción no responde, no sirve esa versión o está armada contra otro proyecto;
// o la versión ya fue anunciada. Con --dry-run muestra lo que haría y no envía.
//
// Códigos de salida: 0 anunciada; 1 error de uso, de credenciales o de verificación; 2 ya estaba anunciada; 3 la función
// rechazó o falló.
import { readFileSync } from 'node:fs'

// El contrato (módulos, formato de versión, texto del aviso) vive en un único módulo TypeScript compartido con la función.
// Node 22.18 o más nuevo lo lee directamente; con una versión anterior se avisa en vez de fallar con un error confuso.
let shared
try {
  shared = await import('../supabase/functions/_shared/releaseAnnouncement.ts')
} catch {
  console.error(`\n✖ No se pudo cargar el contrato compartido. Este comando necesita Node 22.18 o más nuevo (tenés ${process.version}).`)
  process.exit(1)
}
const { ANNOUNCEMENT_TITLE, RELEASE_MODULES, normalizePublicUrl, parseReleaseRequest, parseServedBuild, releaseAnnouncementBody } = shared

const USAGE = `Uso: npm run release:announce -- --version 1.18.0 --modules "Documentos,Mapa Regional" [--commit <hash>] [--dry-run]

Módulos permitidos (de 1 a 6):
  ${RELEASE_MODULES.join(', ')}

Variables de entorno: RELEASE_ANNOUNCE_TOKEN, SIGER4_FUNCTIONS_URL, SIGER4_PUBLIC_URL (ver DEPLOYMENT.md, sección 75).`

function fail(code, message) {
  console.error(`\n✖ ${message}`)
  process.exit(code)
}

function parseArgs(argv) {
  const out = { dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--version' || arg === '--modules' || arg === '--commit') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) fail(1, `Falta el valor de ${arg}.\n\n${USAGE}`)
      out[arg.slice(2)] = value
    } else fail(1, `Opción desconocida: ${arg}\n\n${USAGE}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log(USAGE)
  process.exit(0)
}
if (!args.version || !args.modules) fail(1, `Indicá la versión y los módulos.\n\n${USAGE}`)

// 1. El pedido, con el mismo esquema que valida la función.
const parsed = parseReleaseRequest({
  version: args.version,
  modules: args.modules.split(',').map((name) => name.trim()).filter(Boolean),
  commit: args.commit ?? null,
})
if (!parsed.ok) fail(1, parsed.message)
const { version, modules, commit } = parsed.value

// 2. La versión que se anuncia tiene que ser la de este repositorio (package.json de la raíz).
const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
if (packageVersion !== version) {
  fail(1, `La versión no coincide: este repositorio está en ${packageVersion} y pediste anunciar ${version}. Posicionate en el commit publicado (o corregí --version).`)
}

// 3. Credenciales y direcciones.
const token = process.env.RELEASE_ANNOUNCE_TOKEN ?? ''
const publicUrl = normalizePublicUrl(process.env.SIGER4_PUBLIC_URL)
const functionsUrl = (process.env.SIGER4_FUNCTIONS_URL ?? '').trim().replace(/\/+$/, '')
const missing = []
if (token.length < 32) missing.push('RELEASE_ANNOUNCE_TOKEN (32 caracteres o más)')
if (!publicUrl) missing.push('SIGER4_PUBLIC_URL (https://…, sin barra final)')
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1$/i.test(functionsUrl)) missing.push('SIGER4_FUNCTIONS_URL (https://<proyecto>.supabase.co/functions/v1)')
if (missing.length) fail(1, `Faltan credenciales o direcciones válidas:\n  - ${missing.join('\n  - ')}`)

// 4. Producción tiene que estar sirviendo esta versión, armada contra el proyecto al que apunta SIGER4_FUNCTIONS_URL.
let served = null
try {
  const response = await fetch(`${publicUrl}/version.json?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) fail(1, `Producción respondió ${response.status} al pedir /version.json. ¿Ya terminó el despliegue?`)
  served = parseServedBuild(await response.json())
} catch (error) {
  fail(1, `No se pudo consultar producción (${publicUrl}): ${error instanceof Error ? error.message : 'error de red'}.`)
}
if (!served) fail(1, 'Producción no publica /version.json con el formato esperado.')
if (served.version !== version) fail(1, `Producción sirve la versión ${served.version}, no la ${version}. Esperá a que termine el despliegue y reintentá.`)
const functionsHost = new URL(functionsUrl).host.toLowerCase()
if (served.supabaseHost && served.supabaseHost !== functionsHost) {
  fail(1, 'SIGER4_FUNCTIONS_URL apunta a otro proyecto de Supabase que el de producción. No se envió nada.')
}

const body = releaseAnnouncementBody(modules)
console.log(`Versión ${version}${served.commit ? ` (commit ${served.commit})` : ''} servida por ${publicUrl}.`)
console.log(`Aviso que van a recibir todos los perfiles activos:\n  ${ANNOUNCEMENT_TITLE}\n  ${body}`)
if (args.dryRun) {
  console.log('\n(--dry-run) No se envió nada.')
  process.exit(0)
}

// 5. Anunciar.
let result
try {
  const response = await fetch(`${functionsUrl}/announce-release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-release-token': token },
    body: JSON.stringify({ version, modules, commit }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) fail(3, `La función rechazó el anuncio (${response.status}): ${data.error ?? 'sin detalle'}`)
  result = data
} catch (error) {
  fail(3, `No se pudo llamar a la función: ${error instanceof Error ? error.message : 'error de red'}.`)
}

if (result.already_announced) fail(2, `La versión ${version} ya había sido anunciada: no se envió nada nuevo.`)
console.log(`\n✔ Versión ${version} anunciada a ${result.recipients} personas.`)
console.log('Verificá en SIGER4 (campana de una cuenta de prueba) que apareció una sola vez.')
