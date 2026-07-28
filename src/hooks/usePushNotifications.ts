import { useCallback, useEffect, useState } from 'react'
import { removePushSubscription, savePushSubscription } from '../lib/api/pushSubscriptions'

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

interface UsePushNotificationsResult {
  status: PushSupportStatus
  permission: NotificationPermission | null
  subscribed: boolean
  loading: boolean
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
}

// El sistema debe seguir funcionando igual si el usuario no acepta permisos o
// el navegador no soporta push: las notificaciones internas (tabla
// notifications) no dependen de esto en absoluto.
export function usePushNotifications(profileId: string | undefined): UsePushNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof Notification !== 'undefined' ? Notification.permission : null,
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  const status: PushSupportStatus = !supported ? 'unsupported' : !VAPID_PUBLIC_KEY ? 'unconfigured' : 'ready'

  useEffect(() => {
    if (status !== 'ready') return
    let active = true
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setSubscribed(!!subscription)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [status])

  const enable = useCallback(async () => {
    if (status !== 'ready' || !profileId) return
    setLoading(true)
    setError(null)
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== 'granted') {
        setError('No se otorgó el permiso de notificaciones. Podés habilitarlo desde la configuración del navegador.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToApplicationServerKey(VAPID_PUBLIC_KEY as string),
        })
      }
      await savePushSubscription(profileId, subscription)
      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos activar las notificaciones push.')
    } finally {
      setLoading(false)
    }
  }, [status, profileId])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos desactivar las notificaciones push.')
    } finally {
      setLoading(false)
    }
  }, [status])

  return { status, permission, subscribed, loading, error, enable, disable }
}
