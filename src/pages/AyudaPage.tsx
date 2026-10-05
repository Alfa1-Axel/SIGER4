import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { HELP_ARTICLES, HELP_SECTION_LABEL, HELP_SECTION_ORDER, canSeeHelpArticle, helpArticleMatches } from '../config/helpContent'
import type { HelpSection } from '../config/helpContent'
import { useAccessContext } from '../hooks/useAccessContext'
import { openGlobalSearch } from '../lib/searchControl'

// Centro de ayuda: guías cortas para tareas reales, según lo que el rol de
// cada usuario puede hacer (src/config/helpContent.ts).
export function AyudaPage() {
  const ctx = useAccessContext()
  const { hash } = useLocation()
  const [query, setQuery] = useState('')
  const openId = hash ? decodeURIComponent(hash.slice(1)) : ''

  const visible = useMemo(() => HELP_ARTICLES.filter((a) => canSeeHelpArticle(a, ctx)), [ctx])
  const filtered = useMemo(() => visible.filter((a) => helpArticleMatches(a, query)), [visible, query])
  const sections = HELP_SECTION_ORDER.map((s) => ({ section: s, articles: filtered.filter((a) => a.section === s) })).filter((s) => s.articles.length > 0)

  // Desde la búsqueda global (/ayuda#id): abre y muestra ese artículo.
  useEffect(() => {
    if (!openId) return
    const el = document.getElementById(`ayuda-${openId}`)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [openId])

  return (
    <AppShell title="Ayuda">
      <h1 className="page-title">Centro de ayuda</h1>
      <p className="page-subtitle">Guías cortas para hacer las tareas de todos los días. Ves la ayuda de lo que tu rol puede hacer.</p>

      <div className="search-input-row help-search" role="search">
        <Icon name="search" size={16} />
        <label htmlFor="help-search" className="sr-only">
          Buscar en la ayuda
        </label>
        <input
          id="help-search"
          type="search"
          className="search-input"
          placeholder="¿Qué necesitás hacer? Ej.: pedir préstamo, subir aval"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!query && (
        <nav className="filter-bar filter-bar--scroll" aria-label="Secciones de la ayuda" style={{ marginBottom: 16 }}>
          {sections.map(({ section }) => (
            <a key={section} href={`#seccion-${section}`} className="chip">
              {HELP_SECTION_LABEL[section as HelpSection]}
            </a>
          ))}
        </nav>
      )}

      {sections.length === 0 && (
        <div className="empty-state empty-state-action">
          <span>No encontramos ayuda sobre “{query}”.</span>
          <button type="button" className="btn btn-outlined" onClick={openGlobalSearch}>
            <Icon name="search" size={16} />
            Buscar en todo SIGER4
          </button>
        </div>
      )}

      {sections.map(({ section, articles }) => (
        <section key={section} id={`seccion-${section}`} className="help-section" aria-labelledby={`titulo-${section}`}>
          <h2 id={`titulo-${section}`} className="section-title help-section-title">
            {HELP_SECTION_LABEL[section]}
          </h2>
          {articles.map((a) => (
            <details key={a.id} id={`ayuda-${a.id}`} className="help-article" open={a.id === openId || (Boolean(query) && articles.length <= 3)}>
              <summary>
                <span className="help-article-heading">
                  <strong>{a.title}</strong>
                  <span>{a.summary}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </summary>
              <div className="help-article-body">
                {a.steps && (
                  <ol className="help-steps">
                    {a.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                {a.answer && <p style={{ margin: 0 }}>{a.answer}</p>}
                {a.links && a.links.length > 0 && (
                  <div className="help-links">
                    {a.links.map((l) => (
                      <Link key={l.to} to={l.to} className="btn btn-outlined btn-sm">
                        {l.label}
                        <Icon name="arrowRight" size={14} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </section>
      ))}

      <div className="card help-contact">
        <Icon name="info" size={18} />
        <p style={{ margin: 0, fontSize: 14 }}>
          ¿No encontraste lo que buscabas? Escribile al Dpto. de Informática y Estadística R4 contando qué querías hacer y en qué
          pantalla estabas.
        </p>
      </div>
    </AppShell>
  )
}
