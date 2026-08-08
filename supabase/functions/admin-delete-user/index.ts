// SIGER4 - Edge Function: admin-delete-user
//
// Borrado directo (hard delete) de un usuario del sistema. Solo
// informatica_r4 puede ejecutarlo — a diferencia de admin-update-user, ni
// siquiera integrante_informatica ni jefe_cuerpo_activo tienen acceso: es la
// acción más destructiva e irreversible del sistema.
//
// Qué borra: auth.admin.deleteUser() borra el auth.users del usuario, lo que
// dispara en cascada el borrado de profiles (auth_user_id ... on delete
// cascade, ver 0001_schema.sql) y desde ahí, en la misma transacción de
// Postgres, todo lo que cuelga de profiles con "on delete cascade"
// (user_roles, user_scopes, notifications, push_subscriptions,
// department_members) o "on delete set null" (audit_logs.actor_profile_id,
// documents.uploaded_by_profile_id, department_activity_reports.
// created_by_profile_id, inventory_loan_requests.*_profile_id salvo
// requested_by_profile_id, etc. — ver listado completo en DEPLOYMENT.md).
// No hace falta borrar cada tabla manualmente: un solo
// auth.admin.deleteUser() alcanza.
//
// Bloqueo real (no se puede evitar sin perder una garantía institucional):
// inventory_loan_requests.requested_by_profile_id tiene "on delete restrict"
// a propósito (0057_inventory_loan_requests.sql: nunca se pierde el rastro
// de quién solicitó un préstamo). Si el usuario objetivo alguna vez
// solicitó un préstamo, el delete falla con FK violation (23503) — se
// detecta ANTES de intentar el borrado, con un mensaje claro en vez de dejar
// que Postgres lo rechace con un error críptico.
//
// Protecciones (confirmadas explícitamente con el usuario):
//   - Nadie puede borrarse a sí mismo, ni siquiera informatica_r4.
//   - No se puede borrar al último informatica_r4 activo del sistema.
//   - Se registra auditoría manual ANTES de ejecutar el borrado real (igual
//     que admin-update-user con los cambios de Auth): una vez borrado el
//     auth.users, el trigger automático de 'profiles' igual queda auditado,
//     pero con actor_profile_id null (corre bajo service_role) — el evento
//     manual, hecho con el cliente del actor real, es el que deja constancia
//     de QUIÉN ejecutó el borrado.
//
// Despliegue: `supabase functions deploy admin-delete-user`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface DeleteUserBody {
  profile_id: string
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function logAndRespond(step: string, err: unknown, fallbackMessage: string, status = 500): Response {
  const detail = err instanceof Error ? err.message : JSON.stringify(err)
  console.error(`[admin-delete-user] Falló en "${step}": ${detail}`)
  return jsonResponse({ error: fallbackMessage, step }, status)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[admin-delete-user] Faltan variables de entorno de Supabase.')
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
    if (!actorProfile || !actorProfile.is_active) return jsonResponse({ error: 'No tenés permiso para eliminar usuarios.' }, 403)

    const { data: actorRoleRows, error: actorRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('profile_id', actorProfile.id)
    if (actorRolesError) return logAndRespond('resolver roles del actor', actorRolesError, 'No pudimos verificar tus permisos. Reintentá en unos segundos.')
    const actorIsSuperAdmin = (actorRoleRows ?? []).some((r: { role: string }) => r.role === 'informatica_r4')

    // Solo informatica_r4 — a diferencia de admin-update-user, ni siquiera
    // integrante_informatica tiene acceso al borrado directo.
    if (!actorIsSuperAdmin) {
      return jsonResponse({ error: 'Solo Informática R4 puede eliminar usuarios directamente.' }, 403)
    }

    let body: DeleteUserBody
    try {
      body = await req.json()
    } catch (err) {
      return logAndRespond('parsear body', err, 'Solicitud inválida.', 400)
    }
    if (!body.profile_id) {
      return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400)
    }

    // Nadie puede borrarse a sí mismo, ni siquiera informatica_r4 — evita un
    // accidente irreversible (quedarse sin sesión propia, o dejar el sistema
    // sin admins si es el único).
    if (body.profile_id === actorProfile.id) {
      return jsonResponse({ error: 'No podés eliminar tu propio usuario.' }, 400)
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, auth_user_id, full_name')
      .eq('id', body.profile_id)
      .maybeSingle()
    if (targetProfileError) return logAndRespond('resolver perfil objetivo', targetProfileError, 'No pudimos cargar el usuario a eliminar.')
    if (!targetProfile) return jsonResponse({ error: 'Usuario no encontrado.' }, 404)

    const { data: targetRoleRows, error: targetRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('profile_id', targetProfile.id)
    if (targetRolesError) return logAndRespond('resolver roles del objetivo', targetRolesError, 'No pudimos verificar los roles del usuario a eliminar.')
    const targetIsSuperAdmin = (targetRoleRows ?? []).some((r: { role: string }) => r.role === 'informatica_r4')

    // No se puede borrar al último informatica_r4 activo del sistema — sin
    // esto, sería posible dejar SIGER4 sin ningún admin que pueda revertir
    // nada (ni siquiera reasignar el rol a otro usuario).
    if (targetIsSuperAdmin) {
      const { data: superAdminRoleRows, error: superAdminRolesError } = await supabaseAdmin
        .from('user_roles')
        .select('profile_id')
        .eq('role', 'informatica_r4')
      if (superAdminRolesError) return logAndRespond('resolver informatica_r4 del sistema', superAdminRolesError, 'No pudimos verificar cuántos administradores quedan en el sistema.')
      const superAdminProfileIds = (superAdminRoleRows ?? []).map((r: { profile_id: string }) => r.profile_id)

      const { data: activeSuperAdmins, error: activeSuperAdminsError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .in('id', superAdminProfileIds.length > 0 ? superAdminProfileIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('is_active', true)
      if (activeSuperAdminsError) return logAndRespond('contar informatica_r4 activos', activeSuperAdminsError, 'No pudimos verificar cuántos administradores quedan en el sistema.')

      if ((activeSuperAdmins ?? []).length <= 1) {
        return jsonResponse({ error: 'No se puede eliminar al único usuario Informática R4 activo del sistema.' }, 400)
      }
    }

    // inventory_loan_requests.requested_by_profile_id es "on delete restrict"
    // a propósito (nunca se pierde el rastro de quién solicitó un préstamo).
    // Se detecta ANTES de intentar el delete, con un mensaje claro.
    const { count: loanRequestCount, error: loanRequestError } = await supabaseAdmin
      .from('inventory_loan_requests')
      .select('id', { count: 'exact', head: true })
      .eq('requested_by_profile_id', targetProfile.id)
    if (loanRequestError) return logAndRespond('verificar solicitudes de préstamo', loanRequestError, 'No pudimos verificar si el usuario tiene solicitudes de préstamo asociadas.')
    if ((loanRequestCount ?? 0) > 0) {
      return jsonResponse(
        {
          error:
            'Este usuario tiene solicitudes de préstamo del inventario a su nombre; no se puede eliminar (se preserva el historial). Podés desactivarlo en su lugar.',
        },
        409,
      )
    }

    // Auditoría manual ANTES del borrado real: con el cliente del actor
    // (no service_role), para que record_manual_audit_event() resuelva
    // current_profile_id() = el admin real que ejecuta esto, no null.
    const { error: auditError } = await supabaseAsUser.rpc('record_manual_audit_event', {
      p_action: 'admin_delete_user',
      p_table_name: 'auth_users',
      p_record_id: targetProfile.id,
      p_new_value: { deleted_full_name: targetProfile.full_name },
      p_reason: `Eliminación directa de usuario ejecutada por informatica_r4.`,
    })
    if (auditError) return logAndRespond('registrar auditoría previa al borrado', auditError, 'No pudimos registrar la auditoría de esta acción; no se eliminó el usuario.')

    if (targetProfile.auth_user_id) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetProfile.auth_user_id)
      if (deleteAuthError) return logAndRespond('eliminar usuario de Auth', deleteAuthError, 'No se pudo eliminar la cuenta de autenticación del usuario.')
    } else {
      // Perfil sin cuenta de Auth vinculada (no debería pasar en la práctica,
      // pero por las dudas se borra el profile directo si ocurriera).
      const { error: deleteProfileError } = await supabaseAdmin.from('profiles').delete().eq('id', targetProfile.id)
      if (deleteProfileError) return logAndRespond('eliminar perfil sin cuenta de Auth', deleteProfileError, 'No se pudo eliminar el perfil del usuario.')
    }

    return jsonResponse({ success: true })
  } catch (err) {
    return logAndRespond('excepción no controlada', err, 'Ocurrió un error inesperado eliminando el usuario.')
  }
})
