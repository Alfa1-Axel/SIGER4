// Backend de Supabase simulado para las pruebas de pantalla (tests/frontend/ui). Responde las rutas REST/RPC/Auth/Storage que usa
// la aplicación con datos ficticios, dentro del navegador (Playwright route). No se conecta a ningún servidor real.
import { AUTH, DEP, PROF, RPC, ST, buildTables } from './fixtures.mjs'
import { addFixtures70, createMock70 } from './mock70.mjs'
import { addFixtures71, createMock71 } from './mock71.mjs'

const MOCK_HOST = 'mock.supabase.local'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function sessionFor(who) {
  const sub = AUTH[who]
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365
  const user = {
    id: sub,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${who}@example.org`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp, email: user.email, session_id: 'x' })}.c2ln`
  return { access_token, token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: exp, refresh_token: 'fake-refresh', user }
}

function likeMatch(cell, pattern) {
  if (cell === null || cell === undefined) return false
  const needle = String(pattern).replace(/^[%*]+|[%*]+$/g, '').toLowerCase()
  return String(cell).toLowerCase().includes(needle)
}

function applyFilters(rows, params) {
  let out = rows
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    if (key === 'or') {
      const conds = raw.replace(/^\(|\)$/g, '').split(',').map((c) => {
        const [col, op, ...rest] = c.split('.')
        return { col, op, value: rest.join('.') }
      })
      out = out.filter((row) => conds.some(({ col, op, value }) => {
        if (op === 'ilike') return likeMatch(row[col], value)
        if (op === 'gte') return row[col] != null && String(row[col]) >= value
        if (op === 'lte') return row[col] != null && String(row[col]) <= value
        return String(row[col]) === value
      }))
      continue
    }
    const [op, ...rest] = raw.split('.')
    const value = rest.join('.')
    out = out.filter((row) => {
      const cell = row[key]
      const s = cell === null || cell === undefined ? null : String(cell)
      switch (op) {
        case 'ilike':
          return likeMatch(cell, value)
        case 'eq':
          return s === value
        case 'neq':
          return s !== value
        case 'is':
          return value === 'null' ? s === null : String(cell) === value
        case 'not':
          if (raw.startsWith('not.is.null')) return s !== null
          return true
        case 'in': {
          const list = value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
          return list.includes(s)
        }
        case 'gte':
          return s !== null && s >= value
        case 'lte':
          return s !== null && s <= value
        case 'gt':
          return s !== null && s > value
        case 'lt':
          return s !== null && s < value
        default:
          return true
      }
    })
  }
  return out
}

export async function installMock(context, opts = {}) {
  // La novedad más reciente no debe tapar las pantallas en ninguna suite
  // (salvo la que prueba justamente ese aviso: markLatestSeen: false).
  if (opts.markLatestSeen !== false) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('siger4:update-seen:2026-10-06-modo-departamento', '1')
        localStorage.setItem('siger4:update-seen:2026-10-07-aviso-y-contacto', '1')
        localStorage.setItem('siger4:update-seen:2026-10-07-dotacion-y-lenguaje', '1')
      } catch {}
    })
  }
  const tables = buildTables()
  // Para armar combinaciones de roles o departamentos en una prueba.
  if (opts.mutate) opts.mutate(tables)
  // Tanda 70 (v1.14.0): versiones, borradores, fichas y verificaciones del mapa.
  tables.form_drafts = []
  if (opts.v70) addFixtures70(tables)
  // Tanda 71 (v1.15.0): Avales con permisos por área, renovación y movimientos.
  if (opts.v71) addFixtures71(tables)
  // Lecturas de notificaciones masivas por usuario (notification_reads, 0102).
  const sharedReads = new Set()
  const failTables = new Set(opts.failTables ?? [])
  const delayTables = new Set(opts.delayTables ?? [])
  // RLS por división (0103): quién ve cada departamento.
  function deptAccess() {
    const me = PROF[opts.who ?? 'admin']
    const roles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
    const admin = roles.includes('informatica_r4') || roles.includes('integrante_informatica')
    const regional = admin || roles.includes('secretario_regional') || roles.includes('director_escuela')
    // Rol + departamento (0106): sin el rol, figurar en el departamento no da acceso.
    const coordinated = new Set(admin || roles.includes('coordinador_departamento') ? tables.departments.filter((d) => d.coordinator_profile_id === me).map((d) => d.id) : [])
    const member = new Set(admin || roles.includes('miembro_departamento') ? tables.department_members.filter((m) => m.profile_id === me).map((m) => m.department_id) : [])
    const mine = new Set([...coordinated, ...member])
    return { me, admin, regional, coordinated, member, canView: (id) => regional || mine.has(id), canReports: (id) => admin || mine.has(id) }
  }
  // Modo departamento (0107): solo roles de departamento. La base no
  // devuelve los módulos cerrados, los eventos que no son de departamento ni
  // los avisos generales que llevan a un módulo cerrado.
  function deptOnly() {
    const me = PROF[opts.who ?? 'admin']
    const roles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
    return roles.length > 0 && roles.every((r) => r === 'coordinador_departamento' || r === 'miembro_departamento')
  }
  const CLOSED_TABLES = new Set([
    'stations', 'station_staffing', 'station_staffing_history', 'vehicles', 'vehicle_status_history', 'personnel', 'personnel_status_history', 'attendance_summaries', 'intervention_summaries',
    'station_history_events', 'station_compliance', 'documents', 'document_versions', 'document_folders', 'courses', 'course_stations',
    'inventory_items', 'inventory_item_history', 'inventory_loan_requests', 'map_reference_points',
  ])
  const CLOSED_LINK = /^\/(cuarteles|vehiculos|asistencia|intervenciones|personal|historial|mapa|calendario|escuela|documentos|inventario|reportes|usuarios|auditoria)(\/|\?|#|$)/
  // RLS de la dotación (0108): lee quien tiene el cuartel en su alcance, el
  // Secretario Regional (su Regional) e Informática; guarda quien además carga
  // el personal del cuartel. Quien solo tiene roles de departamento no la ve.
  // RLS de stations (v73): Informática, Regional y Escuela leen todos; los roles de cuartel, el suyo; el resto,
  // ninguno. En modo departamento la política restrictiva (0107) cierra la tabla. Solo con opts.v73: las suites
  // anteriores sirven todos los cuarteles a cualquier persona.
  function stationReadAccess() {
    const me = PROF[opts.who ?? 'admin']
    const roles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
    const wide = roles.some((r) => ['informatica_r4', 'integrante_informatica', 'secretario_regional', 'director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela'].includes(r))
    const mine = new Set([tables.profiles.find((p) => p.id === me)?.station_id, ...tables.user_scopes.filter((x) => x.profile_id === me).map((x) => x.station_id)].filter(Boolean))
    return { canRead: (st) => !deptOnly() && (wide || mine.has(st.id)) }
  }
  function staffingAccess() {
    const me = PROF[opts.who ?? 'admin']
    const roles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
    const admin = roles.includes('informatica_r4') || roles.includes('integrante_informatica')
    const regional = roles.includes('secretario_regional')
    const stationRole = roles.some((r) => ['usuario_carga_cuartel', 'jefe_cuerpo_activo', 'presidente_cuartel'].includes(r))
    const mine = new Set([tables.profiles.find((p) => p.id === me)?.station_id, ...tables.user_scopes.filter((s) => s.profile_id === me).map((s) => s.station_id)].filter(Boolean))
    return {
      me,
      canRead: (stationId) => !deptOnly() && (admin || regional || mine.has(stationId)),
      canWrite: (stationId) => !deptOnly() && (admin || regional || (stationRole && mine.has(stationId))),
    }
  }
  // RLS de documentos (0110): lo que ve cada rol. Publicados (no borrados ni sin
  // archivo): todos. Departamento: coordinador, integrantes e Informática.
  // Restringido: quien lo carga y quienes lo administran. El resto, por alcance.
  function docsAccess() {
    const me = PROF[opts.who ?? 'admin']
    const roles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
    const admin = roles.includes('informatica_r4') || roles.includes('integrante_informatica')
    const regional = roles.includes('secretario_regional')
    const stationRole = roles.some((r) => ['usuario_carga_cuartel', 'jefe_cuerpo_activo', 'presidente_cuartel', 'secretario_comision'].includes(r))
    const profile = tables.profiles.find((p) => p.id === me)
    const myStations = new Set([profile?.station_id, ...tables.user_scopes.filter((s) => s.profile_id === me).map((s) => s.station_id)].filter(Boolean))
    const myRegions = new Set([profile?.region_id, ...tables.user_scopes.filter((s) => s.profile_id === me).map((s) => s.region_id)].filter(Boolean))
    const dept = deptAccess()
    const regionOfStation = (id) => tables.stations.find((s) => s.id === id)?.region_id
    const regionMatch = (d) => (d.region_id && myRegions.has(d.region_id)) || (d.station_id && myRegions.has(regionOfStation(d.station_id)))
    const published = (d) => d.visibility === 'todos' && !d.deleted_at && d.storage_path !== 'pending'
    const inDepartment = (d) => d.department_id && dept.canReports(d.department_id)
    const manageable = (d) =>
      admin || d.uploaded_by_profile_id === me || (regional && regionMatch(d)) || (stationRole && d.station_id && myStations.has(d.station_id)) || (d.department_id && dept.coordinated.has(d.department_id))
    const canSee = (d) => {
      if (d.visibility === 'restringido' && !manageable(d) && d.profile_id !== me) return false
      if (deptOnly()) return Boolean(inDepartment(d) || published(d))
      if (admin || published(d) || inDepartment(d)) return true
      return Boolean((d.region_id && myRegions.has(d.region_id)) || (d.station_id && myStations.has(d.station_id)) || d.profile_id === me)
    }
    // Editar, papelera y restaurar: quien administra el alcance (en un departamento, su coordinador o quien lo cargó).
    const canEdit = (d) =>
      admin ||
      (d.department_id ? dept.coordinated.has(d.department_id) || (d.uploaded_by_profile_id === me && dept.canReports(d.department_id)) : (regional && regionMatch(d)) || (stationRole && d.station_id && myStations.has(d.station_id)))
    const canInsert = (d) => admin || (d.department_id ? dept.canReports(d.department_id) : (regional && regionMatch(d)) || (stationRole && d.station_id && myStations.has(d.station_id)))
    return { me, canSee, canEdit, canInsert, canPublish: admin || regional }
  }
  const STAFFING_KEYS = ['aspirantes_menores', 'aspirantes_mayores', 'bomberos_nivel_1', 'bomberos_nivel_2', 'bomberos_nivel_3', 'bomberos_nivel_4', 'personal_reserva', 'cuerpo_auxiliar']
  const staffingWrites = []
  context.staffingWrites = staffingWrites
  const rpcCalls = []
  context.rpcCalls = rpcCalls
  const bodyOverrides = new WeakMap()
  const m70 = createMock70({ tables, opts, applyFilters })
  context.mock70 = m70
  const m71 = opts.v71 ? createMock71({ tables, opts, applyFilters }) : null
  context.mock71 = m71
  context.tables70 = tables
  // Tablas pedidas a la API (para comprobar que una pantalla no consulta lo que su rol no usa).
  const restCalls = []
  context.restCalls = restCalls

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname.includes('tile.openstreetmap') || url.hostname.includes('basemaps')) return route.abort()
    if (url.hostname !== MOCK_HOST) return route.continue()
    const path = url.pathname
    const json = (body, status = 200, headers = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) })
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    if (path.startsWith('/auth/v1/user')) return json(sessionFor(opts.who ?? 'admin').user)
    if (path.startsWith('/auth/v1/')) return json({})
    if (m71) {
      const handled71 = await m71.handle({ route, request, url, path, json, bodyOverrides })
      await m71.flush()
      if (handled71) return
    }
    if (m70) {
      const handled = await m70.handle({ route, request, url, path, json, bodyOverrides })
      await m70.flush()
      if (handled) return
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      if (fn === 'list_school_avales_departments') {
        // Mismo contrato que 0097: departamento + coordinador de la sección
        // Departamentos; el coordinador ve solo el suyo.
        const who = opts.who ?? 'admin'
        const me = PROF[who]
        const rows = tables.departments.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          is_active: d.is_active,
          coordinator_profile_id: d.coordinator_profile_id,
          coordinator_name: tables.profiles.find((p) => p.id === d.coordinator_profile_id)?.full_name ?? null,
          is_my_department: d.coordinator_profile_id === me,
        }))
        if (who === 'admin' || who === 'coord' || who === 'integ') return json(rows)
        return json(rows.filter((d) => d.is_my_department))
      }
      let rpcBody = {}
      try {
        rpcBody = request.postDataJSON() ?? {}
      } catch {}
      rpcCalls.push({ fn, body: rpcBody })
      if (fn === 'get_pending_items' && deptOnly()) {
        // Como 0107: en modo departamento, solo lo de sus departamentos.
        return json((RPC.get_pending_items ?? []).filter((i) => i.module === 'Departamentos' || i.module === 'Calendario'))
      }
      if (fn === 'list_station_directory') {
        return json(
          tables.stations.map((st) => ({
            id: st.id,
            region_id: st.region_id,
            region_name: tables.regions.find((r) => r.id === st.region_id)?.name ?? 'Regional 4',
            subsede_id: st.subsede_id ?? null,
            subsede_name: tables.subsedes.find((x) => x.id === st.subsede_id)?.name ?? null,
            name: st.name,
            code: st.code,
            address: st.address ?? null,
            zone: st.zone ?? null,
            phone: st.phone ?? null,
            whatsapp_phone: st.whatsapp_phone ?? null,
            email: st.email ?? null,
            social_media: st.social_media ?? null,
            description: st.description ?? null,
            status: st.status,
            founded_year: st.founded_year ?? null,
            logo_url: st.logo_url ?? null,
            cover_image_url: st.cover_image_url ?? null,
            latitude: st.latitude ?? null,
            longitude: st.longitude ?? null,
          })),
        )
      }
      if (fn === 'station_directory_authorities') {
        const ROLES = ['presidente_cuartel', 'jefe_cuerpo_activo', 'secretario_comision']
        const out = []
        for (const p of tables.profiles.filter((x) => x.station_id === rpcBody.p_station_id && x.is_active !== false)) {
          for (const r of tables.user_roles.filter((x) => x.profile_id === p.id && ROLES.includes(x.role))) out.push({ full_name: p.full_name, role: r.role })
        }
        return json(out.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.full_name.localeCompare(b.full_name)))
      }
      if (fn === 'list_department_directory') {
        return json(
          tables.departments
            .map((d) => ({
              id: d.id,
              name: d.name,
              description: d.description ?? null,
              contact_info: d.contact_info ?? null,
              is_active: d.is_active,
              coordinator_name: tables.profiles.find((p) => p.id === d.coordinator_profile_id)?.full_name ?? null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
      if (fn === 'list_visible_departments') {
        const a = deptAccess()
        return json(
          tables.departments
            .filter((d) => a.canView(d.id))
            .map((d) => ({
              id: d.id,
              name: d.name,
              description: d.description,
              contact_info: d.contact_info,
              is_active: d.is_active,
              coordinator_profile_id: d.coordinator_profile_id,
              coordinator_name: tables.profiles.find((p) => p.id === d.coordinator_profile_id)?.full_name ?? null,
              member_count: tables.department_members.filter((m) => m.department_id === d.id).length,
              my_relation: a.coordinated.has(d.id) ? 'coordinador' : a.member.has(d.id) ? 'integrante' : null,
            })),
        )
      }
      if (fn === 'department_member_directory') {
        const a = deptAccess()
        if (!a.canView(rpcBody.p_department_id)) return json([])
        return json(
          tables.department_members
            .filter((m) => m.department_id === rpcBody.p_department_id)
            .map((m) => {
              const p = tables.profiles.find((x) => x.id === m.profile_id)
              return { member_id: m.id, profile_id: p.id, full_name: p.full_name, rank: p.rank, email: p.email, phone: p.phone, station_id: p.station_id, station_name: tables.stations.find((s) => s.id === p.station_id)?.name ?? null, is_active: p.is_active }
            }),
        )
      }
      if (fn === 'notify_department') {
        const a = deptAccess()
        const d = tables.departments.find((x) => x.id === rpcBody.p_department_id)
        const roles = tables.user_roles.filter((r) => r.profile_id === a.me).map((r) => r.role)
        if (!d || !(a.admin || roles.includes('secretario_regional') || d.coordinator_profile_id === a.me)) {
          return json({ code: '42501', message: 'Solo el coordinador del departamento, el Secretario Regional o Informática pueden avisar a todo el departamento.', details: null, hint: null }, 403)
        }
        const hasRole = (pid, r) => tables.user_roles.some((x) => x.profile_id === pid && x.role === r)
        const recipients = [
          ...new Set([
            ...(hasRole(d.coordinator_profile_id, 'coordinador_departamento') ? [d.coordinator_profile_id] : []),
            ...tables.department_members.filter((m) => m.department_id === d.id && hasRole(m.profile_id, 'miembro_departamento')).map((m) => m.profile_id),
          ]),
        ].filter((pid) => pid && pid !== a.me)
        for (const pid of recipients) {
          tables.notifications.unshift({ id: crypto.randomUUID(), profile_id: pid, region_id: null, subsede_id: null, station_id: null, type: rpcBody.p_type, title: rpcBody.p_title, body: rpcBody.p_body, is_read: false, created_at: new Date().toISOString(), app_update_id: null, link_path: `/departamentos/${d.id}`, department_id: d.id })
        }
        return json(recipients.length)
      }
      if (fn === 'coordinating_profile_ids') {
        const a = deptAccess()
        const myStations = new Set([tables.profiles.find((p) => p.id === a.me)?.station_id, ...tables.user_scopes.filter((s) => s.profile_id === a.me).map((s) => s.station_id)].filter(Boolean))
        const ids = (rpcBody.p_profile_ids ?? []).filter((pid) => {
          const p = tables.profiles.find((x) => x.id === pid)
          return p && tables.departments.some((d) => d.coordinator_profile_id === pid) && (a.admin || myStations.has(p.station_id))
        })
        return json(ids)
      }
      if (fn === 'mark_notifications_read') {
        let body = {}
        try {
          body = request.postDataJSON() ?? {}
        } catch {}
        const me = PROF[opts.who ?? 'admin']
        let changed = 0
        for (const n of tables.notifications) {
          if (n.profile_id !== me && n.profile_id !== null) continue
          if (Array.isArray(body.p_ids) && !body.p_ids.includes(n.id)) continue
          if (n.profile_id === me && !n.is_read) {
            n.is_read = true
            changed++
          } else if (n.profile_id === null && !sharedReads.has(n.id)) {
            sharedReads.add(n.id)
            changed++
          }
        }
        return json(changed)
      }
      return json(RPC[fn] ?? [])
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/')[3]
      if (failTables.has(table)) return json({ code: 'XX000', message: 'simulated failure', details: null, hint: null }, 500)
      if (delayTables.has(table)) await new Promise((r) => setTimeout(r, 60000))
      const method = request.method()
      restCalls.push(`${table}:${method}`)
      if (method !== 'GET' && method !== 'HEAD') {
        let body = {}
        try {
          body = bodyOverrides.get(request) ?? request.postDataJSON() ?? {}
        } catch {}
        // Como PostgREST: el id lo genera la base, y con .single() devuelve
        // un objeto en vez de un array.
        const rowsOut = (Array.isArray(body) ? body : [body]).map((r) => ({ id: crypto.randomUUID(), ...r }))
        // Las altas de informes y adjuntos se guardan en memoria, con lo que
        // completaría la base, para que el detalle las encuentre.
        // Como la base (0106): al asignar coordinador o miembros se sincroniza el rol.
        const syncRole = (pid) => {
          if (!pid || tables.user_roles.some((r) => r.profile_id === pid && r.role === 'informatica_r4')) return
          const add = (role) => {
            if (!tables.user_roles.some((r) => r.profile_id === pid && r.role === role)) tables.user_roles.push({ id: crypto.randomUUID(), profile_id: pid, role, created_at: new Date().toISOString() })
          }
          const drop = (role) => {
            const others = tables.user_roles.filter((r) => r.profile_id === pid && r.role !== role)
            if (others.length > 0) tables.user_roles = tables.user_roles.filter((r) => !(r.profile_id === pid && r.role === role))
          }
          if (tables.departments.some((d) => d.coordinator_profile_id === pid)) add('coordinador_departamento')
          else drop('coordinador_departamento')
          if (tables.department_members.some((m) => m.profile_id === pid)) add('miembro_departamento')
          else drop('miembro_departamento')
        }
        if (method === 'POST' && table === 'department_members') {
          for (const row of rowsOut) {
            tables.department_members.push({ created_at: new Date().toISOString(), ...row })
            syncRole(row.profile_id)
          }
        }
        if (method === 'DELETE' && table === 'department_members') {
          const gone = applyFilters(tables.department_members, url.searchParams)
          tables.department_members = tables.department_members.filter((m) => !gone.includes(m))
          for (const m of gone) syncRole(m.profile_id)
        }
        if (method === 'PATCH' && table === 'departments') {
          for (const d of applyFilters(tables.departments, url.searchParams)) {
            const previous = d.coordinator_profile_id
            Object.assign(d, body)
            if ('coordinator_profile_id' in body) {
              syncRole(d.coordinator_profile_id)
              syncRole(previous)
            }
          }
        }
        if (method === 'POST' && table === 'station_staffing') {
          staffingWrites.push(body)
          if (opts.failStaffingWrites) return json({ code: 'XX000', message: 'simulated failure', details: null, hint: null }, 500)
          if (opts.staffingSaveDelayMs) await new Promise((r) => setTimeout(r, opts.staffingSaveDelayMs))
          const access = staffingAccess()
          const out = []
          for (const input of Array.isArray(body) ? body : [body]) {
            if (!access.canWrite(input.station_id)) {
              return json({ code: '42501', message: 'new row violates row-level security policy for table "station_staffing"', details: null, hint: null }, 403)
            }
            const now = new Date().toISOString()
            const author = tables.profiles.find((p) => p.id === access.me)
            const previous = tables.station_staffing.find((r) => r.station_id === input.station_id)
            const row = { created_at: previous?.created_at ?? now, ...Object.fromEntries(STAFFING_KEYS.map((k) => [k, previous?.[k] ?? 0])), station_id: input.station_id }
            for (const k of STAFFING_KEYS) if (k in input) row[k] = input[k]
            row.reference_year = input.reference_year ?? previous?.reference_year ?? new Date().getFullYear()
            row.total = STAFFING_KEYS.reduce((sum, k) => (k === 'bomberos_nivel_4' ? sum : sum + row[k]), 0)
            row.updated_at = now
            row.updated_by_profile_id = access.me
            row.updated_by_name = author?.full_name ?? null
            tables.station_staffing = [...tables.station_staffing.filter((r) => r.station_id !== row.station_id), row]
            // Como la base (0109): una foto en el historial si cambiaron las cantidades o el año.
            const changed = !previous || previous.reference_year !== row.reference_year || STAFFING_KEYS.some((k) => previous[k] !== row[k])
            if (changed) {
              tables.station_staffing_history.unshift({ id: crypto.randomUUID(), station_id: row.station_id, reference_year: row.reference_year, ...Object.fromEntries(STAFFING_KEYS.map((k) => [k, row[k]])), total: row.total, recorded_by_profile_id: access.me, recorded_by_name: row.updated_by_name, recorded_at: now })
            }
            const station = tables.stations.find((s) => s.id === row.station_id)
            if (station) station.personnel_count = row.total
            out.push(row)
          }
          const wantsOne = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
          return json(wantsOne ? out[0] : out, 201)
        }
        if (method === 'POST' && table === 'attendance_summaries') {
          // Como la base (0109): efectivos de referencia = total de los efectivos cargados, sin promedio.
          for (let k = 0; k < rowsOut.length; k++) {
            const sf = tables.station_staffing.find((r) => r.station_id === rowsOut[k].station_id)
            rowsOut[k] = { created_at: new Date().toISOString(), ...rowsOut[k], total_members: sf && sf.total > 0 ? sf.total : null, present_average: null }
            tables[table].push(rowsOut[k])
          }
        }
        if (method === 'POST' && table === 'documents') {
          const docs = docsAccess()
          const now = new Date().toISOString()
          for (let k = 0; k < rowsOut.length; k++) {
            const input = rowsOut[k]
            if (input.visibility === 'todos' && !docs.canPublish) {
              return json({ code: '42501', message: 'Solo Informática y el Secretario Regional pueden publicar un documento para todos.', details: null, hint: null }, 403)
            }
            if (!docs.canInsert(input)) {
              return json({ code: '42501', message: 'new row violates row-level security policy for table "documents"', details: null, hint: null }, 403)
            }
            rowsOut[k] = { region_id: null, subsede_id: null, station_id: null, profile_id: null, department_id: null, visibility: 'alcance', description: null, folder_id: null, deleted_at: null, created_at: now, updated_at: now, ...input }
            tables.documents.push(rowsOut[k])
          }
        }
        if (method === 'PATCH' && table === 'documents') {
          const docs = docsAccess()
          const changed = []
          for (const d of applyFilters(tables.documents.filter((x) => docs.canSee(x)), url.searchParams)) {
            if (!docs.canEdit(d)) continue
            if (body.visibility === 'todos' && d.visibility !== 'todos' && !docs.canPublish) {
              return json({ code: '42501', message: 'Solo Informática y el Secretario Regional pueden publicar un documento para todos.', details: null, hint: null }, 403)
            }
            Object.assign(d, body, { updated_at: new Date().toISOString() })
            changed.push(d)
          }
          const wantsOne = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
          if (wantsOne && !changed[0]) return json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406)
          return json(wantsOne ? changed[0] : changed, 200)
        }
        if (method === 'POST' && table === 'calendar_events') {
          const now = new Date().toISOString()
          for (let k = 0; k < rowsOut.length; k++) {
            rowsOut[k] = { status: 'programado', reminder_sent_at: null, created_by_profile_id: PROF[opts.who ?? 'admin'], department_id: null, created_at: now, updated_at: now, ...rowsOut[k] }
            tables[table].push(rowsOut[k])
          }
        }
        if (method === 'POST' && table === 'inventory_loan_requests') {
          const now = new Date().toISOString()
          for (let k = 0; k < rowsOut.length; k++) {
            rowsOut[k] = { status: 'pendiente', requested_from: now, created_at: now, updated_at: now, ...rowsOut[k] }
            tables[table].push(rowsOut[k])
          }
        }
        if (method === 'POST' && (table === 'department_reports' || table === 'department_report_files')) {
          const who = opts.who ?? 'admin'
          for (let k = 0; k < rowsOut.length; k++) {
            const now = new Date().toISOString()
            const extra = table === 'department_reports'
              ? { created_by_profile_id: PROF[who], created_by_name: tables.profiles.find((p) => p.id === PROF[who])?.full_name ?? null, is_archived: false, archived_at: null, archived_by_profile_id: null, created_at: now, updated_at: now }
              : { file_kind: String(rowsOut[k].mime_type).startsWith('image/') ? 'imagen' : String(rowsOut[k].mime_type).startsWith('video/') ? 'video' : 'documento', created_at: now }
            rowsOut[k] = { ...rowsOut[k], ...extra }
            tables[table].push(rowsOut[k])
          }
        }
        const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
        return json(wantsObject ? rowsOut[0] : rowsOut, 201)
      }
      let source = tables[table] ?? []
      if (deptOnly()) {
        if (CLOSED_TABLES.has(table) && table !== 'documents') source = []
        if (table === 'calendar_events') source = source.filter((e) => e.department_id)
      }
      if (opts.v73 && table === 'stations' && !deptOnly()) {
        const access = stationReadAccess()
        source = source.filter((st) => access.canRead(st))
      }
      if (table === 'station_staffing' || table === 'station_staffing_history') {
        const access = staffingAccess()
        source = source.filter((r) => access.canRead(r.station_id))
      }
      if (table === 'documents') {
        const docs = docsAccess()
        source = source.filter((d) => docs.canSee(d))
      }
      if (table === 'my_notifications') {
        const me = PROF[opts.who ?? 'admin']
        source = tables.notifications
          .filter((n) => n.profile_id === me || n.profile_id === null)
          .map((n) => ({ ...n, is_read: n.profile_id === null ? sharedReads.has(n.id) : n.is_read }))
        if (deptOnly()) source = source.filter((n) => n.profile_id !== null || !n.link_path || !CLOSED_LINK.test(n.link_path))
      }
      // RLS de informes (0098): Informática todo; coordinador e integrantes,
      // los de sus departamentos.
      if (table === 'department_reports' || table === 'department_report_files') {
        const a = deptAccess()
        source = source.filter((r) => a.canReports(r.department_id))
      }
      // RLS por división (0103).
      if (table === 'departments') {
        const a = deptAccess()
        source = source.filter((d) => a.canView(d.id))
      }
      if (table === 'department_members') {
        const a = deptAccess()
        source = source.filter((m) => m.profile_id === a.me || a.canView(m.department_id))
      }
      if (table === 'department_manual_members' || table === 'department_activity_reports') {
        const a = deptAccess()
        source = source.filter((r) => a.canView(r.department_id))
      }
      if (table === 'calendar_events') {
        const a = deptAccess()
        source = source.filter((e) => !e.department_id || a.canView(e.department_id))
      }
      if (table === 'department_reports') {
        source = source.map((r) => ({ ...r, files: tables.department_report_files.filter((f) => f.report_id === r.id) }))
      }
      let rows = applyFilters(source, url.searchParams)
      const total = rows.length
      const limit = Number(url.searchParams.get('limit'))
      if (limit) rows = rows.slice(0, limit)
      const headers = { 'content-range': `0-${Math.max(0, rows.length - 1)}/${total}` }
      const accept = request.headers()['accept'] ?? ''
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: '' })
      if (accept.includes('vnd.pgrst.object')) {
        if (!rows[0]) return json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406)
        return json(rows[0], 200, headers)
      }
      return json(rows, 200, headers)
    }
    if (path.startsWith('/storage/v1/object/sign/') && request.method() === 'GET') {
      // Imagen de prueba para miniaturas firmadas.
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c0392b"/><circle cx="200" cy="150" r="70" fill="#f39c12"/></svg>' })
    }
    // Descarga de un documento (0110): la URL firmada solo se da si la base le dejaría ver el documento.
    if (path.startsWith('/storage/v1/object/sign/documents/') && request.method() === 'POST') {
      const docId = decodeURIComponent(path.split('/')[6] ?? '')
      const target = tables.documents.find((d) => d.id === docId)
      context.signedRequests = [...(context.signedRequests ?? []), docId]
      if (!target || !docsAccess().canSee(target)) return json({ error: 'Object not found', message: 'Object not found', statusCode: '404' }, 400)
      return json({ signedURL: '/object/sign/' + encodeURIComponent(docId) + '?token=y' })
    }
    if (path.startsWith('/storage/v1/object/sign/') && request.method() === 'POST') {
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      if (Array.isArray(body.paths)) {
        return json(body.paths.map((p) => ({ path: p, signedURL: `/object/sign/${encodeURIComponent(p)}?token=y`, error: null })))
      }
      return json({ signedURL: '/object/sign/x?token=y' })
    }
    if (path.startsWith('/storage/v1/')) return json({ signedURL: '/storage/v1/object/sign/x?token=y', Key: 'k', Id: 'i' })
    if (path === '/functions/v1/admin-create-user') {
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      rpcCalls.push({ fn: 'admin-create-user', body })
      if (opts.v73) {
        // Reglas del servidor (backend/supabase/functions/_shared/delegatedMemberCreation.ts): el coordinador solo crea
        // Miembros de Departamento en departamentos activos que coordina; sin cuartel ni otro alcance.
        const me = PROF[opts.who ?? 'admin']
        const myRoles = tables.user_roles.filter((r) => r.profile_id === me).map((r) => r.role)
        const wide = myRoles.some((r) => ['informatica_r4', 'integrante_informatica', 'director_escuela', 'jefe_cuerpo_activo'].includes(r))
        if (!wide) {
          const deny = (error, status = 403) => json({ error }, status)
          const ids = Array.isArray(body.department_ids) ? body.department_ids : []
          const mineIds = new Set(tables.departments.filter((d) => d.coordinator_profile_id === me && d.is_active).map((d) => d.id))
          if (!myRoles.includes('coordinador_departamento')) return deny('No tenés permiso para crear usuarios.')
          if (!Array.isArray(body.roles) || body.roles.length !== 1 || body.roles[0] !== 'miembro_departamento') return deny('Como Coordinador de Departamento solo podés crear usuarios con el rol Miembro de Departamento.')
          if (body.station_id || body.scope) return deny('Un Miembro de Departamento no se asigna a un cuartel ni a una subsede.')
          if (ids.length === 0) return deny('Elegí el departamento del nuevo miembro.', 400)
          if (ids.some((id) => !mineIds.has(id))) return deny('Solo podés dar de alta miembros de los departamentos que coordinás.')
          if (tables.profiles.some((p) => p.email === String(body.email).toLowerCase())) return deny('Ya existe un usuario con ese email. Si es una persona que ya usa SIGER4, pedile a Informática y Estadística que la sume a tu departamento.', 409)
          const profile = { id: crypto.randomUUID(), auth_user_id: crypto.randomUUID(), full_name: body.full_name, email: String(body.email).toLowerCase(), avatar_url: null, rank: body.rank ?? null, phone: null, position: null, is_active: true, station_id: null, region_id: tables.profiles.find((p) => p.id === me)?.region_id ?? null }
          tables.profiles.push(profile)
          tables.user_roles.push({ id: crypto.randomUUID(), profile_id: profile.id, role: 'miembro_departamento', created_at: new Date().toISOString() })
          for (const id of ids) tables.department_members.push({ id: crypto.randomUUID(), department_id: id, profile_id: profile.id, created_at: new Date().toISOString() })
          return json({ profile })
        }
      }
      const created = { id: crypto.randomUUID(), auth_user_id: crypto.randomUUID(), full_name: body.full_name, email: body.email, avatar_url: null, rank: body.rank ?? null, phone: null, position: null, seniority_start_date: null, region_id: body.region_id ?? null, station_id: body.station_id ?? null, is_active: true, must_change_password: true, weekly_reminder_enabled: true, weekly_admin_summary_enabled: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      tables.profiles.push(created)
      return json({ profile: created })
    }
    if (path.startsWith('/functions/v1/')) return json({})
    return json([])
  })
}

