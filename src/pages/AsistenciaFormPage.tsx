import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  createAttendanceSummary,
  fetchAttendanceSummaryById,
  updateAttendanceSummary,
} from '../lib/api/attendance'
import { fetchStationById } from '../lib/api/stations'
import { fetchStationStaffing } from '../lib/api/stationStaffing'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'
import type { AttendanceSummary, Station, StationStaffing } from '../types/database'

type FieldErrors = Partial<Record<'periodStart' | 'periodEnd' | 'attendanceRate' | 'observations', string>>

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Mes anterior completo y mes actual hasta hoy: los dos períodos que se cargan
// casi siempre.
function previousMonth(): [string, string] {
  const now = new Date()
  return [isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoDay(new Date(now.getFullYear(), now.getMonth(), 0))]
}
function currentMonth(): [string, string] {
  const now = new Date()
  return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now)]
}

// Acepta "72,3" y "72.3": en el celular el teclado puede traer coma. null si
// no es un número.
function parseRate(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function validate(periodStart: string, periodEnd: string, rate: string, observations: string, today: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!periodStart) errors.periodStart = 'Elegí el inicio del período.'
  else if (periodStart > today) errors.periodStart = 'El período no puede empezar en el futuro.'
  if (!periodEnd) errors.periodEnd = 'Elegí el fin del período.'
  else if (periodStart && periodEnd < periodStart) errors.periodEnd = 'La fecha de fin tiene que ser igual o posterior a la de inicio.'
  if (!rate.trim()) errors.attendanceRate = 'Ingresá la tasa de asistencia.'
  else {
    const value = parseRate(rate)
    if (value === null) errors.attendanceRate = 'Ingresá un número, por ejemplo 72,3.'
    else if (value < 0 || value > 100) errors.attendanceRate = 'La tasa de asistencia tiene que estar entre 0 y 100.'
    else if (!/^-?\d+([.,]\d{1,2})?$/.test(rate.trim())) errors.attendanceRate = 'Usá hasta dos decimales, por ejemplo 72,35.'
  }
  if (observations.length > 1000) errors.observations = 'Las observaciones pueden tener hasta 1000 caracteres.'
  return errors
}

export function AsistenciaFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const isRegionalRole = hasRole('secretario_regional')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [station, setStation] = useState<Station | null>(null)
  const [existing, setExisting] = useState<AttendanceSummary | null>(null)
  // attendance_write_admin_regional_station (RLS): Informática en cualquier
  // cuartel, Secretario Regional en los de su Regional, y Presidente, Jefe de
  // Cuerpo Activo o usuario de carga solo en el suyo. Se revalida contra el
  // cuartel real del registro, no solo el rol.
  const canEdit =
    isAdmin ||
    (isRegionalRole && Boolean(station?.region_id) && station?.region_id === myRegionId) ||
    (isStationRole && Boolean(resolvedStationId) && resolvedStationId === myStationId)

  const [defaultStart, defaultEnd] = previousMonth()
  const [periodStart, setPeriodStart] = useState(isEditing ? '' : defaultStart)
  const [periodEnd, setPeriodEnd] = useState(isEditing ? '' : defaultEnd)
  const [attendanceRate, setAttendanceRate] = useState('')
  const [observations, setObservations] = useState('')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const today = isoDay(new Date())
  const fieldErrors = validate(periodStart, periodEnd, attendanceRate, observations, today)
  const show = (field: keyof FieldErrors) => (submitted || touched[field] ? fieldErrors[field] : undefined)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchAttendanceSummaryById(id).then((summary) => {
      if (!active) return
      if (!summary) {
        setLoading(false)
        return
      }
      setExisting(summary)
      setResolvedStationId(summary.station_id)
      setPeriodStart(summary.period_start)
      setPeriodEnd(summary.period_end)
      setAttendanceRate(String(summary.attendance_rate).replace('.', ','))
      setObservations(summary.observations ?? '')
    })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!resolvedStationId) return
    let active = true
    fetchStationById(resolvedStationId).then((s) => {
      if (!active) return
      setStation(s)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [resolvedStationId])

  // Efectivos cargados del cuartel: la referencia de los resúmenes nuevos.
  // undefined mientras se piden; null si el cuartel todavía no los cargó.
  const [staffing, setStaffing] = useState<StationStaffing | null | undefined>(undefined)
  useEffect(() => {
    if (!resolvedStationId) return
    let active = true
    fetchStationStaffing(resolvedStationId)
      .then((row) => active && setStaffing(row))
      .catch(() => active && setStaffing(null))
    return () => {
      active = false
    }
  }, [resolvedStationId])

  function setPeriod([start, end]: [string, string]) {
    setPeriodStart(start)
    setPeriodEnd(end)
    setTouched((t) => ({ ...t, periodStart: true, periodEnd: true }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (Object.keys(fieldErrors).length > 0) return
    setSubmitting(true)
    try {
      const input = {
        station_id: resolvedStationId,
        period_start: periodStart,
        period_end: periodEnd,
        attendance_rate: parseRate(attendanceRate) ?? 0,
        observations: observations.trim() || null,
      }
      if (isEditing && id) {
        await updateAttendanceSummary(id, input)
      } else {
        await createAttendanceSummary(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`, {
        state: { notice: `Resumen de asistencia del ${formatDay(periodStart)} al ${formatDay(periodEnd)} guardado.` },
      })
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el resumen de asistencia. Reintentá en unos segundos.'))
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEditing ? 'Editar resumen de asistencia' : 'Nuevo resumen de asistencia'

  if (loading) {
    return (
      <AppShell title="Asistencia">
        <div className="loading-state" role="status">
          Cargando…
        </div>
      </AppShell>
    )
  }

  if (isEditing && !existing) {
    return (
      <AppShell title="Asistencia">
        <div className="empty-state">No encontramos este resumen de asistencia. Puede que lo hayan eliminado.</div>
      </AppShell>
    )
  }

  if (!canEdit) {
    return (
      <AppShell title="Asistencia">
        <div className="empty-state">
          No tenés permiso para cargar asistencia de este cuartel con tu rol actual. La cargan Informática, el Secretario Regional y, en su
          propio cuartel, el Presidente de CD, el Jefe de Cuerpo Activo y el usuario de carga.
        </div>
      </AppShell>
    )
  }

  const rateError = show('attendanceRate')
  const startError = show('periodStart')
  const endError = show('periodEnd')
  const observationsError = show('observations')
  // Efectivos de referencia: los de este resumen (si ya está guardado) o los
  // que tiene hoy el cuartel cargados.
  const members = existing ? existing.total_members : staffing && staffing.total > 0 ? staffing.total : null

  return (
    <AppShell title="Asistencia">
      <Link to={`/cuarteles/${resolvedStationId}`} className="back-link">
        ← Volver a {station?.name ?? 'el cuartel'}
      </Link>
      <h1 className="page-title">{pageTitle}</h1>
      <p className="page-subtitle">
        {station ? `Cuartel ${station.name}. ` : ''}Cargá la tasa de asistencia del período.
      </p>

      <form onSubmit={handleSubmit} className="card-solid" noValidate>
        <div className="field">
          <span className="field-label">Período</span>
          {!isEditing && (
            <div className="filter-bar" style={{ marginBottom: 8 }}>
              <button type="button" className="chip" aria-pressed={periodStart === previousMonth()[0] && periodEnd === previousMonth()[1]} onClick={() => setPeriod(previousMonth())}>
                Mes pasado
              </button>
              <button type="button" className="chip" aria-pressed={periodStart === currentMonth()[0] && periodEnd === currentMonth()[1]} onClick={() => setPeriod(currentMonth())}>
                Este mes
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
              <label htmlFor="periodStart">Inicio</label>
              <input
                id="periodStart"
                type="date"
                max={today}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, periodStart: true }))}
                aria-invalid={Boolean(startError)}
                aria-describedby={startError ? 'periodStart-error' : undefined}
              />
              {startError && (
                <p id="periodStart-error" className="field-error">
                  {startError}
                </p>
              )}
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
              <label htmlFor="periodEnd">Fin</label>
              <input
                id="periodEnd"
                type="date"
                min={periodStart || undefined}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, periodEnd: true }))}
                aria-invalid={Boolean(endError)}
                aria-describedby={endError ? 'periodEnd-error' : undefined}
              />
              {endError && (
                <p id="periodEnd-error" className="field-error">
                  {endError}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="attendanceRate">Tasa de asistencia (%)</label>
          <input
            id="attendanceRate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={attendanceRate}
            onChange={(e) => setAttendanceRate(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, attendanceRate: true }))}
            placeholder="Por ejemplo 72,3"
            aria-invalid={Boolean(rateError)}
            aria-describedby={rateError ? 'attendanceRate-error' : 'attendanceRate-help'}
          />
          {rateError ? (
            <p id="attendanceRate-error" className="field-error">
              {rateError}
            </p>
          ) : (
            <p id="attendanceRate-help" className="field-help">
              De 0 a 100, con hasta dos decimales.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="observations">Observaciones (opcional)</label>
          <textarea
            id="observations"
            rows={3}
            maxLength={1000}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, observations: true }))}
            placeholder="Por ejemplo: guardias reforzadas por incendios forestales."
            aria-invalid={Boolean(observationsError)}
          />
          {observationsError && <p className="field-error">{observationsError}</p>}
        </div>

        <div className="alert alert-info" role="note">
          <span className="alert-content">
            <strong>Efectivos de referencia:</strong>{' '}
            {members ? (
              <>
                {members} {members === 1 ? 'efectivo' : 'efectivos'}
                {existing ? ' al cargar este resumen' : staffing ? ` (año ${staffing.reference_year})` : ''}. Salen de los efectivos del cuartel: no hace falta cargarlos acá.
              </>
            ) : existing ? (
              <>este resumen se cargó cuando el cuartel todavía no tenía efectivos cargados.</>
            ) : staffing === undefined ? (
              <>cargando…</>
            ) : (
              <>
                Cargá primero los efectivos del cuartel para usar este dato en asistencia.{' '}
                <Link to={`/cuarteles/${resolvedStationId}#efectivos`}>Cargar efectivos</Link>
              </>
            )}
            {existing?.present_average != null && ` Promedio de presentes cargado antes: ${existing.present_average}.`}
          </span>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar resumen'}
        </button>
      </form>
    </AppShell>
  )
}
