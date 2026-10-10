// Copia local de los borradores (sessionStorage de esta pestaña). Es solo un
// respaldo mientras el borrador no llegó al servidor: separada por persona,
// formulario y carga, sin archivos ni credenciales, y se borra al cerrar
// sesión, al cambiar de cuenta y al cerrar la pestaña.

export interface LocalBackup {
  savedAt: string
  payload: unknown
  // true = el servidor ya tiene este contenido; false = solo está en este dispositivo.
  synced: boolean
}

const LOCAL_PREFIX = 'siger4:draft2:'
const MAX_LOCAL_BYTES = 120000

export function localDraftKey(profileId: string, formKey: string, contextKey: string): string {
  return `${LOCAL_PREFIX}${profileId}:${formKey}:${contextKey}`
}

export function readLocalDraft(key: string): LocalBackup | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as LocalBackup) : null
  } catch {
    return null
  }
}

export function writeLocalDraft(key: string, backup: LocalBackup) {
  try {
    const raw = JSON.stringify(backup)
    if (raw.length > MAX_LOCAL_BYTES) return
    sessionStorage.setItem(key, raw)
  } catch {
    // Sin sessionStorage (modo privado, cuota): queda solo el borrador del servidor.
  }
}

export function removeLocalDraft(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignorar
  }
}

// En un dispositivo compartido nunca se muestran borradores de otra cuenta: al
// abrir un formulario se borran las copias locales de cualquier otra persona.
export function purgeLocalDraftsOfOthers(profileId: string | null) {
  try {
    const own = profileId ? `${LOCAL_PREFIX}${profileId}:` : null
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(LOCAL_PREFIX) && !(own && key.startsWith(own))) sessionStorage.removeItem(key)
    }
  } catch {
    // ignorar
  }
}

// Se llama al cerrar sesión: ninguna copia local sobrevive a la cuenta.
export function clearAllLocalDrafts() {
  purgeLocalDraftsOfOthers(null)
}
