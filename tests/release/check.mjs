// Pruebas del aviso de "Nueva actualización" que NO necesitan base de datos ni red (`npm run test:release`):
//   1. el contrato compartido (supabase/functions/_shared/releaseAnnouncement.ts);
//   2. que ese contrato y la migración 0122 digan lo mismo (módulos, rutas, texto);
//   3. la Edge Function announce-release REAL, contra un Supabase falso y una producción falsa;
//   4. el comando scripts/announce-release.mjs REAL, de punta a punta (comando → producción falsa → función → base falsa).
// La lógica de la base (versión única, permisos, una notificación por perfil, lecturas independientes) se prueba contra
// PostgreSQL en tests/db/test_0122_release_announcements.sql. Nada de acá toca producción.
import { register } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

register('./hooks.mjs', import.meta.url)
const shared = await import('../../supabase/functions/_shared/releaseAnnouncement.ts')
const { db, reset } = await import('./fake-supabase.mjs')
const { loadFunction } = await import('./function-harness.mjs')

const root = fileURLToPath(new URL('../../', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const migration = readFileSync(join(root, 'supabase/migrations/0122_release_announcements.sql'), 'utf8')

const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ' — ' + detail : ''}`)

// ------------------------------------------------------------------ 1. Contrato compartido
const parse = (input) => shared.parseReleaseRequest(input)
let r = parse({ version: '1.18.0', modules: ['Documentos'] })
check('un módulo y una versión válidos se aceptan', r.ok && r.value.version === '1.18.0' && r.value.modules.join() === 'Documentos' && r.value.commit === null)
r = parse({ version: ' 1.18.0 ', modules: ['  Documentos '], commit: 'ABCDEF1' })
check('se recortan los espacios y el commit se normaliza a minúsculas', r.ok && r.value.version === '1.18.0' && r.value.modules[0] === 'Documentos' && r.value.commit === 'abcdef1')
r = parse({ version: '1.18.0', modules: ['Mapa Regional', 'Documentos', 'Mapa Regional'] })
check('los módulos repetidos se juntan y se conserva el orden en que se pasaron', r.ok && r.value.modules.join() === 'Mapa Regional,Documentos')
r = parse({ version: '1.18.0', modules: [...shared.RELEASE_MODULES].slice(0, 6) })
check('seis módulos (el máximo) se aceptan', r.ok && r.value.modules.length === 6)
for (const [name, input] of [
  ['sin pedido', null],
  ['pedido que es una lista', []],
  ['pedido que es texto', 'hola'],
  ['versión vacía', { version: '', modules: ['Documentos'] }],
  ['versión ausente', { modules: ['Documentos'] }],
  ['versión con formato libre', { version: 'beta', modules: ['Documentos'] }],
  ['versión con solo dos números', { version: '1.18', modules: ['Documentos'] }],
  ['versión con sufijo', { version: '1.18.0-rc1', modules: ['Documentos'] }],
  ['versión con texto agregado', { version: '1.18.0; drop table notifications', modules: ['Documentos'] }],
  ['versión numérica', { version: 1.18, modules: ['Documentos'] }],
  ['versión larguísima', { version: '1'.repeat(5000) + '.0.0', modules: ['Documentos'] }],
  ['módulos ausentes', { version: '1.18.0' }],
  ['módulos como texto', { version: '1.18.0', modules: 'Documentos' }],
  ['lista de módulos vacía', { version: '1.18.0', modules: [] }],
  ['módulo que no figura', { version: '1.18.0', modules: ['Facturación'] }],
  ['módulo con nombre técnico', { version: '1.18.0', modules: ['documents'] }],
  ['módulo con otra capitalización', { version: '1.18.0', modules: ['documentos'] }],
  ['módulo que no es texto', { version: '1.18.0', modules: [7] }],
  ['módulo vacío', { version: '1.18.0', modules: [''] }],
  ['módulo con texto larguísimo', { version: '1.18.0', modules: ['Documentos'.repeat(1000)] }],
  ['módulo con HTML', { version: '1.18.0', modules: ['<script>alert(1)</script>'] }],
  ['siete módulos', { version: '1.18.0', modules: [...shared.RELEASE_MODULES].slice(0, 7) }],
  ['commit con letras fuera de hexadecimal', { version: '1.18.0', modules: ['Documentos'], commit: 'zzzzzzz' }],
  ['commit demasiado corto', { version: '1.18.0', modules: ['Documentos'], commit: 'abc12' }],
  ['commit demasiado largo', { version: '1.18.0', modules: ['Documentos'], commit: 'a'.repeat(41) }],
  ['commit que no es texto', { version: '1.18.0', modules: ['Documentos'], commit: 12345678 }],
]) {
  check(`se rechaza: ${name}`, !parse(input).ok)
}
check('el mensaje de rechazo por un módulo largo no repite el texto entero', (() => { const x = parse({ version: '1.18.0', modules: ['Documentos'.repeat(1000)] }); return !x.ok && x.message.length < 150 })())
check('hay 18 módulos permitidos, sin repetidos, con "Mapa Regional" y ninguno con "Región"', shared.RELEASE_MODULES.length === 18 && new Set(shared.RELEASE_MODULES).size === 18 && shared.RELEASE_MODULES.includes('Mapa Regional') && !shared.RELEASE_MODULES.some((m) => /Región/.test(m)))
check('el texto con un módulo es el pedido', shared.releaseAnnouncementBody(['Documentos']) === 'Hay una nueva actualización en Documentos.')
check('el texto con dos módulos usa "y"', shared.releaseAnnouncementBody(['Mapa Regional', 'Documentos']) === 'Hay nuevas actualizaciones en Mapa Regional y Documentos.')
check('el texto con tres módulos es el del ejemplo', shared.releaseAnnouncementBody(['Usuarios y roles', 'Mapa Regional', 'Documentos']) === 'Hay nuevas actualizaciones en Usuarios y roles, Mapa Regional y Documentos.')
check('el título es "Nueva actualización"', shared.ANNOUNCEMENT_TITLE === 'Nueva actualización')
check('comparar secretos: iguales', shared.constantTimeEqual('a'.repeat(40), 'a'.repeat(40)))
check('comparar secretos: distintos, de otro largo y vacío', !shared.constantTimeEqual('a'.repeat(40), 'a'.repeat(39) + 'b') && !shared.constantTimeEqual('a'.repeat(40), 'a'.repeat(39)) && !shared.constantTimeEqual('', 'a'.repeat(40)) && shared.constantTimeEqual('', ''))
check('la versión servida válida se lee', JSON.stringify(shared.parseServedBuild({ version: '1.18.0', commit: 'A34F0A3', supabaseHost: 'Abc.supabase.co', builtAt: 'x' })) === JSON.stringify({ version: '1.18.0', commit: 'a34f0a3', supabaseHost: 'abc.supabase.co' }))
check('la versión servida sin commit ni servidor se lee igual', shared.parseServedBuild({ version: '1.18.0' })?.commit === null)
check('la versión servida inválida da null', shared.parseServedBuild(null) === null && shared.parseServedBuild({}) === null && shared.parseServedBuild({ version: 'x' }) === null && shared.parseServedBuild({ version: 118 }) === null)
check('un servidor con caracteres raros se descarta (no se confía)', shared.parseServedBuild({ version: '1.18.0', supabaseHost: 'a.co/evil?x=1' })?.supabaseHost === null)
check('direcciones públicas: https y sin barra final', shared.normalizePublicUrl('https://siger4.ejemplo.com.ar/') === 'https://siger4.ejemplo.com.ar' && shared.normalizePublicUrl('  https://siger4.ejemplo.com.ar  ') === 'https://siger4.ejemplo.com.ar')
check('direcciones públicas: http solo en localhost', shared.normalizePublicUrl('http://localhost:5173') === 'http://localhost:5173' && shared.normalizePublicUrl('http://siger4.ejemplo.com.ar') === null)
check('direcciones públicas: rechaza rutas, credenciales, esquemas raros y vacíos', [undefined, null, '', 'siger4.com', 'https://a.com/ruta', 'https://user@a.com', 'ftp://a.com', 'javascript:alert(1)', 'https://a.com?x=1'].every((u) => shared.normalizePublicUrl(u) === null))

// ------------------------------------------------------------------ 2. El contrato y la migración dicen lo mismo
const sqlModules = [...(migration.match(/select array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
check('la lista de módulos de la migración 0122 es la misma que la del contrato (mismo orden)', sqlModules.join('|') === shared.RELEASE_MODULES.join('|'), `${sqlModules.length} en SQL`)
const sqlRoutes = Object.fromEntries([...(migration.match(/select case p_module([\s\S]*?)end;/)?.[1] ?? '').matchAll(/when '([^']+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]))
check('todas las rutas de la migración son de módulos permitidos y empiezan con /', Object.entries(sqlRoutes).every(([module, route]) => shared.RELEASE_MODULES.includes(module) && /^\/[a-z/]+$/.test(route)) && Object.keys(sqlRoutes).length >= 10, JSON.stringify(sqlRoutes))
check('la migración usa el mismo título y el mismo texto de uno y varios módulos', migration.includes(`'${shared.ANNOUNCEMENT_TITLE}'`) && migration.includes("'Hay una nueva actualización en '") && migration.includes("'Hay nuevas actualizaciones en '") && migration.includes("' y '"))
check('la migración usa el mismo formato de versión y de commit', migration.includes('^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,4}$') && migration.includes('^[0-9a-f]{7,40}$') && String(shared.VERSION_PATTERN) === '/^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,4}$/' && String(shared.COMMIT_PATTERN) === '/^[0-9a-f]{7,40}$/')
check('el máximo de módulos coincide (6)', shared.MAX_RELEASE_MODULES === 6 && /cardinality\(v_modules\) between 1 and 6|between 1 and 6/.test(migration))

// ------------------------------------------------------------------ 3. La Edge Function real
const TOKEN = 'T'.repeat(40)
const PUBLIC = 'https://siger4.ejemplo.com.ar'
const PROJECT = 'proyecto.supabase.co'
const fnEnv = (over = {}) => ({ SUPABASE_URL: `https://${PROJECT}`, SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio-falsa', RELEASE_ANNOUNCE_TOKEN: TOKEN, SIGER4_PUBLIC_URL: PUBLIC, ...over })
const prodBody = (over = {}) => ({ version, commit: 'a34f0a3', builtAt: '2026-10-21T00:00:00.000Z', supabaseHost: PROJECT, ...over })

const realFetch = globalThis.fetch
let prod = { status: 200, body: prodBody() }
const fetched = []
globalThis.fetch = async (input) => {
  const url = String(input)
  fetched.push(url.split('?')[0])
  if (!/\/version\.json(\?|$)/.test(url)) throw new Error(`Llamada de red inesperada: ${url}`)
  if (prod.unreachable) throw new TypeError('fetch failed')
  return new Response(JSON.stringify(prod.body ?? {}), { status: prod.status ?? 200 })
}
const logs = []
const originalConsole = { log: console.log, warn: console.warn, error: console.error }
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push(args.join(' '))

const call = async (handler, { method = 'POST', headers = { 'x-release-token': TOKEN, 'Content-Type': 'application/json' }, body, raw } = {}) => {
  const res = await handler(new Request('https://x.supabase.co/functions/v1/announce-release', { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : (raw ?? JSON.stringify(body)) }))
  let json = null
  try { json = await res.clone().json() } catch { /* sin cuerpo */ }
  return { status: res.status, body: json, text: await res.text() }
}
const good = { version, modules: ['Documentos', 'Mapa Regional'], commit: 'a34f0a3' }
const fresh = async (over) => {
  reset()
  fetched.length = 0
  prod = { status: 200, body: prodBody() }
  return loadFunction(fnEnv(over))
}

let h = await fresh()
r = await call(h, { body: good })
check('función: pedido correcto → 200, anunciada a los 5 perfiles activos con cuenta', r.status === 200 && r.body.ok === true && r.body.already_announced === false && r.body.recipients === 5 && r.body.version === version, r.text)
check('...se llamó UNA vez a announce_release, con la clave de servicio y los datos validados', db.calls.length === 1 && db.calls[0].fn === 'announce_release' && db.calls[0].key === 'clave-de-servicio-falsa' && db.calls[0].args.p_version === version && db.calls[0].args.p_modules.join() === 'Documentos,Mapa Regional' && db.calls[0].args.p_commit === 'a34f0a3')
check('...la base falsa quedó con UNA versión y 5 avisos (no a inactivos ni sin cuenta)', db.releases.length === 1 && db.notifications.length === 5 && !db.notifications.some((n) => n.profile_id === 'p-inactivo' || n.profile_id === 'p-sin-cuenta'))
check('...se consultó /version.json de producción antes de anunciar', fetched.length === 1 && fetched[0] === `${PUBLIC}/version.json`)
r = await call(h, { body: good })
check('función: la MISMA versión otra vez → 200 ya anunciada, sin avisos nuevos', r.status === 200 && r.body.already_announced === true && db.releases.length === 1 && db.notifications.length === 5, r.text)
r = await call(h, { body: { ...good, modules: ['Inventario'] } })
check('función: la misma versión con OTROS módulos tampoco duplica', r.body?.already_announced === true && db.notifications.length === 5)
check('función: el cuerpo de respuesta no contiene el secreto ni la clave de servicio', ![r.text].some((t) => t.includes(TOKEN) || t.includes('clave-de-servicio-falsa')))

h = await fresh()
r = await call(h, { method: 'GET' })
check('función: GET → 405 y no consulta nada', r.status === 405 && db.calls.length === 0 && fetched.length === 0)
r = await call(h, { method: 'OPTIONS' })
check('función: OPTIONS (CORS) → 200 sin hacer nada', r.status === 200 && db.calls.length === 0)
for (const [name, headers] of [
  ['sin el secreto', { 'Content-Type': 'application/json' }],
  ['con el secreto equivocado', { 'x-release-token': 'X'.repeat(40) }],
  ['con el secreto cortado', { 'x-release-token': TOKEN.slice(0, 39) }],
  ['con el secreto más largo', { 'x-release-token': TOKEN + 'T' }],
  ['con el secreto vacío', { 'x-release-token': '' }],
  ['con una sesión de usuario pero sin el secreto', { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.usuario.firma' }],
  ['con la clave de servicio en lugar del secreto', { 'x-release-token': 'clave-de-servicio-falsa' }],
]) {
  h = await fresh()
  r = await call(h, { headers, body: good })
  check(`función: ${name} → 401, sin consultar producción ni llamar a la base`, r.status === 401 && db.calls.length === 0 && fetched.length === 0, `status=${r.status}`)
}
for (const [name, env] of [
  ['sin secreto configurado', { RELEASE_ANNOUNCE_TOKEN: undefined }],
  ['con un secreto de menos de 32 caracteres', { RELEASE_ANNOUNCE_TOKEN: 'corto' }],
  ['sin dirección pública', { SIGER4_PUBLIC_URL: undefined }],
  ['con una dirección pública inválida (http fuera de localhost)', { SIGER4_PUBLIC_URL: 'http://siger4.ejemplo.com.ar' }],
  ['sin clave de servicio', { SUPABASE_SERVICE_ROLE_KEY: undefined }],
  ['sin URL de Supabase', { SUPABASE_URL: undefined }],
]) {
  h = await fresh(env)
  r = await call(h, { body: good })
  check(`función: ${name} → 503 "no está configurada" y no hace nada`, r.status === 503 && /no está configurada/.test(r.body?.error ?? '') && db.calls.length === 0 && fetched.length === 0, `status=${r.status}`)
}
h = await fresh()
r = await call(h, { raw: '{no es json' })
check('función: cuerpo que no es JSON → 400', r.status === 400 && db.calls.length === 0)
r = await call(h, { raw: JSON.stringify({ ...good, relleno: 'x'.repeat(5000) }) })
check('función: cuerpo de más de 4 KB → 413', r.status === 413 && db.calls.length === 0)
for (const [name, body] of [
  ['versión vacía', { ...good, version: '' }],
  ['versión inventada', { ...good, version: 'ultima' }],
  ['sin módulos', { ...good, modules: [] }],
  ['módulo que no existe', { ...good, modules: ['Contabilidad'] }],
  ['siete módulos', { ...good, modules: shared.RELEASE_MODULES.slice(0, 7) }],
  ['texto libre larguísimo como módulo', { ...good, modules: ['x'.repeat(3000)] }],
  ['commit inválido', { ...good, commit: 'nada' }],
]) {
  r = await call(h, { body })
  check(`función: ${name} → 400, sin consultar producción ni llamar a la base`, r.status === 400 && db.calls.length === 0 && fetched.length === 0, `status=${r.status}`)
}

h = await fresh()
prod = { unreachable: true }
r = await call(h, { body: good })
check('función: producción no responde → 503 y no anuncia', r.status === 503 && db.calls.length === 0, `status=${r.status}`)
for (const [name, p] of [
  ['sirve otra versión (todavía no terminó el despliegue)', { status: 200, body: prodBody({ version: '1.17.0' }) }],
  ['responde 404 en /version.json', { status: 404, body: {} }],
  ['responde 500', { status: 500, body: {} }],
  ['publica un /version.json sin el formato esperado', { status: 200, body: { hola: 'mundo' } }],
  ['está armada contra OTRO proyecto de Supabase', { status: 200, body: prodBody({ supabaseHost: 'otro.supabase.co' }) }],
]) {
  h = await fresh()
  prod = p
  r = await call(h, { body: good })
  check(`función: producción ${name} → 409 y no anuncia`, r.status === 409 && db.calls.length === 0 && db.notifications.length === 0, `status=${r.status}`)
}
h = await fresh()
prod = { status: 200, body: prodBody({ supabaseHost: undefined }) }
r = await call(h, { body: good })
check('función: un /version.json sin servidor anotado igual deja anunciar si la versión coincide', r.status === 200)

h = await fresh()
db.failRpc = 'XX000'
r = await call(h, { body: good })
check('función: si la base falla → 500 con un mensaje genérico (sin el detalle interno)', r.status === 500 && !/detalle interno/.test(r.text) && db.notifications.length === 0, r.text)

const allLogs = logs.join('\n')
check('función: ningún log contiene el secreto, la clave de servicio ni los textos de los avisos', !allLogs.includes(TOKEN) && !allLogs.includes('clave-de-servicio-falsa') && !allLogs.includes('Hay una nueva') && !allLogs.includes('Hay nuevas'), allLogs.slice(0, 300))
check('función: los logs de éxito llevan la versión y la cantidad, nada más', logs.some((l) => l.includes(`versión ${version}: anunciada a 5 personas`)))
Object.assign(console, originalConsole)
globalThis.fetch = realFetch

// ------------------------------------------------------------------ 4. El comando real, de punta a punta
const tmp = mkdtempSync(join(tmpdir(), 'siger4-release-'))
const preload = new URL('./cli-preload.mjs', import.meta.url).href
const script = join(root, 'scripts/announce-release.mjs')
const FUNCTIONS = `https://${PROJECT}/functions/v1`
const baseEnv = { RELEASE_ANNOUNCE_TOKEN: TOKEN, SIGER4_PUBLIC_URL: PUBLIC, SIGER4_FUNCTIONS_URL: FUNCTIONS }
let runs = 0
function cli(args, { env = baseEnv, scenario = {} } = {}) {
  const stateFile = join(tmp, `estado-${++runs}.json`)
  const run = spawnSync(process.execPath, ['--import', preload, script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...env,
      FAKE_STATE_FILE: stateFile,
      FAKE_SCENARIO: JSON.stringify({ prod: { body: prodBody() }, fn: fnEnv(), ...scenario }),
    },
    timeout: 30000,
  })
  let state = null
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')) } catch { /* el comando salió antes de armar el estado */ }
  return { code: run.status, out: `${run.stdout}${run.stderr}`, state }
}
const args = ['--version', version, '--modules', 'Documentos,Mapa Regional']
const sent = (c) => c.state?.calls.filter((x) => x.url.endsWith('/announce-release')).length ?? 0

let c = cli(args)
check('comando: caso feliz → sale con 0 y anuncia a 5 personas', c.code === 0 && /anunciada a 5 personas/.test(c.out) && c.state?.releases.length === 1 && c.state.notifications === 5, `${c.code} ${c.out.slice(0, 300)}`)
check('...muestra el texto exacto del aviso', c.out.includes('Nueva actualización') && c.out.includes('Hay nuevas actualizaciones en Documentos y Mapa Regional.'))
check('...y la salida no imprime el secreto', !c.out.includes(TOKEN) && !c.out.includes('clave-de-servicio-falsa'))
c = cli([...args, '--commit', 'a34f0a3'])
check('comando: con --commit también anuncia y guarda el commit', c.code === 0 && c.state?.releases[0].commit === 'a34f0a3')
c = cli([...args, '--dry-run'])
check('comando: --dry-run muestra el aviso y NO envía nada', c.code === 0 && /dry-run/.test(c.out) && sent(c) === 0 && c.state?.releases.length === 0 && c.out.includes('Hay nuevas actualizaciones'))
c = cli(args, { scenario: { preAnnounced: [version] } })
check('comando: versión ya anunciada → sale con 2, mensaje claro y sin avisos nuevos', c.code === 2 && /ya había sido anunciada/.test(c.out) && c.state?.notifications === 0, `${c.code} ${c.out.slice(0, 300)}`)
c = cli(['--help'])
check('comando: --help → 0 y lista los módulos permitidos', c.code === 0 && c.out.includes('Mapa Regional') && c.out.includes('release:announce'))
c = cli([])
check('comando: sin argumentos → 1 y el uso', c.code === 1 && /Indicá la versión y los módulos/.test(c.out))
c = cli(['--version', version])
check('comando: sin --modules → 1', c.code === 1)
c = cli(['--version'])
check('comando: --version sin valor → 1', c.code === 1 && /Falta el valor/.test(c.out))
c = cli([...args, '--rapido'])
check('comando: opción desconocida → 1', c.code === 1 && /Opción desconocida/.test(c.out))
for (const [name, a, re] of [
  ['módulo que no existe', ['--version', version, '--modules', 'Contabilidad'], /no figura en la lista/],
  ['módulo con otra capitalización', ['--version', version, '--modules', 'documentos'], /no figura en la lista/],
  ['versión con formato inválido', ['--version', 'ultima', '--modules', 'Documentos'], /La versión no es válida/],
  ['siete módulos', ['--version', version, '--modules', shared.RELEASE_MODULES.slice(0, 7).join(',')], /entre 1 y 6/],
  ['commit inválido', [...args, '--commit', 'nada'], /commit no es válido/],
]) {
  c = cli(a)
  check(`comando: ${name} → 1 con mensaje claro, sin llamar a producción ni a la función`, c.code === 1 && re.test(c.out) && (c.state?.calls.length ?? 0) === 0, `${c.code} ${c.out.slice(0, 200)}`)
}
c = cli(['--version', '9.9.9', '--modules', 'Documentos'])
check('comando: la versión no coincide con la de package.json → 1, sin llamar a nada', c.code === 1 && /La versión no coincide/.test(c.out) && (c.state?.calls.length ?? 0) === 0, c.out.slice(0, 200))
for (const [name, env, re] of [
  ['sin el secreto', { ...baseEnv, RELEASE_ANNOUNCE_TOKEN: '' }, /RELEASE_ANNOUNCE_TOKEN/],
  ['con un secreto corto', { ...baseEnv, RELEASE_ANNOUNCE_TOKEN: 'corto' }, /RELEASE_ANNOUNCE_TOKEN/],
  ['sin dirección pública', { ...baseEnv, SIGER4_PUBLIC_URL: '' }, /SIGER4_PUBLIC_URL/],
  ['con una dirección pública http', { ...baseEnv, SIGER4_PUBLIC_URL: 'http://siger4.ejemplo.com.ar' }, /SIGER4_PUBLIC_URL/],
  ['sin dirección de las funciones', { ...baseEnv, SIGER4_FUNCTIONS_URL: '' }, /SIGER4_FUNCTIONS_URL/],
  ['con una dirección de funciones que no es de Supabase', { ...baseEnv, SIGER4_FUNCTIONS_URL: 'https://evil.example.com/functions/v1' }, /SIGER4_FUNCTIONS_URL/],
  ['sin ninguna variable', {}, /Faltan credenciales/],
]) {
  c = cli(args, { env })
  check(`comando: ${name} → 1 y dice qué falta, sin llamar a nada`, c.code === 1 && re.test(c.out) && (c.state?.calls.length ?? 0) === 0, `${c.code} ${c.out.slice(0, 200)}`)
}
c = cli(args, { scenario: { prod: { unreachable: true } } })
check('comando: producción no disponible → 1 y no envía', c.code === 1 && /No se pudo consultar producción/.test(c.out) && sent(c) === 0 && c.state?.releases.length === 0, c.out.slice(0, 200))
c = cli(args, { scenario: { prod: { status: 503, body: {} } } })
check('comando: producción responde 503 → 1 y no envía', c.code === 1 && /respondió 503/.test(c.out) && sent(c) === 0)
c = cli(args, { scenario: { prod: { body: prodBody({ version: '1.17.0' }) } } })
check('comando: producción sirve otra versión → 1 y no envía', c.code === 1 && /sirve la versión 1\.17\.0/.test(c.out) && sent(c) === 0)
c = cli(args, { scenario: { prod: { body: { hola: 'mundo' } } } })
check('comando: producción sin /version.json válido → 1 y no envía', c.code === 1 && /formato esperado/.test(c.out) && sent(c) === 0)
c = cli(args, { env: { ...baseEnv, SIGER4_FUNCTIONS_URL: 'https://otroproyecto.supabase.co/functions/v1' } })
check('comando: las funciones apuntan a otro proyecto que el de producción → 1 y no envía', c.code === 1 && /otro proyecto/.test(c.out) && sent(c) === 0)
c = cli(args, { scenario: { fn: fnEnv({ RELEASE_ANNOUNCE_TOKEN: 'Z'.repeat(40) }) } })
check('comando: la función rechaza el secreto → 3 con el motivo, sin avisos', c.code === 3 && /rechazó el anuncio \(401\)/.test(c.out) && c.state?.notifications === 0, `${c.code} ${c.out.slice(0, 200)}`)
c = cli(args, { scenario: { fn: fnEnv({ RELEASE_ANNOUNCE_TOKEN: undefined }) } })
check('comando: la función apagada (sin secreto) → 3 "no está configurada"', c.code === 3 && /no está configurada/.test(c.out))
rmSync(tmp, { recursive: true, force: true })

// ------------------------------------------------------------------ Resumen
console.log(results.join('\n'))
const passed = results.filter((x) => x.startsWith('PASS')).length
const failed = results.filter((x) => x.startsWith('FAIL')).length
console.log(`\n${passed} PASS, ${failed} FAIL`)
process.exit(failed ? 1 : 0)
