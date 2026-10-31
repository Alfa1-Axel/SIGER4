// Pruebas de la base (`npm run test:db`): arma una base local desde cero con TODAS las migraciones de
// backend/supabase/migrations (0001 en adelante), cada una en su propia ejecución, como se corren en Supabase, y corre encima
// las suites SQL de esta carpeta (test_*.sql). Necesita un PostgreSQL 16 local: nunca se conecta a otro equipo.
//
//   npm run test:db                                   arma siger4_test y corre todo
//   node tests/backend/db/run.mjs mi_base             lo mismo con otro nombre de base (se borra si existe)
//   node tests/backend/db/run.mjs mi_base 0120        solo arma la base hasta esa migración, sin suites
//
// Variables: PSQL (ruta de psql; si no está, el psql del PATH), PGPORT (por defecto 54329), PGUSER (por defecto postgres).
// PGHOST solo puede ser este equipo (localhost, 127.0.0.1, ::1 o una carpeta de sockets).
//
// En orden:
//   1. Borra y crea la base y carga bootstrap.sql (los mínimos de Supabase: roles, auth y storage).
//   2. Corre las migraciones en orden. 0006 y 0008 se saltean: reescriben enums que 0001 ya trae en su forma final. Hasta la
//      0093 se toleran los errores de SQL (en una base nueva 0001 y 0002 ya traen el esquema final, esas migraciones vuelven a
//      crear triggers, políticas y tipos, y no existe la publicación de Realtime), pero no que psql no pueda leer el archivo.
//      Desde la 0094 cada una corre en una transacción y cualquier error es una falla.
//   3. Corre las suites test_*.sql (cada una se deshace al terminar) y cuenta PASS y FAIL.
//   4. Vuelve a aplicar las migraciones que se declaran idempotentes y repite las suites.
//   5. Corre backend/supabase/security_audit.sql (solo lectura): tiene que terminar sin errores. Sus resultados se leen a mano,
//      como en el SQL Editor de Supabase.
// Sale con código 1 ante cualquier falla. La base queda armada para revisarla.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = fileURLToPath(new URL('../../../backend/supabase/migrations/', import.meta.url))
const AUDIT = fileURLToPath(new URL('../../../backend/supabase/security_audit.sql', import.meta.url))

const PSQL = process.env.PSQL || 'psql'
const PORT = process.env.PGPORT || '54329'
const USER = process.env.PGUSER || 'postgres'
const HOST = process.env.PGHOST || 'localhost'
const [DB = 'siger4_test', UPTO_ARG] = process.argv.slice(2)
const UPTO = UPTO_ARG === undefined ? Infinity : Number(UPTO_ARG)

function stop(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

if (!['localhost', '127.0.0.1', '::1'].includes(HOST) && !HOST.startsWith('/')) stop(`PGHOST apunta a otro equipo (${HOST}). Estas pruebas solo corren contra un PostgreSQL local.`)
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(DB) || ['postgres', 'template0', 'template1'].includes(DB)) stop(`Nombre de base no válido: ${DB}`)
if (UPTO_ARG !== undefined && !Number.isInteger(UPTO)) stop(`El segundo argumento tiene que ser un número de migración (ej. 0120), no "${UPTO_ARG}".`)

// Los mensajes del servidor salen en inglés (lc_messages=C) para reconocerlos igual en cualquier instalación; los avisos
// (NOTICE) no se muestran.
const PSQL_ENV = { ...process.env, PGOPTIONS: '-c lc_messages=C -c client_min_messages=warning', PGCLIENTENCODING: 'UTF8' }

function psql(args, { db = DB, cwd } = {}) {
  const run = spawnSync(PSQL, ['-X', '-h', HOST, '-p', PORT, '-U', USER, '-d', db, ...args], { cwd, env: PSQL_ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.error) stop(`No se pudo ejecutar psql (${PSQL}): ${run.error.message}. Indicá su ruta con la variable PSQL.`)
  return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` }
}
const errorLines = (out) => out.split(/\r?\n/).filter((line) => /\bERROR\b|^psql: error/.test(line))
const firstLine = (out) => out.trim().split(/\r?\n/)[0] ?? ''

const failures = []

// ------------------------------------------------------------------ 1. Base nueva
const version = psql(['-At', '-c', 'show server_version'], { db: 'postgres' })
if (version.code !== 0) stop(`No responde un PostgreSQL en ${HOST}:${PORT} con el usuario ${USER}.\n${version.out.trim()}`)
console.log(`PostgreSQL ${version.out.trim()} en ${HOST}:${PORT}, base ${DB}.`)
if (!version.out.trim().startsWith('16')) console.log('Aviso: las suites se escribieron contra PostgreSQL 16.')

const created = psql(['-q', '-c', `drop database if exists ${DB};`, '-c', `create database ${DB};`], { db: 'postgres' })
if (created.code !== 0) stop(`No se pudo crear la base ${DB}.\n${created.out.trim()}`)
const boot = psql(['-q', '-f', join(HERE, 'bootstrap.sql')])
const bootErrors = errorLines(boot.out).filter((line) => !/already exists/.test(line))
if (boot.code !== 0 || bootErrors.length) stop(`bootstrap.sql falló:\n${bootErrors.join('\n') || boot.out.trim()}`)

// ------------------------------------------------------------------ 2. Migraciones
const migrations = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
let applied = 0
let tolerated = 0
let last = null
for (const file of migrations) {
  const n = Number(file.slice(0, 4))
  if (n > UPTO || /^000[68]_/.test(file)) continue
  if (n <= 93) {
    const run = psql(['-q', '-f', join(MIGRATIONS, file)])
    if (run.code !== 0) failures.push(`${file}: psql no pudo correrla (${firstLine(run.out)})`)
    tolerated += errorLines(run.out).length
  } else {
    const run = psql(['-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', join(MIGRATIONS, file)])
    if (run.code !== 0) failures.push(`${file}: ${errorLines(run.out).slice(0, 2).join(' | ') || firstLine(run.out)}`)
  }
  applied += 1
  last = file
}
console.log(`${failures.length ? 'FAIL' : 'PASS'}  migraciones: ${applied} aplicadas desde una base vacía, hasta ${last ?? '(ninguna)'} (0006 y 0008 salteadas; ${tolerated} errores tolerados hasta la 0093).`)

if (UPTO_ARG !== undefined) {
  for (const f of failures) console.log(`  - ${f}`)
  console.log(failures.length ? `\nLa base ${DB} quedó incompleta.` : `\nBase ${DB} armada hasta la migración ${UPTO_ARG}.`)
  process.exit(failures.length ? 1 : 0)
}

// ------------------------------------------------------------------ 3. Suites
const suites = readdirSync(HERE).filter((f) => /^test_.*\.sql$/.test(f)).sort()
function runSuites(label) {
  for (const suite of suites) {
    // Desde esta carpeta: las suites incluyen sus datos de prueba con \i (fixture70.sql, fixture71.sql).
    const run = psql(['-q', '-f', suite], { cwd: HERE })
    const lines = run.out.split(/\r?\n/)
    const pass = lines.filter((line) => line.startsWith('PASS')).length
    const failed = lines.filter((line) => line.startsWith('FAIL'))
    const errors = errorLines(run.out)
    const ok = run.code === 0 && pass > 0 && failed.length === 0 && errors.length === 0
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite}${label}: ${pass} PASS, ${failed.length} FAIL${errors.length ? `, ${errors.length} errores` : ''}`)
    if (!ok) failures.push(`${suite}${label}: ${[...failed, ...errors].slice(0, 3).join(' | ') || firstLine(run.out) || 'sin comprobaciones'}`)
  }
}
if (!failures.length) runSuites('')

// ------------------------------------------------------------------ 4. Migraciones idempotentes, otra vez
if (!failures.length) {
  const idempotent = migrations.filter((file) => {
    const text = readFileSync(join(MIGRATIONS, file), 'utf8')
    return /^--.*\bidempotente\b/im.test(text) && !/^--.*\bno es idempotente\b/im.test(text)
  })
  const again = []
  for (const file of idempotent) {
    const run = psql(['-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', join(MIGRATIONS, file)])
    if (run.code !== 0) again.push(`${file}: ${errorLines(run.out).slice(0, 2).join(' | ') || firstLine(run.out)}`)
  }
  console.log(`${again.length ? 'FAIL' : 'PASS'}  migraciones idempotentes aplicadas otra vez: ${idempotent.length - again.length} de ${idempotent.length} sin errores (${idempotent.map((f) => f.slice(0, 4)).join(', ')}).`)
  failures.push(...again)
  if (!again.length) runSuites(' (tras reaplicar)')
}

// ------------------------------------------------------------------ 5. Auditoría de seguridad
if (!failures.length) {
  const audit = psql(['-q', '-f', AUDIT])
  const errors = errorLines(audit.out)
  const ok = audit.code === 0 && errors.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  security_audit.sql corre sin errores (sus resultados se revisan a mano en el SQL Editor de Supabase).`)
  if (!ok) failures.push(`security_audit.sql: ${errors.slice(0, 2).join(' | ') || firstLine(audit.out)}`)
}

// ------------------------------------------------------------------ Resumen
if (failures.length) {
  console.log(`\nFALLAS (${failures.length}):`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\nSin fallas. La base ${DB} quedó armada para revisarla.`)
