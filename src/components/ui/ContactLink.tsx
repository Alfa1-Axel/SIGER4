import type { ReactNode } from 'react'
import { Icon } from './Icon'
import {
  buildInstagramUrl,
  buildMailto,
  buildMapsUrl,
  buildTel,
  buildWhatsAppUrl,
  detectContactKind,
  normalizeUrl,
} from '../../lib/contact'

type ContactKind = 'email' | 'phone' | 'whatsapp' | 'url' | 'address' | 'instagram' | 'auto'
type ResolvedKind = Exclude<ContactKind, 'auto'>

interface ContactLinkProps {
  kind: ContactKind
  value: string
  label?: ReactNode
  /** Para direcciones: texto adicional (ciudad/zona) para desambiguar la búsqueda en Maps. */
  mapsContext?: string
  /** Clases adicionales, ej. para adaptar el color sobre un fondo de imagen. */
  className?: string
}

// 'auto' es para campos de texto libre que pueden traer un teléfono o un
// email indistintamente (ej. contact_info de departamentos/inventario).
function resolveKind(kind: ContactKind, value: string): ResolvedKind | null {
  if (kind !== 'auto') return kind
  const detected = detectContactKind(value)
  return detected === 'text' ? null : detected
}

function resolveHref(kind: ResolvedKind, value: string, mapsContext?: string): string | null {
  switch (kind) {
    case 'email':
      return buildMailto(value)
    case 'phone':
      return buildTel(value)
    case 'whatsapp':
      return buildWhatsAppUrl(value)
    case 'url':
      return normalizeUrl(value)
    case 'instagram':
      return buildInstagramUrl(value)
    case 'address':
      return buildMapsUrl(value, mapsContext)
    default:
      return null
  }
}

const ICON_BY_KIND: Record<ResolvedKind, string> = {
  email: 'mail',
  phone: 'phone',
  whatsapp: 'whatsapp',
  url: 'globe',
  instagram: 'globe',
  address: 'mapPin',
}

const EXTERNAL_KINDS: ResolvedKind[] = ['whatsapp', 'url', 'instagram', 'address']

/**
 * Muestra un dato de contacto (email/teléfono/WhatsApp/web/dirección) como
 * link accionable cuando se puede normalizar con confianza; si no, cae a
 * texto plano -- nunca fuerza un link sobre un dato dudoso.
 */
export function ContactLink({ kind, value, label, mapsContext, className }: ContactLinkProps) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const content = label ?? trimmed
  const resolvedKind = resolveKind(kind, trimmed)
  const href = resolvedKind ? resolveHref(resolvedKind, trimmed, mapsContext) : null

  if (!resolvedKind || !href) {
    return <span className="contact-value">{content}</span>
  }

  const isExternal = EXTERNAL_KINDS.includes(resolvedKind)

  return (
    <a
      className={className ? `contact-link ${className}` : 'contact-link'}
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Icon name={ICON_BY_KIND[resolvedKind]} size={14} />
      <span>{content}</span>
    </a>
  )
}
