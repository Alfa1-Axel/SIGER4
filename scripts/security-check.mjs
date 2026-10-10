// Verificación de seguridad reproducible de SIGER4 (npm run security:check).
//
//   npm run security:check                      revisa el repositorio y la configuración
//   npm run security:check -- --url https://…   además pide esa URL y revisa la respuesta REAL
//
// No imprime nunca el valor de un secreto: solo el nombre del archivo y de la regla.
// Sale con código 1 si algo falla. Corre en cada ronda junto con build, lint y audit.
//
// Qué NO puede comprobar (queda en DEPLOYMENT.md sección 70, "configuración externa"):
// lo que vive en el panel de Supabase o de Vercel (límites de intentos de ingreso,
// CAPTCHA, cifrado en reposo, SSL obligatorio de la base, secretos de las Edge Functions).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const results = []
const ok = (name, detail = '') => results.push({ ok: true, name, detail })
const fail = (name, detail = '') => results.push({ ok: false, name, detail })
const check = (name, condition, detail = '') => (condition ? ok(name, detail) : fail(name, detail))
const section = (title) => results.push({ section: title })

const urlArg = (() => {
  const i = process.argv.indexOf('--url')
  return i >= 0 ? process.argv[i + 1] : null
})()

// ---------------------------------------------------------------------------
section('Dependencias (control 20)')
{
  const run = spawnSync('npm', ['audit', '--audit-level=high'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
  const text = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const none = /found 0 vulnerabilities/i.test(text)
  check('npm audit --audit-level=high sin vulnerabilidades altas ni críticas', run.status === 0, none ? 'found 0 vulnerabilities' : text.split('\n').filter((l) => /vulnerab|severity/i.test(l)).slice(0, 3).join(' | '))
}

// ---------------------------------------------------------------------------
section('Secretos en el repositorio (controles 1 y 2)')
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|webp|ico|svg|woff2?|lock|pdf)$/i.test(f) && f !== 'package-lock.json')
{
  const envFiles = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example'))
  check('ningún archivo .env versionado (solo .env.example)', envFiles.length === 0, envFiles.join(', '))
  const keyFiles = tracked.filter((f) => /\.(pem|key|p12|pfx)$/i.test(f))
  check('ninguna clave o certificado versionado', keyFiles.length === 0, keyFiles.join(', '))
  const gitignore = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : ''
  check('.gitignore excluye .env, claves y certificados', /^\.env$/m.test(gitignore) && /\.env\.\*/.test(gitignore) && /\*\.pem/.test(gitignore))

  const PATTERNS = [
    ['clave secreta de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{20,}/],
    ['token personal de Supabase (sbp_…)', /sbp_[a-f0-9]{30,}/],
    ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['clave de acceso de AWS', /AKIA[0-9A-Z]{16}/],
    ['clave secreta tipo sk_live_', /sk_live_[A-Za-z0-9]{16,}/],
  ]
  const hits = []
  const jwtHits = []
  for (const file of tracked) {
    let text
    try {
      text = readFileSync(join(ROOT, file), 'utf8')
    } catch {
      continue
    }
    for (const [label, re] of PATTERNS) if (re.test(text)) hits.push(`${file}: ${label}`)
    // Un JWT con rol service_role pegado en un archivo (se decodifica solo el rol; no se imprime el valor).
    for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
        if (payload.role === 'service_role') jwtHits.push(`${file}: JWT con rol service_role`)
        else jwtHits.push(`${file}: JWT con rol ${payload.role ?? 'desconocido'} (revisar si corresponde)`)
      } catch {
        /* no era un JWT */
      }
    }
  }
  check('ningún secreto con formato conocido en archivos versionados', hits.length === 0, hits.join(' | '))
  check('ningún JWT pegado en archivos versionados', jwtHits.length === 0, jwtHits.join(' | '))

  const front = tracked.filter((f) => f.startsWith('src/') || f === 'index.html' || f.startsWith('public/'))
  // Se buscan VALORES (un JWT con ese rol, sb_secret_<valor>), no la palabra: varios comentarios y mensajes del código la nombran.
  const serviceValueInFront = front.filter((f) => /sb_secret_[A-Za-z0-9_-]{20,}/.test(readFileSync(join(ROOT, f), 'utf8')) || /(SERVICE_ROLE_KEY|service_role_key)\s*[:=]\s*['"`][A-Za-z0-9._-]{20,}/.test(readFileSync(join(ROOT, f), 'utf8')))
  check('ninguna clave service_role (valor) en el código del navegador (src, public, index.html)', serviceValueInFront.length === 0, serviceValueInFront.join(', '))
  const viteVars = new Set()
  for (const f of front) for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) viteVars.add(m[1])
  const secretLooking = [...viteVars].filter((v) => /SECRET|PRIVATE|SERVICE|PASSWORD/i.test(v))
  check('las variables VITE_* que usa el navegador no parecen secretas', secretLooking.length === 0, `usa: ${[...viteVars].join(', ')}`)

  // Historia de Git: ningún .env ni clave que alguna vez se haya subido (sin imprimir contenido).
  try {
    const names = execFileSync('git', ['log', '--all', '--name-only', '--pretty=format:'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const bad = [...new Set(names.split('\n').filter((f) => (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')) || /\.(pem|p12|pfx)$/i.test(f)))]
    check('la historia de Git no contiene archivos .env ni claves', bad.length === 0, bad.join(', '))
  } catch (err) {
    fail('no se pudo revisar la historia de Git', String(err.message).split('\n')[0])
  }
}

// ---------------------------------------------------------------------------
section('Código del navegador (controles 9, 15 y 12)')
{
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name)) files.push(full)
    }
  }
  walk(join(ROOT, 'src'))
  const offenders = (re) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f))
  check('ningún dangerouslySetInnerHTML ni innerHTML (el texto se muestra siempre escapado)', offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=/).length === 0, offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=/).join(', '))
  check('ningún eval ni new Function', offenders(/\beval\(|new Function\(/).length === 0, offenders(/\beval\(|new Function\(/).join(', '))
  check('no se usan cookies propias (la sesión de Supabase vive en localStorage)', offenders(/document\.cookie/).length === 0, offenders(/document\.cookie/).join(', '))
  check('no hay registro abierto de usuarios (signUp)', offenders(/\.auth\.signUp\(/).length === 0, offenders(/\.auth\.signUp\(/).join(', '))
  check('ninguna llamada a http:// en el código (todo por https)', offenders(/['"`]http:\/\/(?!localhost|127\.0\.0\.1)/).length === 0, offenders(/['"`]http:\/\/(?!localhost|127\.0\.0\.1)/).join(', '))
}

// ---------------------------------------------------------------------------
section('Funciones puras de seguridad (controles 15 y 16)')
{
  let ts
  try {
    ts = (await import('typescript')).default
  } catch {
    ts = null
  }
  if (!ts) {
    fail('no se encontró typescript para probar las funciones puras')
  } else {
    const load = async (rel) => {
      const source = readFileSync(join(ROOT, rel), 'utf8')
      const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
      return import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`)
    }
    const contact = await load('src/lib/contact.ts')
    check('los enlaces web solo aceptan http(s): "javascript:" se rechaza', contact.normalizeUrl('javascript:alert(1)') === null && contact.buildInstagramUrl('javascript:alert(1)') === null)
    check('un "data:" o "vbscript:" tampoco se convierte en enlace', contact.normalizeUrl('data:text/html,<script>1</script>') === null && contact.normalizeUrl('vbscript:msgbox(1)') === null)
    check('un correo con comillas o signos de HTML no arma un mailto:', contact.buildMailto('a@b.c"><script>') === null && contact.buildMailto("o'neil@ejemplo.org") !== null)
    check('un dominio común sí se normaliza a https', contact.normalizeUrl('ejemplo.org/pagina') === 'https://ejemplo.org/pagina')

    const sig = await load('src/lib/fileSignature.ts')
    const bytes = (...b) => new Uint8Array(b)
    check('firma de archivos: reconoce PNG, JPEG y WEBP por su contenido', sig.detectFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) === 'png' && sig.detectFormat(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'jpeg' && sig.detectFormat(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)) === 'webp')
    check('firma de archivos: reconoce un PDF', sig.detectFormat(new TextEncoder().encode('%PDF-1.7\n')) === 'pdf')
    check('firma de archivos: una página web renombrada .jpg NO pasa', sig.detectFormat(new TextEncoder().encode('<html><script>alert(1)</script></html>')) === null)
    check('firma de archivos: un ejecutable (MZ) NO pasa', sig.detectFormat(bytes(0x4d, 0x5a, 0x90, 0x00)) === null)
  }
}

// ---------------------------------------------------------------------------
section('Encabezados y HTTPS configurados en vercel.json (controles 18 y 19)')
{
  const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const all = (config.headers ?? []).find((h) => h.source === '/(.*)')?.headers ?? []
  const header = (name) => all.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value ?? ''
  const csp = header('Content-Security-Policy')
  const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''
  check('X-Frame-Options: DENY', header('X-Frame-Options') === 'DENY')
  check('X-Content-Type-Options: nosniff', header('X-Content-Type-Options') === 'nosniff')
  check('Referrer-Policy definido', /strict-origin/.test(header('Referrer-Policy')))
  check('Permissions-Policy: sin geolocalización ni micrófono', /geolocation=\(\)/.test(header('Permissions-Policy')) && /microphone=\(\)/.test(header('Permissions-Policy')))
  check('Strict-Transport-Security con al menos 1 año', /max-age=(\d+)/.test(header('Strict-Transport-Security')) && Number(/max-age=(\d+)/.exec(header('Strict-Transport-Security'))[1]) >= 31536000, header('Strict-Transport-Security') || 'no definido')
  check("CSP: default-src 'self'", directive('default-src') === "default-src 'self'")
  check("CSP: script-src 'self' (sin 'unsafe-inline' ni 'unsafe-eval' en scripts)", directive('script-src') === "script-src 'self'")
  check("CSP: object-src 'none'", /object-src 'none'/.test(csp))
  check("CSP: frame-ancestors 'none'", /frame-ancestors 'none'/.test(csp))
  check("CSP: base-uri y form-action 'self'", /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp))
  check('CSP: upgrade-insecure-requests (nada se carga por http)', /upgrade-insecure-requests/.test(csp))
  check('CSP: sin comodines globales (*) en ninguna directiva', !/(^|[ ;])\*($|[ ;])/.test(csp))
  const connect = directive('connect-src')
  check('CSP: connect-src solo a Supabase y los mapas', /https:\/\/\*\.supabase\.co/.test(connect) && !/ http:/.test(connect))
}

// ---------------------------------------------------------------------------
section('Migraciones (controles 4, 8 y 13)')
{
  const dir = join(ROOT, 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const sql = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  // Tablas de public creadas por las migraciones que quedaron sin RLS.
  const created = new Set([...sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase()))
  const withRls = new Set([...sql.matchAll(/alter table (?:public\.)?([a-z_][a-z0-9_]*) enable row level security/gi)].map((m) => m[1].toLowerCase()))
  const noRls = [...created].filter((t) => !withRls.has(t))
  check('toda tabla creada en las migraciones tiene RLS activada', noRls.length === 0, noRls.join(', '))
  const openPolicies = [...sql.matchAll(/create policy "([^"]+)" on ([a-z_.]+)[\s\S]*?(?:using|with check) \(\s*true\s*\)/gi)].map((m) => `${m[2]}.${m[1]}`)
  check('ninguna política "using (true)" (abierta a todos)', openPolicies.length === 0, openPolicies.join(', '))
  // SQL dinámico: cada EXECUTE tiene que usar format(%I/%L), quote_* o USING.
  const dynamic = []
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8')
    for (const m of text.matchAll(/\bexecute\s+(?!format\(|function\b|procedure\b|on\b|privilege\b)([^;]{0,120});/gi)) {
      if (/\busing\b|quote_ident|quote_literal|\$[a-z_]+\$|v_def|v_new|^'/i.test(m[1])) continue
      dynamic.push(`${f}: execute ${m[1].trim().slice(0, 50)}`)
    }
  }
  check('el SQL dinámico (execute) se arma con format(%I/%L), quote_* o parámetros', dynamic.length === 0, dynamic.slice(0, 3).join(' | '))
}

// ---------------------------------------------------------------------------
if (existsSync(join(ROOT, 'dist'))) {
  section('Bundle compilado (control 1)')
  const bad = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(js|mjs|html|json|map)$/.test(name)) {
        const text = readFileSync(full, 'utf8')
        // supabase-js nombra el prefijo sb_secret_ en su código y nuestros mensajes nombran variables: se buscan valores.
        if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) bad.push(relative(ROOT, full))
        for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
          try {
            if (JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role === 'service_role') bad.push(`${relative(ROOT, full)} (JWT service_role)`)
          } catch {
            /* no era un JWT */
          }
        }
      }
    }
  }
  walk(join(ROOT, 'dist'))
  check('el bundle compilado no contiene claves service_role ni secretos', bad.length === 0, bad.join(', '))
}

// ---------------------------------------------------------------------------
if (urlArg) {
  section(`Respuesta real de ${urlArg} (controles 18 y 19)`)
  try {
    const target = new URL(urlArg)
    const res = await fetch(target, { redirect: 'manual' })
    const h = (name) => res.headers.get(name) ?? ''
    check('responde con éxito por HTTPS', res.status >= 200 && res.status < 400, `HTTP ${res.status}`)
    check('X-Frame-Options: DENY', h('x-frame-options') === 'DENY', h('x-frame-options') || 'ausente')
    check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff', h('x-content-type-options') || 'ausente')
    check('Referrer-Policy presente', /strict-origin/.test(h('referrer-policy')), h('referrer-policy') || 'ausente')
    check('Permissions-Policy presente', h('permissions-policy') !== '', h('permissions-policy') || 'ausente')
    check('Content-Security-Policy presente y con script-src \'self\'', /script-src 'self'/.test(h('content-security-policy')), h('content-security-policy') ? 'presente' : 'ausente')
    check('Strict-Transport-Security (HSTS) con al menos 1 año', Number(/max-age=(\d+)/.exec(h('strict-transport-security'))?.[1] ?? 0) >= 31536000, h('strict-transport-security') || 'ausente')
    if (target.protocol === 'https:') {
      const plain = new URL(urlArg)
      plain.protocol = 'http:'
      try {
        const redirect = await fetch(plain, { redirect: 'manual' })
        check('http:// redirige a https://', [301, 302, 307, 308].includes(redirect.status) && /^https:/.test(redirect.headers.get('location') ?? ''), `HTTP ${redirect.status} → ${redirect.headers.get('location') ?? '(sin Location)'}`)
      } catch (err) {
        fail('no se pudo probar la redirección de http:// a https://', String(err.message).split('\n')[0])
      }
    }
  } catch (err) {
    fail(`no se pudo pedir ${urlArg}`, String(err.message).split('\n')[0])
  }
} else {
  section('Respuesta real del sitio publicado')
  results.push({ ok: true, name: 'no se pidió ninguna URL: para revisar lo que Vercel realmente responde, correr npm run security:check -- --url https://<tu-sitio>', detail: '(omitido)' })
}

// ---------------------------------------------------------------------------
let failed = 0
let passed = 0
for (const r of results) {
  if (r.section) {
    console.log(`\n== ${r.section}`)
    continue
  }
  if (r.ok) passed += 1
  else failed += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
// Para que "import" de este archivo no ejecute nada raro en herramientas.
void pathToFileURL
