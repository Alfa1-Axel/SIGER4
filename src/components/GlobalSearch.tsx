import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from './ui/Icon'
import {
  MIN_SEARCH_LENGTH,
  SEARCH_MODULE_ICON,
  SEARCH_MODULE_LABEL,
  SEARCH_MODULE_ORDER,
  sanitizeSearchTerm,
  searchEverything,
} from '../lib/api/globalSearch'
import type { SearchModule, SearchOutcome, SearchResult } from '../lib/api/globalSearch'
import { fetchDepartments } from '../lib/api/departments'
import { fetchAvalesDepartments } from '../lib/api/schoolAvales'
import { fetchStations } from '../lib/api/stations'
import { useAccessContext } from '../hooks/useAccessContext'
import { OPEN_SEARCH_EVENT } from '../lib/searchControl'

const PER_MODULE = 4
const PER_MODULE_FILTERED = 20
const DEBOUNCE_MS = 300

// Nombres para los subtítulos, de lo que el usuario puede ver: sus
// departamentos (o todos, con visión regional), los de Avales si entra a
// Avales, y sus cuarteles. Se cargan una vez por usuario: si otra persona
// inicia sesión en la misma pestaña, se vuelven a pedir.
type Lookups = { departments: Map<string, string>; stations: Map<string, string> }
let lookupsCache: { key: string; promise: Promise<Lookups> } | null = null
function loadLookups(profileId: string | null, withAvales: boolean, withStations: boolean) {
  const key = `${profileId ?? ''}:${withAvales}:${withStations}`
  if (!lookupsCache || lookupsCache.key !== key) {
    const promise = Promise.all([
      fetchDepartments().catch(() => []),
      withAvales ? fetchAvalesDepartments().catch(() => []) : Promise.resolve([]),
      withStations ? fetchStations().catch(() => []) : Promise.resolve([]),
    ]).then(([deps, avalesDeps, sts]) => ({
      departments: new Map([...avalesDeps, ...deps].map((d) => [d.id, d.name])),
      stations: new Map(sts.map((s) => [s.id, s.name])),
    }))
    lookupsCache = { key, promise }
  }
  return lookupsCache.promise
}

// Botón "Buscar en SIGER4" del encabezado + paleta de búsqueda. Ctrl/Cmd + K
// la abre desde cualquier pantalla.
export function GlobalSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <>
      <button type="button" className="header-search" onClick={() => setOpen(true)} aria-label="Buscar en SIGER4" aria-haspopup="dialog">
        <Icon name="search" size={16} />
        <span className="header-search-label">Buscar en SIGER4</span>
        <kbd className="header-search-kbd">Ctrl K</kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const ctx = useAccessContext()
  const titleId = useId()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<SearchModule | 'todos'>('todos')
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const term = sanitizeSearchTerm(debounced)
  const tooShort = term.length < MIN_SEARCH_LENGTH

  useEffect(() => {
    if (tooShort) {
      setOutcome(null)
      setLoading(false)
      setError(null)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    loadLookups(ctx.profileId, ctx.hasAvalesAccess, !ctx.departmentOnly)
      .then((lookups) =>
        searchEverything(
          term,
          ctx,
          {
            departmentName: (depId) => lookups.departments.get(depId) ?? 'Departamento',
            stationName: (stId) => lookups.stations.get(stId) ?? 'Cuartel',
          },
          { limit: filter === 'todos' ? PER_MODULE : PER_MODULE_FILTERED, only: filter === 'todos' ? undefined : filter },
        ),
      )
      .then((result) => {
        if (id !== requestId.current) return
        setOutcome(result)
        setActiveIndex(0)
        // Error solo si fallaron todos los módulos consultados (la Ayuda es
        // local y nunca falla).
        const remoteOk = Object.keys(result.results).some((m) => m !== 'ayuda')
        if (result.failedModules.length > 0 && !remoteOk) setError('No pudimos buscar. Revisá tu conexión y volvé a intentar.')
      })
      .catch(() => {
        if (id === requestId.current) setError('No pudimos buscar. Revisá tu conexión y volvé a intentar.')
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [term, tooShort, filter, ctx])

  const groups = useMemo(() => {
    if (!outcome) return []
    return SEARCH_MODULE_ORDER.filter((m) => (outcome.results[m]?.length ?? 0) > 0).map((m) => ({ module: m, results: outcome.results[m] as SearchResult[] }))
  }, [outcome])
  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups])
  const total = flat.length

  const go = useCallback(
    (result: SearchResult) => {
      onClose()
      navigate(result.to)
    },
    [navigate, onClose],
  )

  function handleKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' && total > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % total)
    } else if (e.key === 'ArrowUp' && total > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + total) % total)
    } else if (e.key === 'Enter' && flat[activeIndex]) {
      e.preventDefault()
      go(flat[activeIndex])
    }
  }

  // Mantiene visible el resultado activo al moverse con el teclado.
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listId])

  const chipModules = filter === 'todos' ? groups.map((g) => g.module) : [filter]
  let index = -1

  return createPortal(
    <div className="search-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <h2 id={titleId} className="sr-only">
          Buscar en SIGER4
        </h2>
        <div className="search-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            placeholder={ctx.departmentOnly ? 'Buscar tu departamento, informes, eventos, avisos…' : 'Buscar usuarios, documentos, informes, elementos…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded={total > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={total > 0 ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button type="button" className="btn btn-ghost btn-sm search-close" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {!tooShort && (chipModules.length > 1 || filter !== 'todos') && (
          <div className="filter-bar filter-bar--scroll search-filters" role="group" aria-label="Buscar en">
            <button type="button" className="chip" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>
              Todo
            </button>
            {chipModules.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={filter === m} onClick={() => setFilter(m)}>
                {SEARCH_MODULE_LABEL[m]}
              </button>
            ))}
          </div>
        )}

        <div className="search-body" aria-live="polite">
          {tooShort && (
            <div className="search-hint">
              <p>
                Escribí al menos {MIN_SEARCH_LENGTH} letras para buscar en los módulos a los que tenés acceso:{' '}
                {ctx.departmentOnly
                  ? 'tu departamento, informes y actas, eventos de tu departamento, avales, notificaciones, ayuda y novedades.'
                  : 'usuarios, cuarteles, departamentos, informes, documentos, avales, inventario, cursos, calendario, notificaciones y novedades.'}
              </p>
              <p>
                ¿Buscás cómo hacer algo? Probá con "{ctx.departmentOnly ? 'ver informes' : 'pedir préstamo'}" o "cargar informe", o entrá al{' '}
                <Link to="/ayuda" onClick={onClose}>
                  Centro de ayuda
                </Link>
                .
              </p>
            </div>
          )}
          {!tooShort && loading && !outcome && <div className="loading-state" role="status">Buscando…</div>}
          {!tooShort && error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          {!tooShort && !loading && !error && outcome && total === 0 && (
            <div className="search-hint">
              <p>
                No encontramos resultados para <strong>“{term}”</strong>
                {filter !== 'todos' && ` en ${SEARCH_MODULE_LABEL[filter]}`}.
              </p>
              <p>Probá con menos palabras, otra forma de escribirlo (con o sin tildes), o buscá en todo SIGER4.</p>
              {filter !== 'todos' && (
                <button type="button" className="btn btn-outlined btn-sm" onClick={() => setFilter('todos')}>
                  Buscar en todo
                </button>
              )}
            </div>
          )}
          {outcome && outcome.failedModules.length > 0 && total > 0 && (
            <p className="field-help" style={{ margin: '0 0 8px' }}>
              No pudimos buscar en: {outcome.failedModules.map((m) => SEARCH_MODULE_LABEL[m]).join(', ')}.
            </p>
          )}

          {total > 0 && (
            <ul id={listId} role="listbox" className="search-results" aria-label="Resultados">
              {groups.map((g) => (
                <li key={g.module} role="presentation" className="search-group">
                  <div className="search-group-header" role="presentation">
                    <Icon name={SEARCH_MODULE_ICON[g.module]} size={14} />
                    <span>{SEARCH_MODULE_LABEL[g.module]}</span>
                  </div>
                  <ul role="presentation">
                    {g.results.map((r) => {
                      index += 1
                      const i = index
                      return (
                        <li
                          key={`${r.module}-${r.id}`}
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === activeIndex}
                          className={`search-result${i === activeIndex ? ' search-result--active' : ''}`}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => go(r)}
                        >
                          <span className="search-result-text">
                            <span className="search-result-title">{r.title}</span>
                            {r.subtitle && <span className="search-result-subtitle">{r.subtitle}</span>}
                          </span>
                          <span className="badge badge-neutral search-result-type">{SEARCH_MODULE_LABEL[r.module]}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {filter === 'todos' && g.results.length >= PER_MODULE && (
                    <button type="button" className="link-muted search-more" onClick={() => setFilter(g.module)}>
                      Ver más en {SEARCH_MODULE_LABEL[g.module]} →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="search-footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
