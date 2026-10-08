import { buildMailto, buildWhatsAppUrl } from '../lib/contact'

// Contacto directo con el Dpto. de Informática y Estadística R4. Es la única
// fuente: Mi perfil, las pantallas de "No tenés permiso", el Inicio de un
// departamento sin asignar y el ingreso lo usan desde acá
// (components/SupportContact.tsx).
export const SUPPORT_NAME = 'Dpto. de Informática y Estadística R4'
export const SUPPORT_EMAIL = 'dptoinformaticayestadisticar4@gmail.com'
// Celular de Argentina sin 0 ni 15: lib/contact.ts le agrega el +549.
export const SUPPORT_WHATSAPP = '3573467529'
// Cómo se lee en pantalla (el enlace usa el número sin formato).
export const SUPPORT_WHATSAPP_LABEL = '3573 467529'

const MAX_NAME_LENGTH = 60
const FALLBACK_NAME = 'usuario de SIGER4'

// Nombre para el saludo: sin saltos de línea ni caracteres de control, con
// espacios normales y un largo razonable (se corta por caracteres completos,
// no por unidades UTF-16, para no partir un emoji). Si no hay nombre, null.
export function cleanSupportName(raw: string | null | undefined): string | null {
  // Los caracteres de control (saltos de línea, tabulaciones…) pasan a espacios.
  const name = Array.from(raw ?? '')
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 32 || (code >= 127 && code <= 159) ? ' ' : ch
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return null
  return Array.from(name).slice(0, MAX_NAME_LENGTH).join('').trim() || null
}

// Mensaje precargado. Solo lleva el nombre y una frase fija: nunca el email
// de la persona, su rol, su cuartel, un identificador ni datos técnicos.
export function supportMessage(name: string | null | undefined): string {
  const who = cleanSupportName(name) ?? FALLBACK_NAME
  return `Hola soy ${who} y tengo una duda/problema con SIGER4`
}

// encodeURIComponent falla con una unidad UTF-16 suelta: ante eso se usa el
// mensaje sin nombre en vez de dejar el botón roto.
function encodeMessage(name: string | null | undefined): string {
  try {
    return encodeURIComponent(supportMessage(name))
  } catch {
    return encodeURIComponent(supportMessage(null))
  }
}

// https://wa.me/5493573467529?text=Hola%20soy%20...
export function supportWhatsAppUrl(name: string | null | undefined): string {
  const base = buildWhatsAppUrl(SUPPORT_WHATSAPP) ?? 'https://wa.me/5493573467529'
  return `${base}?text=${encodeMessage(name)}`
}

// mailto:dpto...@gmail.com?subject=...&body=...
export function supportMailtoUrl(name: string | null | undefined): string {
  const base = buildMailto(SUPPORT_EMAIL) ?? `mailto:${SUPPORT_EMAIL}`
  return `${base}?subject=${encodeURIComponent('Consulta sobre SIGER4')}&body=${encodeMessage(name)}`
}
