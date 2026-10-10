import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { deleteFormDraft, fetchFormDraft, saveFormDraft } from '../lib/api/formDrafts'
import type { DraftFormKey } from '../lib/api/formDrafts'
import { describeSupabaseError, postgrestCode } from '../lib/api/errors'
import { localDraftKey, purgeLocalDraftsOfOthers, readLocalDraft, removeLocalDraft, writeLocalDraft } from '../lib/localDrafts'

// Autoguardado de un formulario como borrador (migración 0113).
//
// - Guarda en el servidor (tabla form_drafts, solo visible para su dueño) unos
//   segundos después de la última tecla; no hay un pedido por tecla.
// - Mientras tanto guarda una copia en sessionStorage de esta pestaña, separada
//   por persona, formulario y carga, para sobrevivir a una recarga (Android
//   recarga la app cuando se abre el selector de archivos) o a un corte de red.
//   Esa copia NO es "guardado": mientras no llegó al servidor, el estado lo dice.
// - Al volver al formulario ofrece recuperar o descartar lo que había.
// - No guarda archivos ni contraseñas. Un borrador no publica nada: publicar es
//   el guardado normal del formulario; después de que se confirma, la pantalla
//   llama a resolve().

export type DraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict' | 'unavailable'

export interface RecoveredDraft<T> {
  payload: T
  updatedAt: string
  // 'servidor': ya estaba guardado allá. 'dispositivo': solo estaba en esta
  // pestaña y nunca llegó al servidor.
  source: 'servidor' | 'dispositivo'
  recordId: string | null
  baseVersion: number | null
}

export type DraftConflictKind = 'newer' | 'gone'

interface Options<T extends object> {
  formKey: DraftFormKey
  // Qué carga es dentro del formulario: 'nuevo:<contexto>' o 'edit:<id>'.
  contextKey: string
  // Campos del formulario que forman el borrador (solo texto y valores simples).
  value: T
  // false mientras el formulario carga o ya no corresponde guardar.
  enabled: boolean
  recordId?: string | null
  baseVersion?: number | null
  debounceMs?: number
  maxWaitMs?: number
}

const BACKOFF_MS = [5000, 15000, 30000, 60000]

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function looksLikeExpiredSession(err: unknown): boolean {
  const text = String((err as { message?: unknown } | null)?.message ?? '')
  const code = (err as { status?: unknown } | null)?.status
  return code === 401 || /jwt|token.*expired|not authenticated|invalid claim/i.test(text)
}

export function useFormDraft<T extends object>({
  formKey,
  contextKey,
  value,
  enabled,
  recordId = null,
  baseVersion = null,
  debounceMs = 2500,
  maxWaitMs = 15000,
}: Options<T>) {
  const { profile } = useAuth()
  const profileId = profile?.id ?? null

  const serialized = useMemo(() => JSON.stringify(value), [value])
  const valueRef = useRef(value)
  valueRef.current = value
  const serializedRef = useRef(serialized)
  serializedRef.current = serialized

  const [status, setStatus] = useState<DraftStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<RecoveredDraft<T> | null>(null)
  const [conflict, setConflict] = useState<DraftConflictKind | null>(null)

  const baselineRef = useRef<string | null>(null)
  const syncedRef = useRef<string | null>(null)
  const revisionRef = useRef(0)
  const clientRecordIdRef = useRef<string>(newId())
  const resolvedRef = useRef(false)
  const pausedRef = useRef(false)
  const unavailableRef = useRef(false)
  const savingRef = useRef(false)
  const savePendingRef = useRef(false)
  const attemptRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  const retryRef = useRef<number | null>(null)
  const firstDirtyRef = useRef<number | null>(null)
  const loadedRef = useRef(false)
  const recoveredRef = useRef<RecoveredDraft<T> | null>(null)
  recoveredRef.current = recovered

  const key = profileId ? localDraftKey(profileId, formKey, contextKey) : null
  const keyRef = useRef(key)
  keyRef.current = key
  const recordIdRef = useRef(recordId)
  recordIdRef.current = recordId
  const baseVersionRef = useRef(baseVersion)
  baseVersionRef.current = baseVersion

  const clearTimers = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (retryRef.current) window.clearTimeout(retryRef.current)
    debounceRef.current = null
    retryRef.current = null
    firstDirtyRef.current = null
  }, [])

  // ---- guardado en el servidor ----
  const save = useCallback(async () => {
    if (resolvedRef.current || pausedRef.current || unavailableRef.current || !loadedRef.current) return
    if (savingRef.current) {
      savePendingRef.current = true
      return
    }
    const sentJson = serializedRef.current
    if (sentJson === syncedRef.current) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline')
      return
    }
    savingRef.current = true
    savePendingRef.current = false
    setStatus('saving')
    setErrorMessage(null)
    try {
      const saved = await saveFormDraft({
        formKey,
        contextKey,
        recordId: recordIdRef.current ?? null,
        clientRecordId: clientRecordIdRef.current,
        baseVersion: baseVersionRef.current ?? null,
        payload: JSON.parse(sentJson) as Record<string, unknown>,
        expectedRevision: revisionRef.current,
      })
      if (resolvedRef.current) return
      revisionRef.current = saved.revision
      syncedRef.current = sentJson
      attemptRef.current = 0
      setLastSavedAt(new Date(saved.updated_at))
      if (keyRef.current) writeLocalDraft(keyRef.current, { savedAt: saved.updated_at, payload: JSON.parse(sentJson), synced: true })
      if (serializedRef.current === sentJson) {
        setStatus('saved')
      } else {
        // Se siguió escribiendo mientras se guardaba: queda otro guardado pendiente.
        setStatus('dirty')
        savePendingRef.current = true
      }
    } catch (err) {
      if (resolvedRef.current) return
      const code = postgrestCode(err)
      if (code === 'P0409') {
        const hint = String((err as { hint?: unknown }).hint ?? '')
        pausedRef.current = true
        setConflict(hint === 'gone' ? 'gone' : 'newer')
        setStatus('conflict')
        clearTimers()
      } else if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01') {
        // La migración 0113 todavía no está aplicada: solo queda la copia local.
        unavailableRef.current = true
        setStatus('unavailable')
        clearTimers()
      } else if (code === '22023') {
        unavailableRef.current = true
        setErrorMessage(describeSupabaseError(err))
        setStatus('unavailable')
        clearTimers()
      } else {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        setStatus(offline ? 'offline' : 'error')
        setErrorMessage(
          looksLikeExpiredSession(err)
            ? 'Tu sesión venció. Volvé a ingresar: lo que escribiste sigue en esta pantalla.'
            : describeSupabaseError(err, 'No pudimos guardar el borrador.'),
        )
        // Reintento con espera creciente, sin saturar al servidor.
        const wait = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)]
        attemptRef.current += 1
        if (retryRef.current) window.clearTimeout(retryRef.current)
        retryRef.current = window.setTimeout(() => void save(), wait)
      }
    } finally {
      savingRef.current = false
      if (savePendingRef.current && !pausedRef.current && !resolvedRef.current) {
        savePendingRef.current = false
        void save()
      }
    }
  }, [formKey, contextKey, clearTimers])

  const saveRef = useRef(save)
  saveRef.current = save

  // ---- carga inicial: ¿hay algo para recuperar? ----
  useEffect(() => {
    if (!enabled || loadedRef.current) return
    if (!profileId) return
    loadedRef.current = true
    baselineRef.current = serializedRef.current
    syncedRef.current = serializedRef.current
    purgeLocalDraftsOfOthers(profileId)
    let active = true
    const local = key ? readLocalDraft(key) : null
    ;(async () => {
      let server = null as Awaited<ReturnType<typeof fetchFormDraft>>
      try {
        server = await fetchFormDraft(formKey, contextKey)
      } catch (err) {
        const code = postgrestCode(err)
        if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01') {
          unavailableRef.current = true
          if (active) setStatus('unavailable')
        }
      }
      if (!active) return
      if (server) {
        revisionRef.current = server.revision
        if (server.client_record_id) clientRecordIdRef.current = server.client_record_id
      }
      const serverTime = server ? Date.parse(server.updated_at) : 0
      const localTime = local && !local.synced ? Date.parse(local.savedAt) : 0
      let candidate: RecoveredDraft<T> | null = null
      if (localTime > serverTime && local) {
        candidate = {
          payload: local.payload as T,
          updatedAt: local.savedAt,
          source: 'dispositivo',
          recordId: server?.record_id ?? recordIdRef.current ?? null,
          baseVersion: server?.base_version ?? baseVersionRef.current ?? null,
        }
      } else if (server) {
        candidate = {
          payload: server.payload as T,
          updatedAt: server.updated_at,
          source: 'servidor',
          recordId: server.record_id,
          baseVersion: server.base_version,
        }
      }
      // Un borrador igual a lo que ya está en pantalla no hay nada que recuperar.
      if (candidate && JSON.stringify(candidate.payload) === baselineRef.current) {
        if (server) void deleteFormDraft(formKey, contextKey).then(() => (revisionRef.current = 0)).catch(() => undefined)
        if (key) removeLocalDraft(key)
        candidate = null
      }
      if (candidate) {
        setRecovered(candidate)
        setLastSavedAt(server ? new Date(server.updated_at) : null)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, profileId, formKey, contextKey])

  // ---- cambios del formulario ----
  useEffect(() => {
    if (!loadedRef.current || resolvedRef.current) return
    if (serialized === syncedRef.current) {
      // Volvió a estar igual a lo ya guardado.
      if (!savingRef.current && status === 'dirty') setStatus(lastSavedAt ? 'saved' : 'idle')
      return
    }
    // Copia local inmediata (sobrevive a una recarga de la pestaña).
    if (keyRef.current) writeLocalDraft(keyRef.current, { savedAt: new Date().toISOString(), payload: JSON.parse(serialized), synced: false })
    if (recoveredRef.current) return // espera la decisión de la persona sobre el borrador viejo
    if (pausedRef.current || unavailableRef.current) return
    if (!savingRef.current) setStatus((current) => (current === 'offline' || current === 'error' ? current : 'dirty'))
    if (firstDirtyRef.current === null) firstDirtyRef.current = Date.now()
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const waited = Date.now() - firstDirtyRef.current
    const delay = Math.max(0, Math.min(debounceMs, maxWaitMs - waited))
    debounceRef.current = window.setTimeout(() => {
      firstDirtyRef.current = null
      void save()
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized])

  // ---- red, pestaña oculta y cierre ----
  useEffect(() => {
    function handleOnline() {
      if (pausedRef.current || resolvedRef.current) return
      attemptRef.current = 0
      void save()
    }
    function handleVisibility() {
      if (document.visibilityState === 'hidden' && serializedRef.current !== syncedRef.current) void save()
    }
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [save])

  const hasUnsavedChanges =
    !resolvedRef.current &&
    loadedRef.current &&
    serialized !== syncedRef.current &&
    (status === 'dirty' || status === 'saving' || status === 'error' || status === 'offline' || status === 'conflict' || status === 'unavailable')

  useEffect(() => {
    if (!hasUnsavedChanges) return
    function warn(event: Event) {
      // El aviso nativo del navegador al cerrar la pestaña con cambios sin enviar.
      event.preventDefault()
      ;(event as unknown as { returnValue: string }).returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  // Al salir de la pantalla con cambios sin enviar, un último intento.
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      if (retryRef.current) window.clearTimeout(retryRef.current)
      if (!resolvedRef.current && loadedRef.current && serializedRef.current !== syncedRef.current && !pausedRef.current) void saveRef.current()
    }
  }, [])

  // ---- acciones que usa la pantalla ----

  // La persona eligió recuperar: devuelve el contenido para que el formulario lo cargue.
  const acceptRecovered = useCallback((): RecoveredDraft<T> | null => {
    const current = recoveredRef.current
    if (!current) return null
    setRecovered(null)
    // Lo recuperado cuenta como ya guardado si venía del servidor; si venía de la copia local, falta mandarlo.
    syncedRef.current = current.source === 'servidor' ? JSON.stringify(current.payload) : syncedRef.current
    setStatus(current.source === 'servidor' ? 'saved' : 'dirty')
    return current
  }, [])

  const discard = useCallback(async () => {
    clearTimers()
    setRecovered(null)
    setConflict(null)
    pausedRef.current = false
    if (keyRef.current) removeLocalDraft(keyRef.current)
    revisionRef.current = 0
    syncedRef.current = baselineRef.current
    clientRecordIdRef.current = newId()
    setStatus('idle')
    setLastSavedAt(null)
    try {
      await deleteFormDraft(formKey, contextKey)
    } catch {
      // Si no se pudo borrar, vence solo a los 30 días y no se vuelve a ofrecer a quien ya lo descartó en esta pestaña.
    }
  }, [formKey, contextKey, clearTimers])

  // La publicación se confirmó: se cierra el borrador. Sigue en segundo plano
  // aunque la pantalla ya navegó.
  const resolve = useCallback(async () => {
    resolvedRef.current = true
    clearTimers()
    if (keyRef.current) removeLocalDraft(keyRef.current)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await deleteFormDraft(formKey, contextKey)
        return
      } catch {
        await new Promise((resolveWait) => window.setTimeout(resolveWait, 1000 * (attempt + 1)))
      }
    }
  }, [formKey, contextKey, clearTimers])

  const saveNow = useCallback(async () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = null
    firstDirtyRef.current = null
    await save()
  }, [save])

  const retryNow = useCallback(() => {
    attemptRef.current = 0
    if (retryRef.current) window.clearTimeout(retryRef.current)
    void save()
  }, [save])

  // Otra pestaña guardó un borrador más nuevo: seguir con este (lo pisa) o traer el otro.
  const overwriteOtherDraft = useCallback(async () => {
    try {
      const server = await fetchFormDraft(formKey, contextKey)
      revisionRef.current = server ? server.revision : 0
    } catch {
      return
    }
    pausedRef.current = false
    setConflict(null)
    attemptRef.current = 0
    await save()
  }, [formKey, contextKey, save])

  const loadOtherDraft = useCallback(async (): Promise<RecoveredDraft<T> | null> => {
    try {
      const server = await fetchFormDraft(formKey, contextKey)
      pausedRef.current = false
      setConflict(null)
      if (!server) {
        revisionRef.current = 0
        syncedRef.current = null
        setStatus('dirty')
        return null
      }
      revisionRef.current = server.revision
      syncedRef.current = JSON.stringify(server.payload)
      setStatus('saved')
      return {
        payload: server.payload as T,
        updatedAt: server.updated_at,
        source: 'servidor',
        recordId: server.record_id,
        baseVersion: server.base_version,
      }
    } catch {
      return null
    }
  }, [formKey, contextKey])

  return {
    status,
    lastSavedAt,
    errorMessage,
    recovered,
    conflict,
    hasUnsavedChanges,
    clientRecordId: clientRecordIdRef.current,
    acceptRecovered,
    discard,
    resolve,
    saveNow,
    retryNow,
    overwriteOtherDraft,
    loadOtherDraft,
  }
}
