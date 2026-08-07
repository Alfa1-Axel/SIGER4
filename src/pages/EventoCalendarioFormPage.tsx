import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { createCalendarEvent, fetchCalendarEventById, updateCalendarEvent } from '../lib/api/calendar'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import type { CalendarEventType, Region, Station, Subsede } from '../types/database'
import { EVENT_TYPE_LABEL } from './CalendarioPage'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

type ScopeTarget = 'region' | 'subsede' | 'station' | 'escuela'

const SCOPELESS_TYPES: CalendarEventType[] = ['escuela', 'capacitacion']

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventoCalendarioFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision')
  const isRegionalRole = hasRole('secretario_regional')
  const isEscuelaRole = hasRole('director_escuela', 'instructor')
  const canCreate = isAdmin || isStationRole || isRegionalRole || isEscuelaRole
  // El cuartel del usuario puede venir de profiles.station_id (asignación
  // directa) o de una fila en user_scopes con scope_type='station' (mismo
  // criterio que my_station_ids() en la base, ver 0026) — usar solo
  // profile.station_id deja a estos últimos sin poder cargar el station_id
  // real al crear un evento "de mi cuartel", y el insert termina violando
  // calendar_events_single_scope (ningún alcance seteado).
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? ''

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<CalendarEventType>(
    isEscuelaRole && !isAdmin && !isRegionalRole ? 'escuela' : isStationRole && !isAdmin && !isRegionalRole && !isEscuelaRole ? 'cuartel' : 'regional',
  )
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [scopeTarget, setScopeTarget] = useState<ScopeTarget>('station')
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [notifyOnCreate, setNotifyOnCreate] = useState(false)
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stationLocked = isStationRole && !isAdmin && !isRegionalRole && !isEscuelaRole
  const isScopeless = SCOPELESS_TYPES.includes(eventType)
  // El <select> de tipo solo debe ofrecer los tipos que la RLS realmente le
  // va a aceptar a este rol (calendar_events_write_admin_regional_station_escuela,
  // migración 0051) -- mostrar los 9 tipos a todos hacía que, por ejemplo, un
  // director_escuela pudiera elegir "Regional" y que el insert se rechazara
  // recién al guardar. is_escuela_role() (director_escuela/instructor) SOLO
  // puede escribir escuela/capacitacion; el resto de los roles (regional o
  // de cuartel) solo puede escribir los tipos NO-escuela.
  // En edición, si el evento ya tenía un tipo fuera de lo que este rol puede
  // elegir (ej. lo cargó un admin), se agrega igual como opción -- si no,
  // el <select> quedaría sin ninguna opción seleccionada y guardar sin tocar
  // el campo cambiaría el tipo del evento sin que el usuario lo haya elegido.
  const roleAllowedEventTypes: CalendarEventType[] = isAdmin
    ? (Object.keys(EVENT_TYPE_LABEL) as CalendarEventType[])
    : isEscuelaRole
      ? SCOPELESS_TYPES
      : (Object.keys(EVENT_TYPE_LABEL) as CalendarEventType[]).filter((t) => !SCOPELESS_TYPES.includes(t))
  const allowedEventTypes: CalendarEventType[] = roleAllowedEventTypes.includes(eventType)
    ? roleAllowedEventTypes
    : [eventType, ...roleAllowedEventTypes]

  useEffect(() => {
    if (!canCreate) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations()]).then(([regionsData, subsedesData, stationsData]) => {
      if (!active) return
      setRegions(regionsData)
      setSubsedes(subsedesData)
      setStations(stationsData)
      if (!stationLocked) setRegionId((prev) => prev || regionsData[0]?.id || '')
    })
    return () => {
      active = false
    }
  }, [canCreate, stationLocked])

  useEffect(() => {
    if (!id) return
    let active = true
    fetchCalendarEventById(id).then((event) => {
      if (!active || !event) return
      setTitle(event.title)
      setDescription(event.description ?? '')
      setEventType(event.event_type)
      setStartsAt(toDatetimeLocal(event.starts_at))
      setEndsAt(event.ends_at ? toDatetimeLocal(event.ends_at) : '')
      setAllDay(event.all_day)
      setNotifyOnCreate(event.notify_on_create)
      setNotifyBeforeMinutes(event.notify_before_minutes ? String(event.notify_before_minutes) : '')
      if (event.station_id) {
        setScopeTarget('station')
        setStationId(event.station_id)
      } else if (event.subsede_id) {
        setScopeTarget('subsede')
        setSubsedeId(event.subsede_id)
      } else if (event.region_id) {
        setScopeTarget('region')
        setRegionId(event.region_id)
      } else {
        setScopeTarget('escuela')
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  // Si el tipo elegido es de Escuela, el alcance territorial no aplica (igual
  // que courses: Escuela Regional es regional-wide por definición).
  useEffect(() => {
    if (isScopeless) setScopeTarget('escuela')
    else if (scopeTarget === 'escuela') setScopeTarget(stationLocked ? 'station' : 'region')
  }, [isScopeless, stationLocked, scopeTarget])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isScopeless) {
      if (scopeTarget === 'region' && !regionId) return setError('Seleccioná la región destino.')
      if (scopeTarget === 'subsede' && !subsedeId) return setError('Seleccioná la subsede destino.')
      if (scopeTarget === 'station' && !stationLocked && !stationId) return setError('Seleccioná el cuartel destino.')
      if (scopeTarget === 'station' && stationLocked && !myStationId) {
        return setError('No pudimos determinar tu cuartel asignado. Contactá a un administrador.')
      }
    }
    if (!startsAt) return setError('Ingresá la fecha/hora de inicio.')

    setSubmitting(true)
    try {
      const input = {
        title,
        description: description || null,
        event_type: eventType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        all_day: allDay,
        region_id: isScopeless ? null : scopeTarget === 'region' ? regionId : null,
        subsede_id: isScopeless ? null : scopeTarget === 'subsede' ? subsedeId : null,
        station_id: isScopeless ? null : scopeTarget === 'station' ? (stationLocked ? myStationId || null : stationId) : null,
        notify_on_create: notifyOnCreate,
        notify_before_minutes: notifyBeforeMinutes ? Number(notifyBeforeMinutes) : null,
      }
      if (isEditing && id) {
        await updateCalendarEvent(id, input)
        navigate(`/calendario/${id}`)
      } else {
        const created = await createCalendarEvent(input)
        navigate(`/calendario/${created.id}`)
      }
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el evento.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canCreate) {
    return (
      <AppShell title="Calendario">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'cargar'} eventos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Evento' : 'Nuevo Evento'}>
      <h1 className="page-title">{isEditing ? 'Editar Evento' : 'Nuevo Evento'}</h1>
      <p className="page-subtitle">Cargá un evento institucional, de cuartel, de Escuela o un vencimiento.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del evento…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="title">Título</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunión de comisión, vencimiento de matafuegos..." />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="eventType">Tipo</label>
              <select id="eventType" value={eventType} onChange={(e) => setEventType(e.target.value as CalendarEventType)}>
                {allowedEventTypes.map((value) => (
                  <option key={value} value={value}>
                    {EVENT_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 20 }}>
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 'auto' }} />
                Todo el día
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="startsAt">Inicio</label>
              <input id="startsAt" type={allDay ? 'date' : 'datetime-local'} required value={allDay ? startsAt.slice(0, 10) : startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="endsAt">Fin (opcional)</label>
              <input id="endsAt" type={allDay ? 'date' : 'datetime-local'} value={allDay ? endsAt.slice(0, 10) : endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="description">Descripción (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {!isScopeless && (
            <div className="field">
              <label>Alcance</label>
              {stationLocked ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Este evento va a quedar dentro de tu propio cuartel.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(['region', 'subsede', 'station'] as ScopeTarget[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setScopeTarget(option)}
                        className={`btn ${scopeTarget === option ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        {option === 'region' ? 'Regional' : option === 'subsede' ? 'Subsede' : 'Cuartel'}
                      </button>
                    ))}
                  </div>
                  {scopeTarget === 'region' && (
                    <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                      <option value="">Seleccionar región</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {scopeTarget === 'subsede' && (
                    <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
                      <option value="">Seleccionar subsede</option>
                      {subsedes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {scopeTarget === 'station' && (
                    <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                      <option value="">Seleccionar cuartel</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
          )}

          {isScopeless && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Los eventos de Escuela/Capacitación son regionales por definición, sin alcance territorial propio.
            </p>
          )}

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnCreate} onChange={(e) => setNotifyOnCreate(e.target.checked)} style={{ width: 'auto' }} />
              Notificar al crear
            </label>
          </div>

          <div className="field">
            <label htmlFor="notifyBefore">Recordatorio previo, en minutos (opcional)</label>
            <input
              id="notifyBefore"
              type="number"
              min={1}
              value={notifyBeforeMinutes}
              onChange={(e) => setNotifyBeforeMinutes(e.target.value)}
              placeholder="Ej: 60 (avisa 1 hora antes)"
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
