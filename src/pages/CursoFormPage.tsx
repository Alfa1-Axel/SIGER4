import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchStations } from '../lib/api/stations'
import {
  createCourse,
  fetchCourseById,
  fetchInstructorCandidates,
  fetchParticipatingStations,
  setParticipatingStations,
  updateCourse,
} from '../lib/api/courses'
import type { CourseStatus, Profile, Region, Station } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: 'planificado', label: 'Planificado' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
]

export function CursoFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('director_escuela', 'instructor')

  const [regions, setRegions] = useState<Region[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [regionId, setRegionId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<CourseStatus>('planificado')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [instructorProfileId, setInstructorProfileId] = useState('')
  const [hours, setHours] = useState('')
  const [days, setDays] = useState('')
  const [attendeesCount, setAttendeesCount] = useState('')
  const [speakers, setSpeakers] = useState('')
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([])

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchInstructorCandidates(), fetchStations()]).then(
      ([regionsData, instructorsData, stationsData]) => {
        if (!active) return
        setRegions(regionsData)
        setInstructors(instructorsData)
        setStations(stationsData)
        setRegionId((prev) => prev || regionsData[0]?.id || '')
      },
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([fetchCourseById(id), fetchParticipatingStations(id)]).then(([course, participating]) => {
      if (!active || !course) return
      setRegionId(course.region_id)
      setTitle(course.title)
      setCategory(course.category)
      setStatus(course.status)
      setStartDate(course.start_date ?? '')
      setEndDate(course.end_date ?? '')
      setInstructorProfileId(course.instructor_profile_id ?? '')
      setHours(course.hours != null ? String(course.hours) : '')
      setDays(course.days != null ? String(course.days) : '')
      setAttendeesCount(course.attendees_count != null ? String(course.attendees_count) : '')
      setSpeakers(course.speakers ?? '')
      setSelectedStationIds(participating.map((s) => s.id))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  function toggleStation(stationId: string) {
    setSelectedStationIds((prev) =>
      prev.includes(stationId) ? prev.filter((s) => s !== stationId) : [...prev, stationId],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input = {
        region_id: regionId,
        title,
        category,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        instructor_profile_id: instructorProfileId || null,
        hours: hours ? Number(hours) : null,
        days: days ? Number(days) : null,
        attendees_count: attendeesCount ? Number(attendeesCount) : null,
        speakers: speakers || null,
      }
      const course = isEditing && id ? await updateCourse(id, input) : await createCourse(input)
      await setParticipatingStations(course.id, selectedStationIds)
      navigate('/escuela')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos guardar el curso.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Escuela">
        <div className="empty-state">No tenés permisos para {isEditing ? 'editar' : 'crear'} cursos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar Curso' : 'Nuevo Curso'}>
      <h1 className="page-title">{isEditing ? 'Editar Curso' : 'Nuevo Curso'}</h1>
      <p className="page-subtitle">Cursos y capacitaciones de la Escuela Regional.</p>

      {loading ? (
        <div className="empty-state">Cargando datos del curso…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div className="field">
            <label htmlFor="title">Título</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rescate en Estructuras Colapsadas" />
          </div>

          <div className="field">
            <label htmlFor="category">Categoría</label>
            <input id="category" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Táctica y Rescate" />
          </div>

          <div className="field">
            <label htmlFor="region">Región</label>
            <select id="region" required value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="instructor">Instructor (opcional)</label>
            <select id="instructor" value={instructorProfileId} onChange={(e) => setInstructorProfileId(e.target.value)}>
              <option value="">Sin asignar</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="startDate">Fecha de inicio (opcional)</label>
            <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="endDate">Fecha de fin (opcional)</label>
            <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="hours">Horas cátedra (opcional)</label>
            <input id="hours" type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="20" />
          </div>

          <div className="field">
            <label htmlFor="days">Cantidad de días (opcional)</label>
            <input id="days" type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} placeholder="3" />
          </div>

          <div className="field">
            <label htmlFor="attendeesCount">Cantidad de asistentes (opcional)</label>
            <input
              id="attendeesCount"
              type="number"
              min="0"
              value={attendeesCount}
              onChange={(e) => setAttendeesCount(e.target.value)}
              placeholder="24"
            />
          </div>

          <div className="field">
            <label htmlFor="speakers">Disertantes (separados por coma)</label>
            <input
              id="speakers"
              value={speakers}
              onChange={(e) => setSpeakers(e.target.value)}
              placeholder="Juan Pérez, María Gómez"
            />
          </div>

          <div className="field">
            <label>Cuarteles participantes</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => toggleStation(station.id)}
                  className={`btn ${selectedStationIds.includes(station.id) ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  {station.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Estado</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`btn ${status === option.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
