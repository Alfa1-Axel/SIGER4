// Backend simulado de la tanda 71 (v1.15.0): Avales con carga amplia, gestión solo de la autoridad
// del área, renovación, motivo obligatorio y movimientos (migración 0117).
// Es SOLO evidencia de pantalla: reproduce a mano lo que hacen la RLS y las funciones para que la
// interfaz tenga con qué hablar. La seguridad real se prueba contra una base de datos de verdad
// (test_0117.sql y upgrade_0117.sh).
import { DEP, PROF } from './fixtures.mjs'

const iso = (days = 0) => new Date(Date.now() + days * 86400000).toISOString()

export const AV = {
  mfuego: 'e1000000-0000-4000-8000-000000000001',
  carga: 'e1000000-0000-4000-8000-000000000002',
  juan: 'e1000000-0000-4000-8000-000000000003',
  mfor: 'e1000000-0000-4000-8000-000000000004',
  archivado: 'e1000000-0000-4000-8000-000000000005',
  viejo: 'e1000000-0000-4000-8000-000000000006',
  jefeFuego: 'e1000000-0000-4000-8000-000000000007',
}

export const LONG_TITLE =
  'Aval de continuidad en el Departamento de Forestal para la temporada de incendios 2026-2027 (versión final firmada por la comisión directiva)'

const UPLOAD_ROLES = [
  'informatica_r4', 'integrante_informatica', 'director_escuela', 'instructor', 'coordinador_escuela', 'secretario_escuela',
  'secretario_regional', 'coordinador_departamento', 'miembro_departamento', 'jefe_cuerpo_activo', 'usuario_carga_cuartel',
]

function nameKey(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
}

export function addFixtures71(tables) {
  const dep = (id) => id
  const row = (id, department, extra) => ({
    id,
    department_id: dep(department),
    title: 'Aval',
    description: null,
    observations: null,
    storage_bucket: 'school-avales',
    storage_path: `${department}/${id}/aval.pdf`,
    file_name: 'aval.pdf',
    mime_type: 'application/pdf',
    file_size: 482133,
    uploaded_by_profile_id: null,
    uploaded_by_name: null,
    person_profile_id: null,
    person_name: null,
    reference_year: 2026,
    renewal_key: null,
    renewed_at: null,
    renewed_by_profile_id: null,
    renewed_by_name: null,
    renewal_count: 0,
    is_archived: false,
    archived_at: null,
    archived_by_profile_id: null,
    archive_reason: null,
    created_at: iso(-20),
    updated_at: iso(-20),
    row_version: 1,
    updated_by_profile_id: null,
    ...extra,
  })
  const name = (p) => tables.profiles.find((x) => x.id === p)?.full_name ?? null
  tables.school_avales_documents = [
    row(AV.mfuego, DEP.fuego, { title: 'Aval Fuego 2026', file_name: 'aval-fuego-2026.pdf', uploaded_by_profile_id: PROF.mfuego, uploaded_by_name: name(PROF.mfuego), person_profile_id: PROF.mfuego, person_name: name(PROF.mfuego), renewal_key: `p:${PROF.mfuego}`, created_at: iso(-30) }),
    row(AV.carga, DEP.fuego, {
      title: 'Aval Fuego 2025', file_name: 'aval-fuego-2025.pdf', uploaded_by_profile_id: PROF.exm, uploaded_by_name: name(PROF.exm), person_profile_id: PROF.exm, person_name: name(PROF.exm), renewal_key: `p:${PROF.exm}`,
      reference_year: 2025, renewed_at: iso(-5), renewed_by_profile_id: PROF.fuego, renewed_by_name: name(PROF.fuego), renewal_count: 2, created_at: iso(-200), row_version: 3,
    }),
    row(AV.juan, DEP.fuego, { title: 'Aval Fuego 2026 · Juan Pérez', file_name: 'juan-perez.pdf', uploaded_by_profile_id: PROF.fuego, uploaded_by_name: name(PROF.fuego), person_name: 'Juan Pérez', renewal_key: 'n:juanperez', created_at: iso(-10) }),
    row(AV.mfor, DEP.forestal, { title: LONG_TITLE, file_name: 'Aval_continuidad_Forestal_temporada_2026_2027_version_final_firmada_por_la_comision_directiva.pdf', uploaded_by_profile_id: PROF.mfor, uploaded_by_name: name(PROF.mfor), person_profile_id: PROF.mfor, person_name: name(PROF.mfor), renewal_key: `p:${PROF.mfor}`, created_at: iso(-15) }),
    row(AV.archivado, DEP.fasme, { title: 'Aval FASME 2026', file_name: 'aval-fasme.pdf', uploaded_by_profile_id: PROF.mfor, uploaded_by_name: name(PROF.mfor), person_profile_id: PROF.mfor, person_name: name(PROF.mfor), renewal_key: `p:${PROF.mfor}`, is_archived: true, archived_at: iso(-2), archived_by_profile_id: PROF.admin, archive_reason: 'Dejó de pertenecer al departamento', created_at: iso(-60) }),
    row(AV.viejo, DEP.fuego, { title: 'Aval curso Incendios Estructurales Nivel I', file_name: 'aval-incendios-estructurales.pdf', uploaded_by_profile_id: PROF.fuego, uploaded_by_name: name(PROF.fuego), reference_year: null, created_at: iso(-300) }),
    row(AV.jefeFuego, DEP.fuego, { title: 'Aval Fuego 2026 · jefe', file_name: 'aval-jefe.pdf', uploaded_by_profile_id: PROF.jefe, uploaded_by_name: name(PROF.jefe), person_profile_id: PROF.jefe, person_name: name(PROF.jefe), renewal_key: `p:${PROF.jefe}`, created_at: iso(-8) }),
  ]
  let n = 0
  const mv = (action, avalId, extra) => {
    const a = tables.school_avales_documents.find((r) => r.id === avalId)
    n += 1
    return {
      id: `a1000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
      created_at: iso(-n),
      action,
      department_id: a.department_id,
      record_id: a.id,
      aval_title: a.title,
      person_name: a.person_name,
      file_name: a.file_name,
      previous_file_name: null,
      reference_year: a.reference_year,
      changed_fields: null,
      reason: null,
      actor_name: a.uploaded_by_name,
      ...extra,
    }
  }
  tables.avales_audit = [
    mv('archive', AV.archivado, { actor_name: name(PROF.admin), reason: 'Dejó de pertenecer al departamento' }),
    mv('renew', AV.carga, { actor_name: name(PROF.fuego), previous_file_name: 'aval-fuego-2024.pdf' }),
    mv('insert', AV.mfuego),
    mv('insert', AV.mfor),
    mv('update', AV.juan, { actor_name: name(PROF.fuego), changed_fields: ['observations', 'reference_year'] }),
  ]
  tables.__avalFiles = tables.school_avales_documents.map((r) => r.storage_path)
}

export function createMock71({ tables, opts, applyFilters }) {
  const who = () => opts.who ?? 'admin'
  const me = () => PROF[who()]
  const rolesOf = () => tables.user_roles.filter((r) => r.profile_id === me()).map((r) => r.role)
  const isSuper = () => rolesOf().includes('informatica_r4')
  const isInformatica = () => rolesOf().some((r) => r === 'informatica_r4' || r === 'integrante_informatica')
  const isCoordEsc = () => rolesOf().includes('coordinador_escuela')
  const canLoad = () => rolesOf().some((r) => UPLOAD_ROLES.includes(r))
  const dep = (id) => tables.departments.find((d) => d.id === id)
  const coordinates = (id) => dep(id)?.coordinator_profile_id === me() && (rolesOf().includes('coordinador_departamento') || isInformatica())
  const isMemberOrCoord = (id) =>
    coordinates(id) || (tables.department_members.some((m) => m.department_id === id && m.profile_id === me()) && (rolesOf().includes('miembro_departamento') || isInformatica()))
  const canManageDept = (id) => isSuper() || isCoordEsc() || coordinates(id)
  const canViewDept = (id) => isInformatica() || isCoordEsc() || coordinates(id)
  const canAudit = (id) => isSuper() || isCoordEsc() || coordinates(id)
  const mine = (r) => r.person_profile_id === me() || r.uploaded_by_profile_id === me()
  const visible = (r) => canManageDept(r.department_id) || (!r.is_archived && canViewDept(r.department_id)) || (!r.is_archived && mine(r))
  const myName = () => tables.profiles.find((p) => p.id === me())?.full_name ?? null
  const calls = []

  const inflight = []
  const err = (code, message, status = 400) => ({ body: { code, message, details: null, hint: null }, status })
  const wantsObject = (request) => (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')

  function logMovement(action, a, extra = {}) {
    tables.avales_audit.unshift({
      id: crypto.randomUUID(),
      created_at: iso(0),
      action,
      department_id: a.department_id,
      record_id: a.id,
      aval_title: a.title,
      person_name: a.person_name,
      file_name: a.file_name,
      previous_file_name: null,
      reference_year: a.reference_year,
      changed_fields: null,
      reason: null,
      actor_name: myName(),
      ...extra,
    })
  }

  async function handle({ request, url, path, json: rawJson }) {
    const json = (...args) => {
      inflight.push(rawJson(...args))
      return true
    }
    const send = (r) => json(r.body, r.status)
    const method = request.method()

    if (path.startsWith('/storage/v1/object/school-avales') && method === 'POST') {
      const p = decodeURIComponent(path.replace('/storage/v1/object/school-avales/', ''))
      if (opts.avalUploadFails) return send(err('XX000', 'upload failed', 500))
      tables.__avalFiles.push(p)
      calls.push({ kind: 'upload', path: p })
      return json({ Key: `school-avales/${p}`, Id: crypto.randomUUID() })
    }
    if (path === '/storage/v1/object/school-avales' && method === 'DELETE') {
      let body = {}
      try {
        body = request.postDataJSON() ?? {}
      } catch {}
      const removed = []
      for (const p of body.prefixes ?? []) {
        // Un archivo registrado no se borra por la API (0117).
        if (tables.school_avales_documents.some((r) => r.storage_path === p)) continue
        const i = tables.__avalFiles.indexOf(p)
        if (i >= 0) {
          tables.__avalFiles.splice(i, 1)
          removed.push({ name: p })
        }
      }
      calls.push({ kind: 'remove', paths: body.prefixes })
      return json(removed)
    }

    if (path === '/rest/v1/school_avales_documents') {
      if (method === 'GET') {
        const rows = applyFilters(tables.school_avales_documents.filter(visible), url.searchParams)
        const order = url.searchParams.get('order')
        if (order?.startsWith('created_at.desc')) rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
        const prefer = request.headers()['prefer'] ?? ''
        if (request.method() === 'GET' && (request.headers()['range-unit'] || prefer.includes('count=exact'))) {
          return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
        }
        if (wantsObject(request)) return rows[0] ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406)
        return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
      }
      if (method === 'HEAD') {
        const rows = applyFilters(tables.school_avales_documents.filter(visible), url.searchParams)
        return rawJson([], 200, { 'content-range': `*/${rows.length}` }) && true
      }
      if (method === 'POST') {
        const body = request.postDataJSON()
        const input = Array.isArray(body) ? body[0] : body
        if (!canLoad() || !tables.departments.find((d) => d.id === input.department_id && d.is_active)) {
          return send(err('42501', 'new row violates row-level security policy for table "school_avales_documents"', 403))
        }
        const authority = canManageDept(input.department_id)
        let personProfile = null
        let personName = null
        if (!authority) personProfile = me()
        else if (input.person_name && String(input.person_name).trim()) personName = String(input.person_name).trim()
        else personProfile = me()
        if (personProfile) personName = myName()
        const key = personProfile ? `p:${personProfile}` : `n:${nameKey(personName)}`
        if (key === 'n:') return send(err('23514', 'Escribí el nombre de la persona del aval (con letras o números).', 400))
        if (tables.school_avales_documents.some((r) => !r.is_archived && r.department_id === input.department_id && r.renewal_key === key)) {
          return send(err('23505', 'duplicate key value violates unique constraint "idx_school_avales_vigente_unico"', 409))
        }
        const created = {
          description: null, observations: null, storage_bucket: 'school-avales', person_profile_id: personProfile, person_name: personName,
          renewal_key: key, renewed_at: null, renewed_by_profile_id: null, renewed_by_name: null, renewal_count: 0, is_archived: false,
          archived_at: null, archived_by_profile_id: null, archive_reason: null, row_version: 1, updated_by_profile_id: me(),
          ...input, uploaded_by_profile_id: me(), uploaded_by_name: myName(), created_at: iso(0), updated_at: iso(0),
        }
        tables.school_avales_documents.unshift(created)
        logMovement('insert', created)
        calls.push({ kind: 'insert', row: created })
        return json(wantsObject(request) ? created : [created], 201)
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON() ?? {}
        const targets = applyFilters(tables.school_avales_documents.filter((r) => canManageDept(r.department_id)), url.searchParams)
        const target = targets[0]
        if (!target) return wantsObject(request) ? json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406) : json([])
        if ('row_version' in body && body.row_version !== target.row_version) {
          return send(err('P0409', 'El registro fue actualizado por otra persona mientras lo editabas.', 409))
        }
        const changed = []
        for (const k of ['title', 'description', 'observations', 'department_id', 'reference_year', 'person_name']) {
          if (k in body && body[k] !== target[k]) changed.push(k)
        }
        const patch = { ...body }
        delete patch.row_version
        Object.assign(target, patch, { row_version: target.row_version + 1, updated_at: iso(0), updated_by_profile_id: me() })
        logMovement('update', target, { changed_fields: changed })
        calls.push({ kind: 'update', id: target.id, patch })
        return json(wantsObject(request) ? target : [target])
      }
      if (method === 'DELETE') {
        // Nadie borra por la API directa (0117): permiso denegado.
        return send(err('42501', 'permission denied for table school_avales_documents', 403))
      }
    }

    if (!path.startsWith('/rest/v1/rpc/')) return false
    const fn = path.split('/').pop()
    let body = {}
    try {
      body = request.postDataJSON() ?? {}
    } catch {}

    if (fn === 'list_school_avales_departments') {
      const rows = tables.departments
        .filter((d) => canViewDept(d.id) || (d.is_active && canLoad()))
        .map((d) => {
          const view = canViewDept(d.id)
          return {
            id: d.id,
            name: d.name,
            description: view ? d.description : null,
            is_active: d.is_active,
            coordinator_profile_id: view ? d.coordinator_profile_id : null,
            coordinator_name: view ? tables.profiles.find((p) => p.id === d.coordinator_profile_id)?.full_name ?? null : null,
            is_my_department: isMemberOrCoord(d.id),
            can_manage: canManageDept(d.id),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      return json(rows)
    }

    if (fn === 'find_school_aval_to_renew') {
      const key = body.p_person_name && String(body.p_person_name).trim() ? `n:${nameKey(body.p_person_name)}` : `p:${me()}`
      const found = tables.school_avales_documents.filter(visible).find((r) => !r.is_archived && r.department_id === body.p_department_id && r.renewal_key === key)
      return json(found ? [found] : [])
    }

    if (fn === 'list_school_aval_movements') {
      let rows = tables.avales_audit.filter((m) => canAudit(m.department_id))
      if (body.p_department_id) rows = rows.filter((m) => m.department_id === body.p_department_id)
      rows = rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Math.min(Math.max(body.p_limit ?? 200, 1), 500))
      return json(rows.map((m) => ({ ...m, department_name: dep(m.department_id)?.name ?? null })))
    }

    const find = () => {
      const r = tables.school_avales_documents.find((x) => x.id === body.p_id)
      return r
    }
    const reasonOf = () => String(body.p_reason ?? '').trim()
    const versionCheck = (r) => body.p_expected_version != null && body.p_expected_version !== r.row_version

    if (fn === 'archive_school_aval') {
      calls.push({ kind: 'rpc', fn, body })
      const r = find()
      if (!r || !canManageDept(r.department_id)) return send(err('42501', 'No tenés permiso para archivar este aval.', 403))
      if (r.is_archived) return send(err('22023', 'Este aval ya está archivado.'))
      if (reasonOf().length < 3) return send(err('23514', 'Escribí el motivo del archivado (al menos 3 letras).'))
      if (versionCheck(r)) return send(err('P0409', 'El registro fue actualizado por otra persona mientras lo editabas.', 409))
      Object.assign(r, { is_archived: true, archived_at: iso(0), archived_by_profile_id: me(), archive_reason: reasonOf(), row_version: r.row_version + 1 })
      logMovement('archive', r, { reason: reasonOf() })
      return json(r)
    }
    if (fn === 'restore_school_aval') {
      calls.push({ kind: 'rpc', fn, body })
      const r = find()
      if (!r || !canManageDept(r.department_id)) return send(err('42501', 'No tenés permiso para volver a activar este aval.', 403))
      if (!r.is_archived) return send(err('22023', 'Este aval no está archivado.'))
      if (r.renewal_key && tables.school_avales_documents.some((x) => x.id !== r.id && !x.is_archived && x.department_id === r.department_id && x.renewal_key === r.renewal_key)) {
        return send(err('23505', 'Ya hay otro aval vigente de la misma persona en este departamento: no se puede volver a activar este.', 409))
      }
      Object.assign(r, { is_archived: false, archived_at: null, archived_by_profile_id: null, archive_reason: null, row_version: r.row_version + 1 })
      logMovement('unarchive', r, { reason: reasonOf() || null })
      return json(r)
    }
    if (fn === 'delete_school_aval') {
      calls.push({ kind: 'rpc', fn, body })
      const r = find()
      if (!r || !canManageDept(r.department_id)) return send(err('42501', 'No tenés permiso para eliminar este aval.', 403))
      if (reasonOf().length < 3) return send(err('23514', 'Escribí el motivo de la eliminación (al menos 3 letras).'))
      tables.school_avales_documents = tables.school_avales_documents.filter((x) => x.id !== r.id)
      logMovement('delete', r, { reason: reasonOf() })
      return json(r.storage_path)
    }
    if (fn === 'renew_school_aval') {
      calls.push({ kind: 'rpc', fn, body })
      const r = find()
      const owner = r && (r.person_profile_id === me() || (r.person_profile_id === null && r.person_name === null && r.uploaded_by_profile_id === me()))
      if (!r || !(canManageDept(r.department_id) || (owner && canLoad()))) return send(err('42501', 'No tenés permiso para renovar este aval.', 403))
      if (r.is_archived) return send(err('22023', 'Este aval está archivado: pedile a la autoridad del área que lo vuelva a activar o cargá uno nuevo.'))
      if (!tables.__avalFiles.includes(body.p_new_path)) return send(err('22023', 'No se encontró el archivo nuevo. Volvé a intentar la carga.'))
      if (versionCheck(r)) return send(err('P0409', 'El registro fue actualizado por otra persona mientras lo editabas.', 409))
      const old = r.storage_path
      const previousName = r.file_name
      Object.assign(r, {
        storage_path: body.p_new_path, file_name: body.p_file_name || r.file_name, reference_year: body.p_reference_year ?? r.reference_year,
        observations: body.p_observations == null ? r.observations : body.p_observations || null, renewed_at: iso(0), renewed_by_profile_id: me(), renewed_by_name: myName(),
        renewal_count: r.renewal_count + 1, row_version: r.row_version + 1, updated_at: iso(0),
      })
      logMovement('renew', r, { previous_file_name: previousName })
      return json({ old_storage_path: old, row: r })
    }
    return false
  }

  return { handle, flush: () => Promise.all(inflight.splice(0)), calls }
}
