import { useCallback, useEffect, useState } from 'react'
import { hasActiveSubscriptionRow, removePushSubscription, savePushSubscription } from '../lib/api/pushSubscriptions'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToApplicationServerKey(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buffer
}

export type PushSupportStatus = 'unsupported' | 'unconfigured' | 'ready'

// Estado real y visible del push para esta pestaña/dispositivo, no solo "el
// navegador tiene un objeto PushSubscription en memoria" — eso solo dice que
// el navegador recuerda haberse suscripto alguna vez, no que la suscripción
// siga siendo válida ni que el backend la tenga registrada. Se usa para
// mostrar el diagnóstico pedido en Ajustes:
//   - 'active': todo en orden, DB tiene la fila del endpoint actual.
//   - 'no_worker': no hay service worker disponible (no debería pasar en un
//     navegador que soporta push, pero se distingue por si acaso).
//   - 'denied': el usuario bloqueó el permiso de notificaciones del sitio.
//   - 'not_subscribed': nunca se activó, o se desactivó explícitamente.
//   - 'stale': el navegador tiene una suscripción local pero la fila en
//     push_subscriptions no existe (se limpió por endpoint inválido, o se
//     perdió en algún momento) — necesita reactivarse.
export type PushDiagnosticStatus = 'active' | 'no_worker' | 'denied' | 'not_subscribed' | 'stale'

interface UsePushNotificationsResult {
  status: PushSupportStatus
  diagnostic: PushDiagnosticStatus | null
  permission: NotificationPermission | null
  subscribed: boolean
  loading: boolean
  checking: boolean
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  reactivate: () => Promise<void>
}

// El sistema debe seguir funcionando igual si el usuario no acepta permisos o
// el navegador no soporta push: las notificaciones internas (tabla
// notifications) no dependen de esto en absoluto.
export function usePushNotifications(profileId: string | undefined): UsePushNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof Notification !== 'undefined' ? Notification.permission : null,
  )
  const [subscribed, setSubscribed] = useState(false)
  const [diagnostic, setDiagnostic] = useState<PushDiagnosticStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  const status: PushSupportStatus = !supported ? 'unsupported' : !VAPID_PUBLIC_KEY ? 'unconfigured' : 'ready'

  const checkStatus = useCallback(async () => {
    if (status !== 'ready') return
    setChecking(true)
    try {
      if (Notification.permission === 'denied') {
        setSubscribed(false)
        setDiagnostic('denied')
        return
      }
      const registration = await navigator.serviceWorker.ready.catch(() => null)
      if (!registration) {
        setSubscribed(false)
        setDiagnostic('no_worker')
        return
      }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setSubscribed(false)
        setDiagnostic('not_subscribed')
        return
      }
      // El navegador tiene una suscripción local: confirmar contra la base
      // que sigue registrada ahí — si no, es una suscripción "fantasma" que
      // el usuario cree activa pero que nunca va a recibir un push real.
      const active = await hasActiveSubscriptionRow(subscription.endpoint)
      setSubscribed(active)
      setDiagnostic(active ? 'active' : 'stale')
    } finally {
      setChecking(false)
    }
  }, [status])

  useEffect(() => {
    if (!profileId) return
    void checkStatus()
  }, [status, profileId, checkStatus])

  const subscribeAndSave = useCallback(
    async (registration: ServiceWorkerRegistration) => {
      if (!profileId) throw new Error('No se pudo determinar tu perfil para guardar la suscripción.')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToApplicationServerKey(VAPID_PUBLIC_KEY as string),
      })
      await savePushSubscription(profileId, subscription)
    },
    [profileId],
  )

  const enable = useCallback(async () => {
    if (status !== 'ready' || !profileId) return
    setLoading(true)
    setError(null)
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== 'granted') {
        setDiagnostic('denied')
        setError('No se otorgó el permiso de notificaciones. Podés habilitarlo desde la configuración del navegador.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        // Ya hay una suscripción local: solo hace falta confirmar que está
        // guardada en la base (puede haberse borrado ahí sin que el
        // navegador se entere, ver hasActiveSubscriptionRow).
        await savePushSubscription(profileId, existing)
      } else {
        await subscribeAndSave(registration)
      }
      await checkStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos activar las notificaciones push.')
    } finally {
      setLoading(false)
    }
  }, [status, profileId, subscribeAndSave, checkStatus])

  const disable = useCallback(async () => {
    if (status !== 'ready') return
    setLoading(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await removePushSubscription(endpoint)
      }
      setSubscribed(false)
      setDiagnostic('not_subscribed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos desactivar las notificaciones push.')
    } finally {
      setLoading(false)
    }
  }, [status])

  // Reactivar/re-suscribir: para el caso "stale" (suscripción local sin fila
  // en la base) o simplemente cuando el usuario quiere forzar un endpoint
  // nuevo (ej. sospecha que el push dejó de llegar). A diferencia de enable(),
  // siempre desuscribe primero lo que haya localmente y pide una suscripción
  // nueva — nunca reutiliza un endpoint que ya sabemos que puede estar
  // inválido o desincronizado con la base.
  const reactivate = useCallback(async () => {
    if (status !== 'ready' || !profileId) return
    setLoading(true)
    setError(null)
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== 'granted') {
        setDiagnostic('denied')
        setError('No se otorgó el permiso de notificaciones. Podés habilitarlo desde la configuración del navegador.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await removePushSubscription(existing.endpoint).catch(() => undefined)
        await existing.unsubscribe().catch(() => undefined)
      }
      await subscribeAndSave(registration)
      await checkStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos reactivar las notificaciones push.')
    } finally {
      setLoading(false)
    }
  }, [status, profileId, subscribeAndSave, checkStatus])

  return { status, diagnostic, permission, subscribed, loading, checking, error, enable, disable, reactivate }
}
