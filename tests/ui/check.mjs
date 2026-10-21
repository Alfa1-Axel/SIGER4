// Pruebas de pantalla de SIGER4. Recorre cada persona (variante de rol) por cada pantalla, ancho y tema contra un backend de
// Supabase simulado (tests/ui/backend) y falla si encuentra:
//   - una pantalla que no abre o queda en blanco;
//   - desborde horizontal (la página o el contenido principal más anchos que la ventana);
//   - fallas de accesibilidad de gravedad seria o crítica (axe-core, WCAG 2.0/2.1 A y AA), contraste incluido;
//   - una pantalla sin título (<h1>) o con más de uno;
//   - controles táctiles de menos de 40 px en celular y tablet.
// No toca ningún servidor real: todo el tráfico a Supabase lo contesta el simulado dentro del navegador.
//
//   npm run test:ui                         recorrido corto: 4 variantes de rol, celular claro y escritorio oscuro
//   npm run test:ui -- --full               las 16 variantes, 6 anchos, claro y oscuro (varias horas)
//   npm run test:ui -- --personas informatica --viewports 320,360 --themes dark --routes calendario,mapa
//   npm run test:ui -- --noaxe              sin accesibilidad (más rápido)
// Más opciones y detalles en tests/ui/README.md.
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { installMock } from './backend/mock.mjs'
import { AUTH } from './backend/fixtures.mjs'
import { PERSONAS, ROUTES } from './personas.mjs'

const require = createRequire(import.meta.url)
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : acc), []),
)
const PORT = 5199
const BASE = args.url ?? `http://localhost:${PORT}`
const AXE = args.noaxe ? '' : readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; 23078PND5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const VIEWPORTS = { 320: [320, 568], 360: [360, 640], 390: [390, 844], 768: [768, 1024], 1366: [1366, 860], 1920: [1920, 1080] }
// Controles que miden menos de 40 px pero tienen un área de toque mayor (se agranda con ::after, sin cambiar el diseño).
const HIT_AREA_EXTENDED = '.leaflet-marker-icon, .app-header-home, .app-header-avatar-link'

// ---------- Qué combinaciones recorrer ----------
const personas = args.personas ? args.personas.split(',') : args.full ? Object.keys(PERSONAS) : ['informatica', 'presidente_cd', 'miembro_depto', 'coord_escuela']
const combos = []
if (args.viewports || args.themes || args.full) {
  const vps = (args.viewports ?? (args.full ? '320,360,390,768,1366,1920' : '360,1366')).split(',')
  const ths = (args.themes ?? 'light,dark').split(',')
  for (const vp of vps) for (const th of ths) combos.push([Number(vp), th])
} else {
  combos.push([360, 'light'], [1366, 'dark'])
}
const routes = args.routes ? ROUTES.filter(([name]) => args.routes.split(',').some((s) => name.includes(s))) : ROUTES

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(who) {
  const sub = AUTH[who]
  const exp = Math.floor(Date.now() / 1000) + 86400
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub, exp, role: 'authenticated' })}.c2ln`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r',
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: `${who}@example.org`, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }
}

// ---------- Servidor de la aplicación (Vite apuntando al simulado) ----------
async function isUp(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function startApp() {
  if (args.url) {
    if (!(await isUp(BASE))) throw new Error(`No responde ${BASE}`)
    return null
  }
  if (await isUp(BASE)) {
    throw new Error(`Ya hay algo escuchando en ${BASE}. Cerralo, o pasá --url si es la app levantada contra el simulado (VITE_SUPABASE_URL=https://mock.supabase.local).`)
  }
  const viteBin = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
  const child = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: 'https://mock.supabase.local', VITE_SUPABASE_ANON_KEY: 'fake-anon-key', VITE_VAPID_PUBLIC_KEY: '' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 120; i++) {
    if (await isUp(BASE)) return child
    await new Promise((r) => setTimeout(r, 500))
  }
  child.kill()
  throw new Error('La aplicación no arrancó en 60 s.')
}

// ---------- Medición dentro de la página ----------
function measure(page, width) {
  return page.evaluate(
    ({ W, ignore }) => {
      const visible = (el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }
      const label = (el) =>
        `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX
          if ((o === 'auto' || o === 'scroll') && p.getBoundingClientRect().right <= W + 1) return true
        }
        return false
      }
      const overflow = []
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || getComputedStyle(el).position === 'fixed') continue
        const r = el.getBoundingClientRect()
        if ((r.right > W + 1 || (r.left < -1 && r.right > 1)) && !inScroller(el)) overflow.push(`${label(el)} r=${Math.round(r.right)}`)
        if (overflow.length >= 3) break
      }
      const main = document.querySelector('main.app-content')
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      const mainOverflow = main ? main.scrollWidth - main.clientWidth : 0
      const small = []
      const selector = 'button, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), summary, [role=tab], [role=button], a.btn, a.chip, a.tab, a.sidebar-link, a.row-item, a.list-item'
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el) || el.closest('.sr-only') || el.matches(ignore)) continue
        const r = el.getBoundingClientRect()
        if (r.right <= 0 || r.left >= W || r.bottom <= 0) continue // fuera de pantalla (menú cerrado)
        const wide = (el.textContent || '').trim().length > 0 ? 999 : r.width
        if (r.height < 40 || wide < 40) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
      const text = (main?.innerText || '').trim()
      return { overflow, docOverflow, mainOverflow, small, textLen: text.length, h1Count: document.querySelectorAll('main h1').length, denied: document.querySelectorAll('.access-denied').length > 0 }
    },
    { W: width, ignore: HIT_AREA_EXTENDED },
  )
}

async function runAxe(page) {
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${(v.nodes[0]?.html ?? '').replace(/\s+/g, ' ').slice(0, 110)}`)
  })
}

// ---------- Recorrido ----------
const app = await startApp()
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
const failures = []
let views = 0
try {
  for (const pid of personas) {
    const persona = PERSONAS[pid]
    if (!persona) throw new Error(`Persona desconocida: ${pid}. Disponibles: ${Object.keys(PERSONAS).join(', ')}`)
    for (const [vp, theme] of combos) {
      const [width, height] = VIEWPORTS[vp] ?? [vp, 800]
      const mobile = width <= 768
      const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, userAgent: mobile ? ANDROID : undefined, locale: 'es-AR' })
      context.setDefaultTimeout(8000)
      await installMock(context, { who: persona.who, mutate: persona.mutate, v70: true, v71: true, v73: true, mapRls: true })
      await context.addInitScript(({ s, theme }) => {
        try {
          localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
          localStorage.setItem('siger4-theme', theme)
        } catch {
          // sin almacenamiento: la prueba se queda sin sesión y lo va a informar como pantalla en blanco
        }
      }, { s: sessionFor(persona.who), theme })
      const page = await context.newPage()
      page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => undefined))
      const found = []
      for (const [name, path] of routes) {
        const where = `${pid} · ${name} · ${width}px · ${theme}`
        views++
        try {
          await page.goto(BASE + path, { timeout: 30000 })
          await page.waitForTimeout(700)
          const m = await measure(page, width)
          if (m.textLen < 20 && !m.denied) failures.push(`${where}: pantalla en blanco`)
          if (m.docOverflow > 1 || m.mainOverflow > 1 || m.overflow.length) failures.push(`${where}: desborde horizontal (${m.docOverflow > 1 ? `página +${m.docOverflow}px` : m.mainOverflow > 1 ? `contenido +${m.mainOverflow}px` : m.overflow[0]})`)
          if (m.h1Count !== 1) failures.push(`${where}: ${m.h1Count} títulos <h1> (tiene que haber uno)`)
          if (mobile && m.small.length) failures.push(`${where}: controles táctiles de menos de 40 px (${m.small.slice(0, 2).join(' | ')})`)
          if (!args.noaxe) for (const v of await runAxe(page)) failures.push(`${where}: accesibilidad ${v}`)
        } catch (e) {
          failures.push(`${where}: no abrió (${String(e.message).split('\n')[0].slice(0, 100)})`)
        }
        found.push(name)
      }
      await context.close()
      process.stdout.write(`  ${pid} · ${width}px · ${theme}: ${found.length} pantallas\n`)
    }
  }
} finally {
  await browser.close()
  app?.kill()
}

console.log(`\nVistas recorridas: ${views} (${personas.length} variantes de rol).`)
if (failures.length) {
  console.log(`\nFALLAS (${failures.length}):`)
  for (const f of failures.slice(0, 60)) console.log('  - ' + f)
  if (failures.length > 60) console.log(`  … y ${failures.length - 60} más`)
  process.exit(1)
}
console.log('Sin fallas: sin pantallas en blanco, sin desborde horizontal, sin fallas serias de accesibilidad, un título por pantalla y controles táctiles de 40 px o más.')
