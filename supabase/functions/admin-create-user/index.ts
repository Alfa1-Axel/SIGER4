// SIGER4 - Edge Function: admin-create-user
//
// Reemplaza el flujo de auto-registro (RegistroPage + link_invited_profile,
// retirado por riesgo de account takeover: cualquiera podia hacer signUp con
// el email de un futuro invitado antes que la persona real, y quedarse el
// perfil cuando el admin lo creaba). Ahora el alta de usuarios la hace
// directamente el Dpto. de Informática y Estadística R4 (informatica_r4 /
// integrante_informatica, el rol de mayor permiso del sistema):
//   1. Valida que quien invoca esta funcion es informatica_r4/integrante_informatica.
//   2. Crea el usuario en Supabase Auth con auth.admin.createUser() (requiere
//      service_role; nunca se expone esa clave al frontend) con el email
//      normalizado y una contraseña temporal, con el email ya confirmado
//      (email_confirm: true) porque es el admin quien da de alta, no un
//      desconocido.
//   3. Crea la fila en "profiles" ya vinculada (auth_user_id set desde el
//      inicio, nunca null) via service_role, evitando la ventana de
//      "perfil huerfano esperando a ser reclamado" que tenia el flujo viejo.
//   4. Si el email ya existe en Auth, no crea una cuenta duplicada ni pisa
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

interface CreateUserBody {
  email: string
  password: string
  full_name: string
  rank?: string | null
  region_id?: string | null
  station_id?: string | null
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

  // Autorizacion: solo informatica_r4/integrante_informatica pueden dar de
  // alta usuarios. is_informatica_r4() ya filtra por is_active=true.
  const { data: isAdmin, error: authzError } = await supabaseAsUser.rpc('is_informatica_r4')
  if (authzError) return jsonResponse({ error: authzError.message }, 500)
  if (!isAdmin) return jsonResponse({ error: 'No tenés permiso para crear usuarios.' }, 403)

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

  const email = normalizeEmail(body.email)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
    })
    .select('*')
    .single()

  if (profileError) {
    // El perfil no se pudo crear (ej. constraint violado): revierte el alta
    // en Auth para no dejar una cuenta huerfana sin perfil.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: profileError.message }, 500)
  }

  return jsonResponse({ profile })
})
