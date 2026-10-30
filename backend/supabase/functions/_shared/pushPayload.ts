// Contrato de payload compartido entre send-push y send-push-system: ambas
// funciones alimentan el mismo service worker (src/sw.ts) y deben mostrar
// exactamente el mismo comportamiento de fallback cuando title/body vienen
// vacíos -- antes esto estaba copiado a mano en los dos archivos (con un
// comentario admitiendo que había que mantenerlos sincronizados), lo que
// hacía trivial que una futura edición de texto solo tocara uno de los dos.
export const PUSH_FALLBACK_TITLE = 'SIGER4'
export const PUSH_FALLBACK_BODY = 'Tenés una notificación nueva.'

export function resolvePushTitle(title: string | null | undefined): string {
  return title?.trim() || PUSH_FALLBACK_TITLE
}

export function resolvePushBody(body: string | null | undefined): string {
  return body?.trim() || PUSH_FALLBACK_BODY
}

// TTL/urgency: sin esto, web-push no manda headers TTL/Urgency y el push
// service (FCM en Android) aplica sus propios defaults, que pueden demorar
// la entrega mientras el dispositivo está en Doze/segundo plano. urgency:
// 'high' pide entrega lo antes posible incluso bajo restricciones de
// batería; TTL:86400 (24hs) es cuánto tiempo reintenta el push service si
// el dispositivo está offline, antes de descartar el mensaje.
export const WEB_PUSH_OPTIONS = { TTL: 86400, urgency: 'high' as const }
