// SIGER4 - Edge Function: admin-update-user
//
// Completa el control real del superadmin (Dpto. de Informática y
// Estadística R4) sobre cualquier usuario del sistema. La mayoría de los
// campos de "profiles" ya se pueden editar directo por RLS
// (profiles_write_admin: is_informatica_r4() tiene "for all" sin
// restricción de columnas, y guard_profile_self_edit_columns exime a
// is_super_admin() del bloqueo de auto-edición) — esta función existe SOLO
// para lo que RLS no puede hacer porque vive en Supabase Auth, no en
// Postgres:
//   - Cambiar el email de la cuenta de Auth (además de profiles.email, para
//     que no queden desincronizados).
//   - Cambiar la contraseña de otro usuario.
//   - Banear/desbanear la cuenta de Auth (además de profiles.is_active).
//
// También expone (por comodidad, un solo pedido) actualizar profiles/roles/
// scope en la misma llamada, reusando exactamente la misma lógica de
// permisos.
//
// Matriz de permisos (autorización real, no solo de UI):
//   - informatica_r4 / integrante_informatica: pueden editar cualquier
//     usuario... EXCEPTO que si el usuario objetivo ya es informatica_r4,
//     solo otro informatica_r4 puede tocarlo (mismo criterio que
//     protect_super_admin_roles_scopes en la base). Otorgar el rol
//     informatica_r4 por primera vez también requiere ser informatica_r4.
//   - Cualquier otro rol: sin permiso, 403.
//
// Auditoría: cada cambio queda registrado en audit_logs vía
// record_manual_audit_event() (mismo mecanismo ya usado para "reporte
// generado"), con table_name='profiles' y action='admin_update' — no se
// inserta directo en audit_logs desde el cliente en ningún caso.
//
// Despliegue: `supabase functions deploy admin-update-user`.

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

interface UpdateUserBody {
  profile_id: string
  // Datos básicos de profiles (todos opcionales — solo se actualiza lo que
  // viene definido en el body).
  full_name?: string
  email?: string
  rank?: string | null
  region_id?: string | null
  station_id?: string | null
  is_active?: boolean
  must_change_password?: boolean
  // Auth: cambiar la contraseña de otro usuario.
  new_password?: string
  // Reemplazo completo de roles (si viene, borra los roles actuales del
  // perfil y los reemplaza por estos).
  roles?: RoleKey[]
  // Reemplazo completo del scope principal (si viene, borra los scopes
  // actuales del perfil y crea este único).
  scope?: {
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

function logAndRespond(step: string, err: unknown, fallbackMessage: string, status = 500): Response {
  const detail = err instanceof Error ? err.message : JSON.stringify(err)
  console.error(`[admin-update-user] Falló en "${step}": ${detail}`)
  return jsonResponse({ error: fallbackMessage, step }, status)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[admin-update-user] Faltan variables de entorno de Supabase.')
      return jsonResponse({ error: 'Función no configurada: faltan variables de Supabase.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'No autenticado.' }, 401)

    const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser()
    if (userError || !userData?.user) return logAndRespond('auth.getUser', userError, 'No autenticado.', 401)

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_active')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle()
    if (actorProfileError) return logAndRespond('resolver perfil del actor', actorProfileError, 'No pudimos verificar tu perfil. Reintentá en unos segundos.')
    if (!actorProfile || !actorProfile.is_active) return jsonResponse({ error: 'No tenés permiso para editar usuarios.' }, 403)

    const { data: actorRoleRows, error: actorRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('profile_id', actorProfile.id)
    if (actorRolesError) return logAndRespond('resolver roles del actor', actorRolesError, 'No pudimos verificar tus permisos. Reintentá en unos segundos.')
    const actorRoles = new Set((actorRoleRows ?? []).map((r: { role: RoleKey }) => r.role))

    const actorIsSuperAdmin = actorRoles.has('informatica_r4')
    const actorIsInformatica = actorIsSuperAdmin || actorRoles.has('integrante_informatica')

    if (!actorIsInformatica) {
      return jsonResponse({ error: 'No tenés permiso para editar usuarios.' }, 403)
    }

    let body: UpdateUserBody
    try {
      body = await req.json()
    } catch (err) {
      return logAndRespond('parsear body', err, 'Solicitud inválida.', 400)
    }

    if (!body.profile_id) {
      return jsonResponse({ error: 'Falta el usuario a editar.' }, 400)
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, auth_user_id, email')
      .eq('id', body.profile_id)
      .maybeSingle()
    if (targetProfileError) return logAndRespond('resolver perfil objetivo', targetProfileError, 'No pudimos cargar el usuario a editar.')
    if (!targetProfile) return jsonResponse({ error: 'Usuario no encontrado.' }, 404)

    // Protección de superadmin (mismo criterio que
    // protect_super_admin_roles_scopes en la base): si el objetivo ya es
    // informatica_r4, o el pedido intenta otorgarle ese rol por primera vez,
    // solo otro informatica_r4 puede tocarlo.
    const { data: targetRoleRows, error: targetRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('profile_id', targetProfile.id)
    if (targetRolesError) return logAndRespond('resolver roles del objetivo', targetRolesError, 'No pudimos verificar los roles del usuario a editar.')
    const targetIsSuperAdmin = (targetRoleRows ?? []).some((r: { role: RoleKey }) => r.role === 'informatica_r4')
    const grantingSuperAdmin = body.roles?.includes('informatica_r4') ?? false

    if ((targetIsSuperAdmin || grantingSuperAdmin) && !actorIsSuperAdmin) {
      return jsonResponse({ error: 'Solo un usuario Informática R4 puede modificar a otro Informática R4, o asignar ese rol.' }, 403)
    }

    if (body.roles && body.roles.some((r) => !ALL_ROLES.includes(r))) {
      return jsonResponse({ error: 'Rol inválido.' }, 400)
    }
    if (body.new_password !== undefined && body.new_password.length < 8) {
      return jsonResponse({ error: 'La contraseña nueva debe tener al menos 8 caracteres.' }, 400)
    }

    // authChanges junta que cambios de Auth realmente se aplicaron, para
    // auditarlos puntualmente al final (record_manual_audit_event) — nunca
    // se audita algo que no llegó a pasar.
    const authChanges: string[] = []

    // ---------------- Auth: email ----------------
    let normalizedEmail: string | undefined
    if (body.email !== undefined) {
      normalizedEmail = normalizeEmail(body.email)
      if (normalizedEmail !== targetProfile.email) {
        const { data: existingWithEmail, error: existingEmailError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .neq('id', targetProfile.id)
          .maybeSingle()
        if (existingEmailError) return logAndRespond('verificar email duplicado', existingEmailError, 'No pudimos verificar el email.')
        if (existingWithEmail) return jsonResponse({ error: 'Ya existe otro perfil con ese email.' }, 409)

        if (targetProfile.auth_user_id) {
          const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(targetProfile.auth_user_id, {
            email: normalizedEmail,
            email_confirm: true,
          })
          if (authEmailError) return logAndRespond('actualizar email en Auth', authEmailError, 'No se pudo actualizar el email de la cuenta.')
          authChanges.push('email')
        }
      }
    }

    // ---------------- Auth: contraseña ----------------
    if (body.new_password && targetProfile.auth_user_id) {
      const { error: authPasswordError } = await supabaseAdmin.auth.admin.updateUserById(targetProfile.auth_user_id, {
        password: body.new_password,
      })
      if (authPasswordError) return logAndRespond('actualizar contraseña en Auth', authPasswordError, 'No se pudo actualizar la contraseña.')
      authChanges.push('password')
    }

    // ---------------- Auth: ban/unban (junto con is_active) ----------------
    if (body.is_active !== undefined && targetProfile.auth_user_id) {
      const { error: authBanError } = await supabaseAdmin.auth.admin.updateUserById(targetProfile.auth_user_id, {
        // ban_duration: 'none' desbanea; un valor largo (100 años) bloquea el
        // login efectivamente sin borrar la cuenta.
        ban_duration: body.is_active ? 'none' : '876000h',
      })
      if (authBanError) return logAndRespond('actualizar ban de Auth', authBanError, 'No se pudo actualizar el estado de la cuenta en Auth.')
      authChanges.push(body.is_active ? 'unban' : 'ban')
    }

    // ---------------- profiles ----------------
    const profileUpdate: Record<string, unknown> = {}
    if (body.full_name !== undefined) profileUpdate.full_name = body.full_name
    if (normalizedEmail !== undefined) profileUpdate.email = normalizedEmail
    if (body.rank !== undefined) profileUpdate.rank = body.rank
    if (body.region_id !== undefined) profileUpdate.region_id = body.region_id
    if (body.station_id !== undefined) profileUpdate.station_id = body.station_id
    if (body.is_active !== undefined) profileUpdate.is_active = body.is_active
    if (body.must_change_password !== undefined) profileUpdate.must_change_password = body.must_change_password

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileUpdateError } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', targetProfile.id)
      if (profileUpdateError) return logAndRespond('actualizar profile', profileUpdateError, 'No se pudieron guardar los datos del perfil.')
    }

    // ---------------- roles (reemplazo completo, si viene) ----------------
    if (body.roles) {
      const { error: deleteRolesError } = await supabaseAdmin.from('user_roles').delete().eq('profile_id', targetProfile.id)
      if (deleteRolesError) return logAndRespond('borrar roles previos', deleteRolesError, 'No se pudieron actualizar los roles.')
      if (body.roles.length > 0) {
        const { error: insertRolesError } = await supabaseAdmin
          .from('user_roles')
          .insert(body.roles.map((role) => ({ profile_id: targetProfile.id, role })))
        if (insertRolesError) return logAndRespond('insertar roles nuevos', insertRolesError, 'No se pudieron guardar los roles nuevos.')
      }
    }

    // ---------------- scope (reemplazo completo, si viene) ----------------
    if (body.scope) {
      const { error: deleteScopeError } = await supabaseAdmin.from('user_scopes').delete().eq('profile_id', targetProfile.id)
      if (deleteScopeError) return logAndRespond('borrar scopes previos', deleteScopeError, 'No se pudo actualizar el alcance.')
      const { error: insertScopeError } = await supabaseAdmin.from('user_scopes').insert({
        profile_id: targetProfile.id,
        scope_type: body.scope.scope_type,
        region_id: body.scope.region_id ?? null,
        subsede_id: body.scope.subsede_id ?? null,
        station_id: body.scope.station_id ?? null,
      })
      if (insertScopeError) return logAndRespond('insertar scope nuevo', insertScopeError, 'No se pudo guardar el alcance nuevo.')
    }

    // ---------------- Auditoría de cambios de Auth ----------------
    // profiles/user_roles/user_scopes ya quedan auditados automáticamente
    // por los triggers existentes (audit_row_change) apenas se actualizan
    // arriba — no hace falta duplicarlo acá. Lo que SÍ no deja rastro en
    // ninguna tabla de Postgres es el cambio de email/contraseña/ban en
    // Supabase Auth, por eso se registra puntualmente, y solo si
    // authChanges no está vacío (no se audita algo que no pasó).
    // record_manual_audit_event fuerza actor_profile_id = current_profile_id()
    // real (el del que llama, resuelto server-side bajo su propia identidad,
    // no con service_role), no confía en nada que mande el cliente.
    if (authChanges.length > 0) {
      await supabaseAsUser.rpc('record_manual_audit_event', {
        p_action: 'admin_auth_update',
        p_table_name: 'auth_users',
        p_record_id: targetProfile.id,
        p_new_value: { auth_changes: authChanges },
        p_reason: `Cambios de Auth (${authChanges.join(', ')}) aplicados por ${actorIsSuperAdmin ? 'informatica_r4' : 'integrante_informatica'}.`,
      })
    }

    const { data: updatedProfile, error: reloadError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetProfile.id)
      .single()
    if (reloadError) return logAndRespond('recargar profile actualizado', reloadError, 'Los cambios se guardaron, pero no pudimos recargar el perfil.')

    return jsonResponse({ profile: updatedProfile })
  } catch (err) {
    return logAndRespond('excepción no controlada', err, 'Ocurrió un error inesperado editando el usuario.')
  }
})
