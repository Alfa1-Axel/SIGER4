// Supabase falso, en memoria, solo con lo que usa la función announce-release: la función SQL announce_release() de la
// migración 0122, con sus mismas reglas de fondo (versión única, mismo texto, una notificación por perfil activo con cuenta).
// La lógica real de la base se prueba aparte, contra PostgreSQL, en tests/backend/db/test_0122_release_announcements.sql.
export const db = {
  releases: [], // { version, modules, commit, recipients }
  profiles: [], // { id, is_active, auth_user_id }
  notifications: [], // { profile_id, type, title, body, app_update_id }
  calls: [], // { url, key, fn, args }
  failRpc: null, // código de error a devolver
}

export function reset() {
  db.releases.length = 0
  db.profiles.length = 0
  db.notifications.length = 0
  db.calls.length = 0
  db.failRpc = null
  for (let i = 1; i <= 5; i++) db.profiles.push({ id: `p${i}`, is_active: true, auth_user_id: `u${i}` })
  db.profiles.push({ id: 'p-inactivo', is_active: false, auth_user_id: 'u-inactivo' })
  db.profiles.push({ id: 'p-sin-cuenta', is_active: true, auth_user_id: null })
}

export function createClient(url, key) {
  return {
    rpc: async (fn, args) => {
      db.calls.push({ url, key, fn, args })
      if (db.failRpc) return { data: null, error: { code: db.failRpc, message: 'detalle interno que no debe llegar a la persona' } }
      if (fn !== 'announce_release') return { data: null, error: { code: '42883', message: 'función desconocida' } }
      const existing = db.releases.find((r) => r.version === args.p_version)
      if (existing) return { data: { version: args.p_version, already_announced: true, recipients: existing.recipients }, error: null }
      const targets = db.profiles.filter((p) => p.is_active && p.auth_user_id)
      db.releases.push({ version: args.p_version, modules: args.p_modules, commit: args.p_commit, recipients: targets.length })
      for (const p of targets) {
        db.notifications.push({ profile_id: p.id, type: 'actualizacion_publicada', title: 'Nueva actualización', app_update_id: `release:${args.p_version}` })
      }
      return { data: { version: args.p_version, already_announced: false, recipients: targets.length, modules: args.p_modules }, error: null }
    },
  }
}
