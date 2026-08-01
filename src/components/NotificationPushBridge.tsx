import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { triggerPush } from '../lib/api/pushSubscriptions'
import { useAuth } from '../hooks/useAuth'
import type { Notification } from '../types/database'

// Roles autorizados a disparar push de alcance masivo (region/subsede/
// cuartel), espejo exacto de can_send_push_scope() en la base (migración
// 0025_push_authorization_and_dedup.sql). Se replica acá para que el cliente
// ni siquiera intente llamar a send-push cuando sabe de antemano que el
// backend lo va a rechazar con 403 — evita ruido de errores en consola para
// la mayoría de los usuarios (roles de cuartel), que nunca tienen permiso de
// alcance masivo.
const PUSH_SCOPE_ROLES = ['informatica_r4', 'integrante_informatica', 'secretario_regional', 'director_escuela', 'instructor'] as const

// Punto unico de disparo de push: escucha por Realtime todo insert en
// "notifications" (RLS ya filtra el resultado a lo que el perfil actual
// puede ver) y dispara el push correspondiente desde aca, sin importar si la
// notificacion la creo el propio frontend (formulario manual, reporte
// generado) o un trigger de Postgres (curso nuevo, documento nuevo, cambio de
// estado, asistencia/intervencion cargada). Evita duplicar la logica de
// disparo en cada punto de creacion de notificaciones.
//
// send-push deduplica de forma atomica por notification_id (el primer
// pedido que llega gana, el resto recibe duplicate:true sin reenviar nada),
// asi que aunque varios navegadores con permiso de alcance masivo esten
// conectados a la vez, el push real se manda una sola vez. Pero un usuario
// SIN permiso de alcance masivo (la mayoria: roles de cuartel) nunca deberia
// ni intentarlo — antes se intentaba siempre y el backend respondia 403 en
// cada notificacion, ensuciando la consola sin ningun beneficio.
//
// Se monta una sola vez (dentro de AuthProvider, en App.tsx) para mantener
// una unica suscripcion viva durante toda la sesion, sin importar en que
// pantalla este el usuario.
export function NotificationPushBridge() {
  const { profile, roles } = useAuth()
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

          // Alcance puntual al propio perfil: siempre permitido (mismo
          // criterio que can_send_push_scope() en la base). Alcance masivo
          // (region/subsede/cuartel): solo si el rol actual tiene permiso —
          // si no, ni se llama a send-push, para no generar un 403 esperado
          // en la consola de cada usuario de cuartel en cada notificación.
          const isSelfScope = notification.profile_id === profile.id
          const canSendMassScope = PUSH_SCOPE_ROLES.some((r) => roles.includes(r))
          if (!isSelfScope && !canSendMassScope) return

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
  }, [profile, roles])

  return null
}
