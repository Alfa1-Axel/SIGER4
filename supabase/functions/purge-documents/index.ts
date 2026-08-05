// SIGER4 - Edge Function: purge-documents
//
// Purga definitiva de documentos que ya están en la papelera (documents.deleted_at
// not null) — borra la fila de "documents", sus filas de "document_versions", y
// los archivos reales del bucket "documents" en Storage. Es la única pieza
// del flujo de papelera que NO puede hacerse desde SQL/PL-pgSQL puro:
// `delete from storage.objects` borra solo la fila de metadata, no el blob
// físico en el object store — esa operación solo la expone la Storage API
// (supabaseAdmin.storage.from(...).remove(...)), alcanzable únicamente
// server-side con la service_role key.
//
// Dos formas de invocarla:
//   1. Automática (pg_cron, diaria): sin JWT de usuario, header
//      "x-cron-secret" con CRON_SHARED_SECRET (mismo secreto que ya usa
//      send-push-system, no se duplica). Sin body -> purga TODOS los
//      documentos vencidos (purge_after <= now()).
//   2. Manual (botón "Purgar ahora" en la Papelera, solo informatica_r4):
//      JWT de usuario real. Body opcional { documentId } para purgar uno
//      puntual (el usuario ya lo tiene visible en pantalla, no hace falta
//      esperar a que venza) — sin documentId, purga todos los vencidos
//      igual que el cron.
//
// Seguridad:
// - Nunca confía en que un documento "parece" purgable porque el cliente lo
//   dice: siempre vuelve a consultar deleted_at/purge_after en la base antes
//   de borrar nada, tanto en el modo cron como en el modo manual.
// - El modo manual exige informatica_r4/integrante_informatica real
//   (resuelto vía el JWT, no confía en ningún flag que mande el cliente).
// - Si falla el borrado de Storage de un documento puntual, esa fila de
//   documents/document_versions NO se borra (queda en la papelera, se
//   reintenta en la corrida siguiente) — nunca se borra la fila de la base
//   dejando un archivo huérfano sin ninguna referencia, y nunca se deja un
//   archivo real borrado con la fila todavía apuntando a un path que ya no
//   existe. El error queda en los logs de la función (Supabase Dashboard →
//   Edge Functions → purge-documents → Logs) y en la respuesta.
//
// Despliegue: `supabase functions deploy purge-documents`.
// Requiere el secreto CRON_SHARED_SECRET (el mismo que send-push-system, ver
// DEPLOYMENT.md sección del recordatorio semanal para el comando exacto).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PurgeBody {
  documentId?: string
}

interface PurgeResultDetail {
  documentId: string
  title: string
  ok: boolean
  error?: string
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[purge-documents] Faltan variables de entorno de Supabase.')
      return jsonResponse({ error: 'Función no configurada: faltan variables de Supabase.' }, 500)
    }

    const cronSecretHeader = req.headers.get('x-cron-secret')
    const authHeader = req.headers.get('Authorization')

    let isAuthorized = false

    // Modo 1: cron (sin JWT de usuario, secreto compartido).
    if (cronSecretHeader) {
      if (!CRON_SHARED_SECRET || cronSecretHeader !== CRON_SHARED_SECRET) {
        return jsonResponse({ error: 'No autorizado.' }, 401)
      }
      isAuthorized = true
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Modo 2: manual, requiere informatica_r4/integrante_informatica real.
    if (!isAuthorized) {
      if (!authHeader) return jsonResponse({ error: 'No autenticado.' }, 401)

      const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await supabaseAsUser.auth.getUser()
      if (userError || !userData?.user) return jsonResponse({ error: 'No autenticado.' }, 401)

      const { data: actorProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, is_active')
        .eq('auth_user_id', userData.user.id)
        .maybeSingle()
      if (!actorProfile || !actorProfile.is_active) return jsonResponse({ error: 'No tenés permiso para purgar documentos.' }, 403)

      const { data: actorRoleRows } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('profile_id', actorProfile.id)
      const actorRoles = new Set((actorRoleRows ?? []).map((r: { role: string }) => r.role))
      const actorIsInformatica = actorRoles.has('informatica_r4') || actorRoles.has('integrante_informatica')
      if (!actorIsInformatica) return jsonResponse({ error: 'No tenés permiso para purgar documentos.' }, 403)

      isAuthorized = true
    }

    let body: PurgeBody = {}
    if (req.headers.get('content-type')?.includes('application/json')) {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    // Siempre se vuelve a consultar la base (nunca se confía en que el
    // cliente diga "esto ya está vencido"): documentId puntual solo purga
    // ESE documento, y solo si de verdad está en la papelera.
    let query = supabaseAdmin
      .from('documents')
      .select('id, title, storage_path, deleted_at, purge_after')
      .not('deleted_at', 'is', null)

    if (body.documentId) {
      query = query.eq('id', body.documentId)
    } else {
      query = query.lte('purge_after', new Date().toISOString())
    }

    const { data: candidates, error: candidatesError } = await query
    if (candidatesError) {
      console.error('[purge-documents] Error al buscar documentos a purgar:', candidatesError.message)
      return jsonResponse({ error: 'No pudimos buscar los documentos a purgar.' }, 500)
    }
    if (!candidates?.length) {
      return jsonResponse({ purged: 0, failed: 0, details: [] })
    }

    const details: PurgeResultDetail[] = []
    let purged = 0
    let failed = 0

    for (const doc of candidates as { id: string; title: string; storage_path: string }[]) {
      try {
        const { data: versions, error: versionsError } = await supabaseAdmin
          .from('document_versions')
          .select('storage_path')
          .eq('document_id', doc.id)
        if (versionsError) throw new Error(`No se pudieron leer las versiones: ${versionsError.message}`)

        const pathsToRemove = [doc.storage_path, ...(versions ?? []).map((v: { storage_path: string }) => v.storage_path)].filter(
          (path) => path && path !== 'pending',
        )

        if (pathsToRemove.length > 0) {
          const { error: removeError } = await supabaseAdmin.storage.from('documents').remove(pathsToRemove)
          // Si el archivo ya no existe en Storage (borrado manual previo,
          // inconsistencia vieja), Supabase Storage no siempre devuelve error
          // por eso — pero si SÍ devuelve un error real, no seguimos: mejor
          // dejar la fila en la papelera para reintentar que borrar la fila
          // y perder la referencia a un archivo que capaz sigue existiendo.
          if (removeError) throw new Error(`No se pudo borrar el archivo de Storage: ${removeError.message}`)
        }

        const { error: deleteVersionsError } = await supabaseAdmin.from('document_versions').delete().eq('document_id', doc.id)
        if (deleteVersionsError) throw new Error(`No se pudieron borrar las versiones: ${deleteVersionsError.message}`)

        const { error: deleteDocError } = await supabaseAdmin.from('documents').delete().eq('id', doc.id)
        if (deleteDocError) throw new Error(`No se pudo borrar el documento: ${deleteDocError.message}`)

        purged += 1
        details.push({ documentId: doc.id, title: doc.title, ok: true })
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : 'Error desconocido.'
        console.error(`[purge-documents] Falló la purga de "${doc.title}" (${doc.id}): ${message}`)
        details.push({ documentId: doc.id, title: doc.title, ok: false, error: message })
      }
    }

    return jsonResponse({ purged, failed, details })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido.'
    console.error('[purge-documents] Excepción no controlada:', message)
    return jsonResponse({ error: 'Ocurrió un error inesperado purgando documentos.' }, 500)
  }
})
