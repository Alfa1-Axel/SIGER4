// SIGER4 - Edge Function: admin-create-user
//
// Reemplaza el flujo de auto-registro (RegistroPage + link_invited_profile,
// retirado por riesgo de account takeover: cualquiera podia hacer signUp con
// el email de un futuro invitado antes que la persona real, y quedarse el
// perfil cuando el admin lo creaba). El alta de usuarios la hace un conjunto
// acotado de roles (ver matriz de permisos abajo), nunca el propio usuario.
//
// Revision 2026-08: la función ahora crea el usuario, el perfil Y sus roles/
// scope en un solo paso server-side. Antes el frontend llamaba por separado a
// addRole()/addScope() (RLS de user_roles/user_scopes), pero esas tablas solo
// permiten escritura a is_informatica_r4() — director_escuela y
// jefe_cuerpo_activo nunca iban a poder asignar roles aunque pudieran crear
// el perfil. Mover todo a esta función (service_role, con su propia
// validación de matriz de permisos) es lo que realmente habilita "Director de
// Escuela y jefe_cuerpo_activo pueden crear usuarios".
//
// Matriz de permisos (autorización real, no solo de UI):
//   - informatica_r4 / integrante_informatica: cualquier rol, cualquier
//     región/cuartel.
//   - director_escuela: cualquier rol EXCEPTO informatica_r4/integrante_informatica.
//     Cualquier región/cuartel.
//   - jefe_cuerpo_activo: solo puede crear usuarios para SU PROPIO cuartel
//     (profiles.station_id del creador), y solo puede asignar los roles
//     presidente_cuartel, usuario_carga_cuartel, secretario_comision,
//     administrativo, invitado (nunca jefe_cuerpo_activo ni ningún rol
//     regional/escuela/informática).
//   - Cualquier otro rol: sin permiso, 403.
//
// Flujo:
//   1. Valida que quien invoca esta funcion tiene permiso segun la matriz.
//   2. Valida que los roles pedidos están permitidos para ese creador (y, si
//      es jefe_cuerpo_activo, que el station_id pedido es el suyo propio).
//   3. Crea el usuario en Supabase Auth con auth.admin.createUser() (requiere
//      service_role; nunca se expone esa clave al frontend) con el email
//      normalizado y una contraseña temporal, con el email ya confirmado
//      (email_confirm: true) porque es un admin quien da de alta, no un
//      desconocido.
//   4. Crea la fila en "profiles" ya vinculada (auth_user_id set desde el
//      inicio, nunca null), sus roles (user_roles) y su alcance (user_scopes)
//      via service_role, en un solo paso atómico en la práctica (si algo
//      falla a mitad de camino, se revierte lo ya creado).
//   5. Si el email ya existe en Auth, no crea una cuenta duplicada ni pisa
//      nada: responde un error claro.
//
// El admin comparte la contraseña temporal por un canal seguro (no queda
// guardada en ningun lado del sistema); el usuario debe cambiarla en su
// primer ingreso (ver nota en el frontend).
//
// Despliegue: `supabase functions deploy admin-create-user`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type RoleKey =
  | 'informatica_r4'
  | 'integrante_informatica'
  | 'director_escuela'
  | 'instructor'
  | 'secretario_regional'
  | 'presidente_cuartel'
  | 'jefe_cuerpo_activo'
  | 'usuario_carga_cuartel'
  | 'secretario_comision'
  | 'administrativo'
  | 'invitado'

type ScopeType = 'system' | 'region' | 'subsede' | 'station' | 'escuela'

const ALL_ROLES: RoleKey[] = [
  'informatica_r4',
  'integrante_informatica',
  'director_escuela',
  'instructor',
  'secretario_regional',
  'presidente_cuartel',
  'jefe_cuerpo_activo',
  'usuario_carga_cuartel',
  'secretario_comision',
  'administrativo',
  'invitado',
]

const INFORMATICA_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica']

// Roles que un jefe_cuerpo_activo puede asignar (confirmado explícitamente:
// nunca su propio rol, nunca nada regional/escuela/informática).
// 'administrativo' se retiró como rol asignable (ver
// 0043_remove_administrativo_role_ui.sql) — se mantiene en RoleKey/ALL_ROLES
// porque el valor sigue existiendo en el enum de Postgres, pero ya no se
// ofrece para asignar a nadie nuevo.
const JEFE_CUERPO_ACTIVO_ASSIGNABLE_ROLES: RoleKey[] = [
  'presidente_cuartel',
  'usuario_carga_cuartel',
  'secretario_comision',
  'invitado',
]

interface CreateUserBody {
  email: string
  password: string
  full_name: string
  rank?: string | null
  region_id?: string | null
  station_id?: string | null
  roles: RoleKey[]
  scope: {
    scope_type: ScopeType
    region_id?: string | null
    subsede_id?: string | null
    station_id?: string | null
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Función no configurada: faltan variables de Supabase.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'No autenticado.' }, 401)

  const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAsUser.auth.getUser()
  if (userError || !userData?.user) return jsonResponse({ error: 'No autenticado.' }, 401)

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Resuelve el perfil y los roles reales del que invoca (bajo service_role,
  // pero filtrando por auth_user_id real — nunca confía en nada que mande el
  // frontend sobre quién es el actor).
  const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, station_id, is_active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (actorProfileError) return jsonResponse({ error: actorProfileError.message }, 500)
  if (!actorProfile || !actorProfile.is_active) return jsonResponse({ error: 'No tenés permiso para crear usuarios.' }, 403)

  const { data: actorRoleRows, error: actorRolesError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('profile_id', actorProfile.id)
  if (actorRolesError) return jsonResponse({ error: actorRolesError.message }, 500)
  const actorRoles = new Set((actorRoleRows ?? []).map((r: { role: RoleKey }) => r.role))

  const isInformatica = actorRoles.has('informatica_r4') || actorRoles.has('integrante_informatica')
  const isDirectorEscuela = actorRoles.has('director_escuela')
  const isJefeCuerpoActivo = actorRoles.has('jefe_cuerpo_activo')

  if (!isInformatica && !isDirectorEscuela && !isJefeCuerpoActivo) {
    return jsonResponse({ error: 'No tenés permiso para crear usuarios.' }, 403)
  }

  let body: CreateUserBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400)
  }

  if (!body.email || !body.full_name || !body.password) {
    return jsonResponse({ error: 'Faltan datos obligatorios (email, nombre, contraseña).' }, 400)
  }
  if (body.password.length < 8) {
    return jsonResponse({ error: 'La contraseña temporal debe tener al menos 8 caracteres.' }, 400)
  }
  const requestedRoles = body.roles ?? []
  if (requestedRoles.length === 0) {
    return jsonResponse({ error: 'Seleccioná al menos un rol para el usuario.' }, 400)
  }
  if (requestedRoles.some((r) => !ALL_ROLES.includes(r))) {
    return jsonResponse({ error: 'Rol inválido.' }, 400)
  }
  if (!body.scope?.scope_type) {
    return jsonResponse({ error: 'Falta el alcance del usuario.' }, 400)
  }

  // Validacion de la matriz de permisos, server-side (la unica que importa —
  // la UI solo oculta opciones por comodidad, esto es lo que realmente
  // protege el sistema).
  if (!isInformatica) {
    if (requestedRoles.some((r) => INFORMATICA_ROLES.includes(r))) {
      return jsonResponse({ error: 'No tenés permiso para asignar roles de Informática.' }, 403)
    }
  }

  if (!isInformatica && !isDirectorEscuela && isJefeCuerpoActivo) {
    if (requestedRoles.some((r) => !JEFE_CUERPO_ACTIVO_ASSIGNABLE_ROLES.includes(r))) {
      return jsonResponse({ error: 'Como Jefe de Cuerpo Activo solo podés asignar roles de cuartel (no jefe_cuerpo_activo, ni roles regionales/escuela/informática).' }, 403)
    }
    if (!actorProfile.station_id) {
      return jsonResponse({ error: 'Tu perfil no tiene un cuartel asignado; no podés crear usuarios.' }, 403)
    }
    if (body.station_id !== actorProfile.station_id) {
      return jsonResponse({ error: 'Solo podés crear usuarios para tu propio cuartel.' }, 403)
    }
    if (body.scope.scope_type !== 'station' || body.scope.station_id !== actorProfile.station_id) {
      return jsonResponse({ error: 'El alcance del usuario debe ser tu propio cuartel.' }, 403)
    }
  }

  const email = normalizeEmail(body.email)

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existingProfile) {
    return jsonResponse({ error: 'Ya existe un perfil con ese email.' }, 409)
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    const alreadyExists = (createError?.message ?? '').toLowerCase().includes('already registered')
    return jsonResponse(
      { error: alreadyExists ? 'Ese email ya tiene una cuenta de Auth (sin perfil vinculado). Contactá soporte.' : (createError?.message ?? 'No se pudo crear el usuario.') },
      alreadyExists ? 409 : 500,
    )
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      auth_user_id: created.user.id,
      full_name: body.full_name,
      email,
      rank: body.rank ?? null,
      region_id: body.region_id ?? null,
      station_id: body.station_id ?? null,
      // La contraseña la definió (o generó) quien crea el usuario, no la
      // persona dueña de la cuenta — se fuerza que la cambie antes de poder
      // usar el resto de la app (ver migración 0034_must_change_password.sql
      // y ForcePasswordChangeGate en el frontend).
      must_change_password: true,
    })
    .select('*')
    .single()

  if (profileError) {
    // El perfil no se pudo crear (ej. constraint violado): revierte el alta
    // en Auth para no dejar una cuenta huerfana sin perfil.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: profileError.message }, 500)
  }

  const { error: rolesError } = await supabaseAdmin
    .from('user_roles')
    .insert(requestedRoles.map((role) => ({ profile_id: profile.id, role })))
  if (rolesError) {
    await supabaseAdmin.from('profiles').delete().eq('id', profile.id)
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: rolesError.message }, 500)
  }

  const { error: scopeError } = await supabaseAdmin.from('user_scopes').insert({
    profile_id: profile.id,
    scope_type: body.scope.scope_type,
    region_id: body.scope.region_id ?? null,
    subsede_id: body.scope.subsede_id ?? null,
    station_id: body.scope.station_id ?? null,
  })
  if (scopeError) {
    await supabaseAdmin.from('user_roles').delete().eq('profile_id', profile.id)
    await supabaseAdmin.from('profiles').delete().eq('id', profile.id)
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: scopeError.message }, 500)
  }

  return jsonResponse({ profile })
})
