import { useId } from 'react'
import { Icon } from './ui/Icon'
import { useAuth } from '../hooks/useAuth'
import {
  SUPPORT_EMAIL,
  SUPPORT_NAME,
  SUPPORT_WHATSAPP_LABEL,
  cleanSupportName,
  supportMailtoUrl,
  supportWhatsAppUrl,
} from '../config/support'

interface SupportContactProps {
  // 'card': bloque de la sección Ayuda, con los datos a la vista para copiar.
  // 'inline': solo los dos botones (más una frase opcional), para las pantallas
  // de "No tenés permiso", las respuestas de Ayuda y el ingreso.
  variant?: 'card' | 'inline'
  // Frase que va antes de los botones en la variante 'inline'.
  lead?: string
}

// Contacto directo con el Dpto. de Informática y Estadística R4: email
// (mailto:) y WhatsApp con un mensaje ya escrito. El mensaje lleva el nombre
// de quien está logueado, si se conoce, y nada más (config/support.ts).
export function SupportContact({ variant = 'card', lead }: SupportContactProps) {
  const { profile } = useAuth()
  const titleId = useId()
  const name = cleanSupportName(profile?.full_name)
  const mailto = supportMailtoUrl(name)
  const whatsapp = supportWhatsAppUrl(name)

  if (variant === 'inline') {
    return (
      <div className="support-contact-inline">
        {lead && <p className="support-contact-lead">{lead}</p>}
        <div className="support-contact-actions" role="group" aria-label={`Contactar al ${SUPPORT_NAME}`}>
          <a className="btn btn-outlined btn-sm" href={mailto}>
            <Icon name="mail" size={14} />
            Enviar email
          </a>
          <a className="btn btn-outlined btn-sm" href={whatsapp} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" size={14} />
            Contactar por WhatsApp
          </a>
        </div>
      </div>
    )
  }

  return (
    <section className="card support-contact" aria-labelledby={titleId}>
      <div className="support-contact-heading">
        <Icon name="info" size={18} />
        <h2 id={titleId} className="support-contact-title">
          ¿Necesitás ayuda?
        </h2>
      </div>
      <p className="support-contact-text">
        ¿No encontraste lo que buscabas? Escribile al {SUPPORT_NAME} contando qué querías hacer y en qué pantalla estabas.
      </p>
      <div className="support-contact-actions">
        <a className="btn btn-primary" href={mailto}>
          <Icon name="mail" size={16} />
          Enviar email
        </a>
        <a className="btn btn-outlined" href={whatsapp} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={16} />
          Contactar por WhatsApp
        </a>
      </div>
      <dl className="support-contact-data">
        <div>
          <dt>Email:</dt>
          {/* wbr: en una pantalla angosta el email se parte en la arroba, no a mitad de palabra (y al copiarlo no se agrega nada). */}
          <dd>
            {SUPPORT_EMAIL.split('@')[0]}@<wbr />
            {SUPPORT_EMAIL.split('@')[1]}
          </dd>
        </div>
        <div>
          <dt>WhatsApp:</dt>
          <dd>{SUPPORT_WHATSAPP_LABEL}</dd>
        </div>
      </dl>
    </section>
  )
}
