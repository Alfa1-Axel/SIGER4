import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

// Desde la migracion 0085, el push REAL (Web Push, funciona con la PWA
// cerrada) lo dispara un trigger server-side (dispatch_notification_push(),
// AFTER INSERT ON notifications) via pg_net -> send-push-system, para
// CUALQUIER notificacion del sistema. Este componente YA NO llama a
// send-push: antes era el UNICO disparador de push para notificaciones que
// no fueran el recordatorio semanal, lo que significaba que si nadie tenia
// el navegador abierto cuando se insertaba la notificacion, el push real
// nunca salia (la notificacion interna se creaba igual, la campanita la
// mostraba en la proxima visita, pero sin push -- ese era el bug real
// reportado). Ahora se limita a lo que le corresponde a un componente que
// solo existe mientras hay una pestaña abierta: sonido interno y (a futuro)
// actualizacion visual en vivo. Se monta una sola vez (dentro de
// AuthProvider, en App.tsx) para mantener una unica suscripcion viva
// durante toda la sesion, sin importar en que pantalla este el usuario.
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

    // Filtro por profile_id=eq en la propia suscripcion de Realtime (no un
    // "if" adentro del callback): esto es notificaciones self-scope
    // dirigidas a este perfil puntual. Las de alcance region/subsede/
    // cuartel no generan sonido en este canal -- son mucho mas frecuentes
    // (courses, documents, cambios de estado) y sonar por cada una para
    // cualquier usuario en ese alcance seria ruidoso; el push real (que si
    // llega para todo alcance) ya cubre el aviso importante.
    const channel = supabase
      .channel('notifications-push-bridge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profile.id}` },
        () => {
          playSoundRef.current?.()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  return null
}
