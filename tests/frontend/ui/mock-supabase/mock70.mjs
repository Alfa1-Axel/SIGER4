// Backend simulado de la tanda 70 (v1.14.0): edición con versión (0112),
// borradores (0113), fichas del mapa (0114) y verificaciones (0115).
// Es SOLO evidencia de pantalla: reproduce a mano lo que hacen las migraciones
// para que la interfaz tenga con qué hablar. La seguridad real se prueba contra
// una base de datos de verdad (test_0112..0115.sql).
import { PROF, REGION, ST } from './fixtures.mjs'

const COVERED = new Set([
  'department_reports', 'department_activity_reports', 'intervention_summaries', 'attendance_summaries', 'stations', 'departments',
  'vehicles', 'inventory_items', 'personnel', 'courses', 'calendar_events', 'station_history_events', 'school_avales_documents',
  'documents', 'document_folders', 'map_reference_points',
])
// Tablas que el mock de shoot.mjs ya sabe actualizar por su cuenta: acá solo se comprueba y sube la versión.
const SELF_HANDLED_PATCH = new Set(['documents', 'departments'])

const iso = (days = 0) => new Date(Date.now() + days * 86400000).toISOString()
const day = (days = 0) => iso(days).slice(0, 10)

export const PT = {
  aserradero: 'c1000000-0000-4000-8000-000000000001',
  escuela: 'c1000000-0000-4000-8000-000000000002',
  deposito: 'c1000000-0000-4000-8000-000000000003',
  hidrante: 'c1000000-0000-4000-8000-0000000000a1',
  cisterna: 'c1000000-0000-4000-8000-0000000000a2',
  reserva: 'c1000000-0000-4000-8000-0000000000a3',
  rio: 'c1000000-0000-4000-8000-0000000000f1',
}

export function addFixtures70(tables) {
  const base = { is_active: true, created_by_profile_id: PROF.admin, created_at: iso(-90), updated_at: iso(-30), row_version: 1, updated_by_profile_id: null, description: null, subsede_id: null }
  const point = (id, name, type, subtype, lat, lng, extra = {}) => ({ ...base, id, name, type, subtype, latitude: lat, longitude: lng, region_id: REGION, station_id: null, ...extra })
  tables.map_reference_points = [
    ...(tables.map_reference_points ?? []).map((p) => ({ row_version: 1, updated_by_profile_id: null, subtype: null, ...p })),
    point(PT.aserradero, 'Aserradero Villa', 'lugar_relevante', 'industria', -31.56, -63.5, { station_id: ST[0] }),
    point(PT.escuela, 'Escuela N° 7 de Luque', 'lugar_relevante', 'escuela', -31.7, -63.38, { station_id: ST[2] }),
    point(PT.deposito, 'Depósito regional', 'lugar_relevante', 'deposito', -31.6, -63.4),
    point(PT.hidrante, 'Hidrante Plaza San Martín', 'abastecimiento', 'hidrante', -31.57, -63.51, { station_id: ST[0] }),
    point(PT.cisterna, 'Cisterna Municipal Luque', 'abastecimiento', 'cisterna', -31.71, -63.39, { station_id: ST[2] }),
    point(PT.reserva, 'Reserva general', 'abastecimiento', 'reserva', -31.8, -63.6, { region_id: null }),
    point(PT.rio, 'Río Primero (tramo)', 'rio', null, -31.65, -63.45, { station_id: ST[0] }),
  ]
  tables.map_point_sheets = [
    {
      point_id: PT.aserradero, address: 'Ruta 5 km 3', locality: 'Villa del Rosario', responsible_entity: 'Aserradero SA', institutional_contact: '03573 555 000',
      access_notes: 'Portón sur', observations: 'Acopio de madera a cielo abierto.', documented_risks: 'Acopio de madera', characteristics: [{ label: 'Superficie', value: '2', unit: 'ha', source: 'Plano municipal' }],
      review_every_days: null, surveyed_on: '2026-06-10', surveyed_by_name: 'Cabo Pérez', surveyed_by_profile_id: PROF.jefe,
      last_reviewed_at: iso(-45), last_reviewed_by_profile_id: PROF.admin, created_at: iso(-60), updated_at: iso(-45), row_version: 2, updated_by_profile_id: PROF.admin,
    },
    {
      point_id: PT.hidrante, address: 'Plaza San Martín, esquina noreste', locality: 'Villa del Rosario', responsible_entity: 'Cooperativa de Aguas', institutional_contact: null,
      access_notes: null, observations: null, documented_risks: null, characteristics: [], review_every_days: 30, surveyed_on: '2026-08-01', surveyed_by_name: null, surveyed_by_profile_id: null,
      last_reviewed_at: iso(-40), last_reviewed_by_profile_id: PROF.admin, created_at: iso(-60), updated_at: iso(-40), row_version: 1, updated_by_profile_id: PROF.admin,
    },
  ]
  tables.map_point_sheet_private = [
    { point_id: PT.aserradero, personal_contacts: 'Juan Gómez (encargado) 351 555 1234', sensitive_notes: 'Llave del portón en la garita.', created_at: iso(-30), updated_at: iso(-30), row_version: 1, updated_by_profile_id: PROF.admin },
  ]
  tables.map_point_sheet_history = [
    { id: 2, point_id: PT.aserradero, version: 2, change_kind: 'edicion', changed_by_profile_id: PROF.admin, changed_at: iso(-45), snapshot: { address: 'Ruta 5 km 3', observations: 'Acopio de madera a cielo abierto.' } },
    { id: 1, point_id: PT.aserradero, version: 1, change_kind: 'alta', changed_by_profile_id: PROF.admin, changed_at: iso(-60), snapshot: { address: 'Ruta 5', observations: null } },
  ]
  tables.map_point_sheet_proposals = [
    {
      id: 'e1000000-0000-4000-8000-000000000001', point_id: PT.aserradero, proposed_by_profile_id: PROF.jefe, proposed_by_name: 'Ramiro Quinteros', proposed_at: iso(-3), base_version: 2,
      payload: { access_notes: 'Portón norte, no el sur' }, note: 'Lo vimos en la visita del sábado', status: 'pendiente', reviewed_by_profile_id: null, reviewed_by_name: null, reviewed_at: null, review_note: null,
    },
  ]
  tables.map_point_files = [
    { id: 'f1000000-0000-4000-8000-000000000001', point_id: PT.aserradero, verification_id: null, storage_path: `${PT.aserradero}/f1000000-0000-4000-8000-000000000001-frente.jpg`, file_name: 'frente.jpg', mime_type: 'image/jpeg', file_size: 120000, file_kind: 'foto', visibility: 'compartido', status: 'validado', caption: 'Frente del aserradero', uploaded_by_profile_id: PROF.admin, created_at: iso(-40) },
    { id: 'f1000000-0000-4000-8000-000000000002', point_id: PT.aserradero, verification_id: null, storage_path: `${PT.aserradero}/f1000000-0000-4000-8000-000000000002-plano.pdf`, file_name: 'plano.pdf', mime_type: 'application/pdf', file_size: 560000, file_kind: 'plano', visibility: 'reservado', status: 'validado', caption: 'Plano de acceso', uploaded_by_profile_id: PROF.admin, created_at: iso(-39) },
    { id: 'f1000000-0000-4000-8000-000000000003', point_id: PT.aserradero, verification_id: null, storage_path: `${PT.aserradero}/f1000000-0000-4000-8000-000000000003-galpon.jpg`, file_name: 'galpon.jpg', mime_type: 'image/jpeg', file_size: 90000, file_kind: 'foto', visibility: 'compartido', status: 'pendiente', caption: 'Galpón nuevo', uploaded_by_profile_id: PROF.jefe, created_at: iso(-2) },
  ]
  tables.map_point_verifications = [
    { id: '91000000-0000-4000-8000-000000000001', point_id: PT.hidrante, verified_on: day(-40), verified_by_profile_id: PROF.jefe, verified_by_name: 'Ramiro Quinteros', result: 'sin_problemas_informados', problems: null, notes: 'Se abrió y salió agua.', follow_up: null, follow_up_status: null, follow_up_resolved_on: null, follow_up_resolved_by_name: null, follow_up_resolution: null, created_at: iso(-40) },
  ]
  tables.form_drafts = []
  // Con la migración 0112 todo registro de estas tablas tiene versión.
  for (const t of COVERED) tables[t] = (tables[t] ?? []).map((r) => ({ row_version: 1, updated_by_profile_id: null, ...r }))
}

export function createMock70({ tables, opts, applyFilters }) {
  // Los borradores se simulan siempre (todas las pantallas con formulario los usan); el resto, solo con v70.
  const full = Boolean(opts.v70)
  const who = () => opts.who ?? 'admin'
  const me = () => PROF[who()]
  const rolesOf = () => tables.user_roles.filter((r) => r.profile_id === me()).map((r) => r.role)
  const isAdmin = () => rolesOf().some((r) => r === 'informatica_r4' || r === 'integrante_informatica')
  const isRegional = () => rolesOf().includes('secretario_regional')
  const isStationWriter = () => rolesOf().some((r) => ['usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo'].includes(r))
  const profile = () => tables.profiles.find((p) => p.id === me())
  const myStations = () => new Set([profile()?.station_id, ...tables.user_scopes.filter((s) => s.profile_id === me()).map((s) => s.station_id)].filter(Boolean))
  const myRegions = () => new Set([profile()?.region_id, ...tables.user_scopes.filter((s) => s.profile_id === me()).map((s) => s.region_id)].filter(Boolean))
  const deptOnly = () => {
    const roles = rolesOf()
    return roles.length > 0 && roles.every((r) => r === 'coordinador_departamento' || r === 'miembro_departamento')
  }

  const pointById = (id) => tables.map_reference_points.find((p) => p.id === id)
  const canSeePoint = (p) => isAdmin() || (!p.region_id && !p.subsede_id && !p.station_id) || (p.region_id && myRegions().has(p.region_id)) || (p.station_id && myStations().has(p.station_id))
  const canValidate = (p) => Boolean(p) && (isAdmin() || (isRegional() && p.region_id && myRegions().has(p.region_id)))
  const canPropose = (p) => Boolean(p) && p.is_active && (canValidate(p) || (isStationWriter() && p.station_id && myStations().has(p.station_id)))
  const canPrivate = (p) =>
    Boolean(p) && (canValidate(p) || (p.station_id && myStations().has(p.station_id) && rolesOf().some((r) => ['presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel'].includes(r))))

  const rpcLog = []
  const err = (code, message, status = 400, hint = null) => ({ body: { code, message, details: null, hint }, status })
  const wantsObject = (request) => (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const respondRows = (json, request, rows, method = 'GET') => {
    if (wantsObject(request)) {
      if (!rows[0]) return json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406)
      return json(rows[0], method === 'POST' ? 201 : 200)
    }
    return json(rows, method === 'POST' ? 201 : 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
  }

  function supplyStatusRow(p) {
    const verifs = tables.map_point_verifications.filter((v) => v.point_id === p.id).sort((a, b) => (b.verified_on + b.created_at).localeCompare(a.verified_on + a.created_at))
    const lv = verifs[0] ?? null
    const sheet = tables.map_point_sheets.find((s) => s.point_id === p.id)
    const days = sheet?.review_every_days ?? null
    const dueOn = days && lv ? new Date(new Date(`${lv.verified_on}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10) : null
    let status
    if (!lv || lv.result === 'no_se_pudo_verificar') status = 'pendiente_verificar'
    else if (lv.result === 'problema_informado' && lv.follow_up_status !== 'resuelto') status = 'problema_informado'
    else if (lv.result === 'problema_informado') status = 'pendiente_revision'
    else if (days && dueOn < day(0)) status = 'pendiente_revision'
    else status = 'ultima_sin_problemas'
    return {
      point_id: p.id, last_verification_id: lv?.id ?? null, last_verified_on: lv?.verified_on ?? null, last_result: lv?.result ?? null, last_verified_by_name: lv?.verified_by_name ?? null,
      last_problems: lv?.problems ?? null, pending_followups: verifs.filter((v) => v.follow_up_status === 'pendiente').length, review_every_days: days, status, review_due_on: dueOn,
    }
  }

  function nameKey(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
  }

  function pendingItems() {
    if (deptOnly()) return []
    const out = []
    for (const p of tables.map_reference_points.filter((x) => x.type === 'abastecimiento' && x.is_active && canSeePoint(x))) {
      const st = supplyStatusRow(p)
      if (st.status === 'problema_informado' && canPropose(p)) {
        out.push({ item_key: `map_problem_${p.id}`, title: `Problema informado en un punto de abastecimiento: ${p.name}`, description: `Verificado el ${st.last_verified_on} por ${st.last_verified_by_name ?? 'una persona'}. El seguimiento sigue pendiente.`, priority: 'alta', module: 'Mapa Regional', link_path: `/mapa/puntos/${p.id}`, sort_key: st.last_verified_on })
      } else if (st.review_every_days && st.status === 'pendiente_revision' && st.last_result !== 'no_se_pudo_verificar' && st.review_due_on < day(0) && canPropose(p)) {
        out.push({ item_key: `map_review_${p.id}`, title: `Punto de abastecimiento pendiente de nueva revisión: ${p.name}`, description: `La última verificación fue el ${st.last_verified_on}. La regla cargada para este punto es revisarlo cada ${st.review_every_days} días.`, priority: 'media', module: 'Mapa Regional', link_path: `/mapa/puntos/${p.id}`, sort_key: st.review_due_on })
      }
    }
    const byPoint = new Map()
    for (const pr of tables.map_point_sheet_proposals.filter((x) => x.status === 'pendiente')) {
      const p = pointById(pr.point_id)
      if (!p || !canValidate(p)) continue
      byPoint.set(pr.point_id, (byPoint.get(pr.point_id) ?? 0) + 1)
    }
    for (const [pid, count] of byPoint) {
      const p = pointById(pid)
      out.push({ item_key: `map_proposals_${pid}`, title: `Cambios propuestos para validar: ${p.name}`, description: `${count} ${count === 1 ? 'propuesta de ficha espera' : 'propuestas de ficha esperan'} validación.`, priority: 'media', module: 'Mapa Regional', link_path: `/mapa/puntos/${pid}`, sort_key: iso(-1) })
    }
    return out
  }

  const SHEET_KEYS = ['address', 'locality', 'responsible_entity', 'institutional_contact', 'access_notes', 'observations', 'documented_risks', 'characteristics', 'review_every_days', 'surveyed_on', 'surveyed_by_name']

  function applySheet(pointId, payload, kind) {
    const now = iso(0)
    let sheet = tables.map_point_sheets.find((s) => s.point_id === pointId)
    if (!sheet) {
      sheet = { point_id: pointId, address: null, locality: null, responsible_entity: null, institutional_contact: null, access_notes: null, observations: null, documented_risks: null, characteristics: [], review_every_days: null, surveyed_on: null, surveyed_by_name: null, surveyed_by_profile_id: me(), created_at: now, row_version: 0 }
      tables.map_point_sheets.push(sheet)
    }
    for (const k of SHEET_KEYS) if (k in payload) sheet[k] = payload[k] === '' ? null : payload[k]
    sheet.row_version += 1
    sheet.updated_at = now
    sheet.updated_by_profile_id = me()
    sheet.last_reviewed_at = now
    sheet.last_reviewed_by_profile_id = me()
    const nextId = Math.max(0, ...tables.map_point_sheet_history.map((h) => h.id)) + 1
    tables.map_point_sheet_history.unshift({ id: nextId, point_id: pointId, version: sheet.row_version, change_kind: kind, changed_by_profile_id: me(), changed_at: now, snapshot: Object.fromEntries(SHEET_KEYS.map((k) => [k, sheet[k]])) })
    return sheet
  }

  // Otra persona guarda: lo usan las pruebas para simular una edición simultánea.
  function bump(table, id, patch, byProfile = PROF.admin, key = 'id') {
    const row = tables[table].find((r) => String(r[key]) === String(id))
    if (!row) throw new Error(`bump: no existe ${table}/${id}`)
    Object.assign(row, patch)
    row.row_version = (row.row_version ?? 1) + 1
    row.updated_by_profile_id = byProfile
    row.updated_at = iso(0)
    return row
  }

  // Devuelve true si atendió el pedido. bodyOverrides: cuerpo sin la versión para los PATCH que sigue atendiendo shoot.mjs.
  const inflight = []
  async function handle({ route, request, url, path, json: rawJson, bodyOverrides }) {
    // Cada respuesta se junta para esperarla antes de devolver el control a shoot.mjs.
    const json = (...args) => {
      inflight.push(rawJson(...args))
      return true
    }
    const method = request.method()
    if (full && path.startsWith('/storage/v1/object/map-point-files/') && method === 'POST') {
      tables.__mapUploads = [...(tables.__mapUploads ?? []), decodeURIComponent(path.split('/storage/v1/object/map-point-files/')[1])]
      return json({ Key: 'ok', Id: 'ok' }) && true
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      const send = (r) => {
        json(r.body, r.status)
        return true
      }
      if (fn === 'save_form_draft') {
        rpcLog.push({ fn, body })
        if (opts.draftSaveFails) return send(err('XX000', 'simulated failure', 500))
        if (opts.draftSaveExpired) return send(err('PGRST301', 'JWT expired', 401))
        if (opts.draftSaveDelayMs) await new Promise((r) => setTimeout(r, opts.draftSaveDelayMs))
        const key = (d) => d.profile_id === me() && d.form_key === body.p_form_key && d.context_key === (body.p_context_key ?? '')
        let row = tables.form_drafts.find(key)
        if (!row) {
          if ((body.p_expected_revision ?? 0) > 0) return send(err('P0409', 'Este borrador ya se publicó o se descartó en otra pestaña o dispositivo.', 400, 'gone'))
          row = { id: crypto.randomUUID(), profile_id: me(), form_key: body.p_form_key, context_key: body.p_context_key ?? '', record_id: body.p_record_id, base_version: body.p_base_version, client_record_id: body.p_client_record_id, payload: body.p_payload, revision: 1, created_at: iso(0), updated_at: iso(0), expires_at: iso(30) }
          tables.form_drafts.push(row)
        } else {
          if ((body.p_expected_revision ?? 0) !== row.revision) return send(err('P0409', 'Hay un borrador más nuevo de esta misma carga.', 400, 'newer'))
          Object.assign(row, { payload: body.p_payload, record_id: body.p_record_id, base_version: body.p_base_version, revision: row.revision + 1, updated_at: iso(0), expires_at: iso(30), client_record_id: body.p_client_record_id ?? row.client_record_id })
        }
        json([{ revision: row.revision, updated_at: row.updated_at }])
        return true
      }
      if (!full && fn !== 'save_form_draft') return false
      if (fn === 'can_validate_map_point') return json(canValidate(pointById(body.p_point_id))) && true
      if (fn === 'can_propose_map_point') return json(canPropose(pointById(body.p_point_id))) && true
      if (fn === 'can_view_private_map_point') return json(canPrivate(pointById(body.p_point_id))) && true
      if (fn === 'get_map_pending_items') {
        rpcLog.push({ fn, body })
        json(pendingItems())
        return true
      }
      if (fn === 'search_map_points') {
        const q = nameKey(body.p_query)
        const rows = tables.map_reference_points
          .filter((p) => p.is_active && canSeePoint(p))
          .map((p) => ({ p, s: tables.map_point_sheets.find((x) => x.point_id === p.id) }))
          .filter(({ p, s }) => String(body.p_query ?? '').trim().length >= 2 && [p.name, s?.locality, s?.address, p.subtype].some((v) => nameKey(v).includes(q)))
          .map(({ p, s }) => ({ id: p.id, name: p.name, type: p.type, subtype: p.subtype, locality: s?.locality ?? null }))
          .slice(0, body.p_limit ?? 8)
        json(rows)
        return true
      }
      if (fn === 'find_similar_map_points') {
        rpcLog.push({ fn, body })
        const wanted = nameKey(body.p_name)
        const rows = tables.map_reference_points
          .filter((p) => p.is_active && canSeePoint(p))
          .map((p) => {
            const key = nameKey(p.name)
            const dist = Math.round(111320 * Math.sqrt((p.latitude - body.p_latitude) ** 2 + ((p.longitude - body.p_longitude) * Math.cos((body.p_latitude * Math.PI) / 180)) ** 2))
            const same = key === wanted
            const similar = wanted && Math.min(key.length, wanted.length) >= 4 && (key.includes(wanted) || wanted.includes(key))
            return { id: p.id, name: p.name, type: p.type, subtype: p.subtype, distance_m: dist, match_reason: same ? 'mismo_nombre' : similar ? 'nombre_parecido' : 'muy_cerca', hit: same || similar || dist <= 150 }
          })
          .filter((r) => r.hit)
          .slice(0, 5)
          .map(({ hit: _h, ...r }) => r)
        json(rows)
        return true
      }
      if (fn === 'save_map_point_sheet') {
        rpcLog.push({ fn, body })
        const p = pointById(body.p_point_id)
        if (!canValidate(p)) return send(err('42501', 'No tenés permiso para guardar esta ficha.', 403))
        const sheet = tables.map_point_sheets.find((s) => s.point_id === body.p_point_id)
        if (sheet) {
          if ((body.p_expected_version ?? null) !== sheet.row_version) return send(err('P0409', 'La ficha fue actualizada por otra persona mientras la editabas.', 400, String(sheet.row_version)))
        } else if ((body.p_expected_version ?? 0) !== 0) return send(err('P0409', 'La ficha ya no existe.', 400, 'gone'))
        for (const k of Object.keys(body.p_payload ?? {})) if (!SHEET_KEYS.includes(k)) return send(err('22023', `La ficha no admite el campo "${k}".`))
        json([applySheet(body.p_point_id, body.p_payload, sheet ? 'edicion' : 'alta')])
        return true
      }
      if (fn === 'mark_map_point_sheet_reviewed') {
        rpcLog.push({ fn, body })
        const p = pointById(body.p_point_id)
        if (!canValidate(p)) return send(err('42501', 'No tenés permiso para validar esta ficha.', 403))
        const sheet = tables.map_point_sheets.find((s) => s.point_id === body.p_point_id)
        sheet.last_reviewed_at = iso(0)
        sheet.last_reviewed_by_profile_id = me()
        tables.map_point_sheet_history.unshift({ id: Math.max(0, ...tables.map_point_sheet_history.map((h) => h.id)) + 1, point_id: sheet.point_id, version: sheet.row_version, change_kind: 'revision', changed_by_profile_id: me(), changed_at: iso(0), snapshot: {} })
        json([sheet])
        return true
      }
      if (fn === 'save_map_point_sheet_private') {
        rpcLog.push({ fn, body })
        const p = pointById(body.p_point_id)
        if (!canPrivate(p)) return send(err('42501', 'No tenés permiso para cargar la parte reservada de esta ficha.', 403))
        let row = tables.map_point_sheet_private.find((r) => r.point_id === body.p_point_id)
        if (row) {
          if ((body.p_expected_version ?? null) !== row.row_version) return send(err('P0409', 'La parte reservada fue actualizada por otra persona.', 400, String(row.row_version)))
          Object.assign(row, body.p_payload, { row_version: row.row_version + 1, updated_by_profile_id: me(), updated_at: iso(0) })
        } else {
          row = { point_id: body.p_point_id, personal_contacts: null, sensitive_notes: null, ...body.p_payload, row_version: 1, updated_by_profile_id: me(), created_at: iso(0), updated_at: iso(0) }
          tables.map_point_sheet_private.push(row)
        }
        json([row])
        return true
      }
      if (fn === 'propose_map_point_sheet') {
        rpcLog.push({ fn, body })
        const p = pointById(body.p_point_id)
        if (!canPropose(p)) return send(err('42501', 'No tenés permiso para proponer cambios en este punto.', 403))
        for (const k of Object.keys(body.p_payload ?? {})) if (!SHEET_KEYS.includes(k)) return send(err('22023', `La ficha no admite el campo "${k}".`))
        const existing = tables.map_point_sheet_proposals.find((x) => x.id === body.p_id)
        if (existing) {
          json([existing])
          return true
        }
        for (const x of tables.map_point_sheet_proposals) if (x.point_id === body.p_point_id && x.proposed_by_profile_id === me() && x.status === 'pendiente') x.status = 'reemplazada'
        const row = { id: body.p_id ?? crypto.randomUUID(), point_id: body.p_point_id, proposed_by_profile_id: me(), proposed_by_name: profile()?.full_name ?? null, proposed_at: iso(0), base_version: body.p_base_version, payload: body.p_payload, note: body.p_note, status: 'pendiente', reviewed_by_profile_id: null, reviewed_by_name: null, reviewed_at: null, review_note: null }
        tables.map_point_sheet_proposals.unshift(row)
        json([row])
        return true
      }
      if (fn === 'review_map_point_proposal') {
        rpcLog.push({ fn, body })
        const prop = tables.map_point_sheet_proposals.find((x) => x.id === body.p_proposal_id)
        if (!prop) return send(err('P0001', 'No encontramos la propuesta.'))
        const p = pointById(prop.point_id)
        if (!canValidate(p)) return send(err('42501', 'No tenés permiso para validar los cambios de este punto.', 403))
        if (prop.status !== 'pendiente') return send(err('P0001', 'Esta propuesta ya se resolvió.'))
        if (body.p_accept) {
          const sheet = tables.map_point_sheets.find((s) => s.point_id === prop.point_id)
          if (sheet && (body.p_expected_sheet_version ?? null) !== sheet.row_version) return send(err('P0409', 'La ficha cambió desde que viste esta propuesta.', 400, String(sheet.row_version)))
          applySheet(prop.point_id, prop.payload, 'propuesta_aceptada')
        }
        Object.assign(prop, { status: body.p_accept ? 'aceptada' : 'rechazada', reviewed_by_profile_id: me(), reviewed_by_name: profile()?.full_name ?? null, reviewed_at: iso(0), review_note: body.p_note })
        json([prop])
        return true
      }
      if (fn === 'resolve_map_point_followup') {
        rpcLog.push({ fn, body })
        const v = tables.map_point_verifications.find((x) => x.id === body.p_verification_id)
        if (!v) return send(err('P0001', 'No encontramos la verificación.'))
        if (!canPropose(pointById(v.point_id))) return send(err('42501', 'No tenés permiso para resolver el seguimiento de este punto.', 403))
        if (v.follow_up_status !== 'pendiente') return send(err('P0001', 'Esta verificación no tiene un seguimiento pendiente.'))
        Object.assign(v, { follow_up_status: 'resuelto', follow_up_resolved_on: day(0), follow_up_resolved_by_name: profile()?.full_name ?? null, follow_up_resolution: body.p_resolution })
        json([v])
        return true
      }
      return false
    }

    if (!path.startsWith('/rest/v1/')) return false
    const table = path.split('/')[3]

    // ---- edición con versión: PATCH de las tablas cubiertas ----
    if (full && method === 'PATCH' && COVERED.has(table)) {
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      if (tables.__denyPatch?.has(table)) return respondRows(json, request, []) && true
      const rows = applyFilters(tables[table] ?? [], url.searchParams)
      const expected = body.row_version
      const { row_version: _v, updated_by_profile_id: _u, ...rest } = body
      for (const row of rows) {
        if (expected !== undefined && expected !== row.row_version) {
          json({ code: 'P0409', message: 'El registro fue actualizado por otra persona mientras lo editabas.', details: `row_version vigente: ${row.row_version}`, hint: String(row.row_version) }, 400)
          return true
        }
      }
      if (SELF_HANDLED_PATCH.has(table)) {
        // shoot.mjs aplica el cambio; acá solo se sube la versión y se le saca la versión al cuerpo.
        bodyOverrides.set(request, rest)
        for (const row of rows) {
          row.row_version = (row.row_version ?? 1) + 1
          row.updated_by_profile_id = me()
        }
        return false
      }
      const changed = []
      for (const row of rows) {
        const before = JSON.stringify(rest)
        Object.assign(row, rest)
        row.row_version = (row.row_version ?? 1) + 1
        row.updated_by_profile_id = me()
        row.updated_at = iso(0)
        void before
        changed.push(row)
      }
      return respondRows(json, request, changed) && true
    }

    // ---- tablas nuevas ----
    if (table === 'form_drafts') {
      const mine = tables.form_drafts.filter((d) => d.profile_id === me())
      if (method === 'DELETE') {
        const gone = applyFilters(mine, url.searchParams)
        tables.form_drafts = tables.form_drafts.filter((d) => !gone.includes(d))
        json([], 200)
        return true
      }
      if (method === 'GET') return respondRows(json, request, applyFilters(mine, url.searchParams)) && true
      return false
    }
    if (!full) return false
    if (method === 'POST' && table === 'department_reports') {
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      if (body.id && tables.department_reports.some((r) => r.id === body.id)) {
        json({ code: '23505', message: 'duplicate key value violates unique constraint "department_reports_pkey"', details: null, hint: null }, 409)
        return true
      }
      if (opts.loseFirstResponse === 'department_reports' && !tables.__lostOnce) {
        // El servidor guarda, pero la respuesta no llega: el cliente ve un corte de red.
        tables.__lostOnce = true
        const now = iso(0)
        tables.department_reports.push({ created_by_profile_id: me(), created_by_name: profile()?.full_name ?? null, is_archived: false, archived_at: null, archived_by_profile_id: null, created_at: now, updated_at: now, row_version: 1, updated_by_profile_id: me(), ...body })
        await route.abort('failed')
        return true
      }
      return false
    }
    if (table === 'map_reference_points' && method === 'GET' && opts.mapRls) {
      return respondRows(json, request, applyFilters(tables.map_reference_points.filter(canSeePoint), url.searchParams)) && true
    }
    if (table === 'map_point_sheets' && method === 'GET') {
      return respondRows(json, request, applyFilters(tables.map_point_sheets.filter((s) => canSeePoint(pointById(s.point_id))), url.searchParams)) && true
    }
    if (table === 'map_point_sheet_private' && method === 'GET') {
      return respondRows(json, request, applyFilters(tables.map_point_sheet_private.filter((s) => canPrivate(pointById(s.point_id))), url.searchParams)) && true
    }
    if (table === 'map_point_sheet_history' && method === 'GET') {
      return respondRows(json, request, applyFilters(tables.map_point_sheet_history.filter((s) => canSeePoint(pointById(s.point_id))), url.searchParams)) && true
    }
    if (table === 'map_point_sheet_proposals' && method === 'GET') {
      return respondRows(json, request, applyFilters(tables.map_point_sheet_proposals.filter((x) => canValidate(pointById(x.point_id)) || x.proposed_by_profile_id === me()), url.searchParams)) && true
    }
    if (table === 'map_point_files') {
      const visible = (f) => {
        const p = pointById(f.point_id)
        if (!p || !canSeePoint(p)) return false
        if (f.uploaded_by_profile_id === me() || canValidate(p)) return true
        if (f.visibility === 'compartido') return f.status === 'validado'
        return f.status === 'validado' && canPrivate(p)
      }
      if (method === 'GET') return respondRows(json, request, applyFilters(tables.map_point_files.filter(visible), url.searchParams)) && true
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      if (method === 'POST') {
        const p = pointById(body.point_id)
        if (!canPropose(p)) return json({ code: '42501', message: 'No tenés permiso para cargar archivos en este punto.', details: null, hint: null }, 403) && true
        const row = { ...body, status: canValidate(p) || body.verification_id ? 'validado' : 'pendiente', uploaded_by_profile_id: me(), created_at: iso(0), caption: body.caption ?? null }
        tables.map_point_files.push(row)
        return respondRows(json, request, [row], 'POST') && true
      }
      if (method === 'PATCH') {
        const rows = applyFilters(tables.map_point_files.filter(visible), url.searchParams).filter((f) => canValidate(pointById(f.point_id)))
        for (const r of rows) Object.assign(r, body)
        return respondRows(json, request, rows) && true
      }
      if (method === 'DELETE') {
        const rows = applyFilters(tables.map_point_files.filter(visible), url.searchParams).filter((f) => canValidate(pointById(f.point_id)) || (f.uploaded_by_profile_id === me() && f.status === 'pendiente'))
        tables.map_point_files = tables.map_point_files.filter((f) => !rows.includes(f))
        return respondRows(json, request, rows.map((r) => ({ id: r.id }))) && true
      }
    }
    if (table === 'map_point_verifications') {
      if (method === 'GET') return respondRows(json, request, applyFilters(tables.map_point_verifications.filter((v) => canSeePoint(pointById(v.point_id))), url.searchParams)) && true
      if (method === 'POST') {
        let body = {}
        try {
          body = request.postDataJSON() ?? {}
        } catch {}
        const p = pointById(body.point_id)
        if (!canPropose(p)) return json({ code: '42501', message: 'new row violates row-level security policy for table "map_point_verifications"', details: null, hint: null }, 403) && true
        if (tables.map_point_verifications.some((v) => v.id === body.id)) return json({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }, 409) && true
        const row = {
          follow_up_resolved_on: null, follow_up_resolved_by_name: null, follow_up_resolution: null, ...body,
          verified_by_profile_id: me(), verified_by_name: profile()?.full_name ?? null, created_at: iso(0),
          follow_up_status: body.result === 'problema_informado' || body.follow_up ? 'pendiente' : null,
        }
        tables.map_point_verifications.push(row)
        return respondRows(json, request, [row], 'POST') && true
      }
    }
    if (table === 'map_supply_point_status' && method === 'GET') {
      const rows = tables.map_reference_points.filter((p) => p.type === 'abastecimiento' && p.is_active && canSeePoint(p)).map(supplyStatusRow)
      return respondRows(json, request, applyFilters(rows, url.searchParams)) && true
    }
    return false
  }

  return { handle, flush: () => Promise.all(inflight.splice(0)), bump, rpcLog, helpers: { canValidate, canPropose, canPrivate, canSeePoint, supplyStatusRow, pointById } }
}
