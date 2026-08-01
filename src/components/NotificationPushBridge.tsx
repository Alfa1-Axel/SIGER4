import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { triggerPush } from '../lib/api/pushSubscriptions'
import { useAuth } from '../hooks/useAuth'
import type { Notification } from '../types/database'

// Punto unico de disparo de push: escucha por Realtime todo insert en
// "notifications" (RLS ya filtra el resultado a lo que el perfil actual
// puede ver) y dispara el push correspondiente desde aca, sin importar si la
// notificacion la creo el propio frontend (formulario manual, reporte
// generado) o un trigger de Postgres (curso nuevo, documento nuevo, cambio de
// estado, asistencia/intervencion cargada). Evita duplicar la logica de
// disparo en cada punto de creacion de notificaciones.
//
// Se monta una sola vez (dentro de AuthProvider, en App.tsx) para mantener
// una unica suscripcion viva durante toda la sesion, sin importar en que
// pantalla este el usuario.
export function NotificationPushBridge() {
  const { profile } = useAuth()
  const playSoundRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    playSoundRef.current = () => {
      try {
        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextClass) return
        const ctx = new AudioContextClass()
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.start()
        oscillator.stop(ctx.currentTime + 0.35)
      } catch {
        // Sonido interno es una mejora opcional: si falla, no debe romper nada.
      }
    }
  }, [])

  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel('notifications-push-bridge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notification = payload.new as Notification

          playSoundRef.current?.()
          void triggerPush({
            title: notification.title,
            body: notification.body ?? undefined,
            url: '/notificaciones',
            profileId: notification.profile_id,
            regionId: notification.region_id,
            subsedeId: notification.subsede_id,
            stationId: notification.station_id,
            notificationId: notification.id,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  return null
}
