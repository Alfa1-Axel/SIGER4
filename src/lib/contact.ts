// Helpers de normalización de datos de contacto (teléfono, email, WhatsApp,
// web/redes, dirección) para convertirlos en links accionables (tel:,
// mailto:, wa.me, https:, Google Maps). Todo lo que no se pueda normalizar
// con confianza devuelve null -- el llamador debe mostrar el texto plano en
// ese caso, nunca forzar un link sobre un dato dudoso.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function buildMailto(email: string): string | null {
  const trimmed = email.trim()
  return isValidEmail(trimmed) ? `mailto:${trimmed}` : null
}

// Deja solo dígitos y un '+' inicial opcional (indicador de que el número
// ya viene en formato internacional).
function stripPhoneFormatting(raw: string): string {
  const trimmed = raw.trim()
  const hasLeadingPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  return hasLeadingPlus ? `+${digits}` : digits
}

// Un teléfono argentino local (fijo o celular) tiene entre 8 y 12 dígitos
// sin código de país (con característica de área incluida). Con '+' asumimos
// que ya es internacional y solo exigimos un largo razonable.
export function isValidPhone(raw: string): boolean {
  const stripped = stripPhoneFormatting(raw)
  const digits = stripped.replace(/^\+/, '')
  if (!digits) return false
  if (stripped.startsWith('+')) return digits.length >= 8 && digits.length <= 15
  return digits.length >= 8 && digits.length <= 12
}

export function buildTel(raw: string): string | null {
  if (!isValidPhone(raw)) return null
  return `tel:${stripPhoneFormatting(raw)}`
}

// Normaliza un teléfono argentino a formato internacional E.164 (+549...)
// para WhatsApp. wa.me exige el "9" que Argentina agrega para celulares en
// discado internacional -- si el número ya trae +54 sin el 9, se lo
// insertamos (regla salvo que ya sea explícitamente otro país).
export function normalizePhoneForWhatsApp(raw: string): string | null {
  if (!isValidPhone(raw)) return null
  const stripped = stripPhoneFormatting(raw)

  if (stripped.startsWith('+')) {
    const digits = stripped.slice(1)
    if (digits.startsWith('54') && !digits.startsWith('549')) {
      return `+549${digits.slice(2)}`
    }
    return `+${digits}`
  }

  // Sin código de país: asumimos Argentina. Si ya viene con el 15 de
  // celular local, se lo sacamos (no tiene sentido en formato internacional).
  const local = stripped.replace(/^0/, '').replace(/^(\d{2,4})15/, '$1')
  return `+549${local}`
}

export function buildWhatsAppUrl(raw: string, message?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(raw)
  if (!normalized) return null
  const number = normalized.replace('+', '')
  const query = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${number}${query}`
}

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (DOMAIN_RE.test(trimmed)) return `https://${trimmed}`
  return null
}

// Instagram suele cargarse como "@usuario" en vez de una URL -- caso puntual
// de handle de red social, no un dominio genérico.
export function buildInstagramUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const handle = trimmed.replace(/^@/, '')
  if (!/^[a-z0-9._]{1,30}$/i.test(handle)) return null
  return `https://instagram.com/${handle}`
}

// Para campos de "contacto" libres (una sola caja de texto que puede traer
// un teléfono o un email indistintamente, ej. InventoryItem.contact_info,
// Department.contact_info). Devuelve qué tipo de link corresponde, o 'text'
// si no se puede reconocer con confianza -- nunca se inventa un formato.
export function detectContactKind(raw: string): 'email' | 'phone' | 'text' {
  const trimmed = raw.trim()
  if (isValidEmail(trimmed)) return 'email'
  if (isValidPhone(trimmed)) return 'phone'
  return 'text'
}

// Dirección -> Google Maps. No inventamos coordenadas; solo armamos una
// búsqueda de texto con lo que ya está cargado (dirección + opcionalmente
// zona/ciudad para desambiguar).
export function buildMapsUrl(address: string, context?: string): string | null {
  const trimmed = address.trim()
  if (trimmed.length < 6) return null
  const query = context ? `${trimmed}, ${context}` : trimmed
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
