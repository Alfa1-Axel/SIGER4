import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { createCourse, fetchCourseById, fetchInstructorCandidates, updateCourse } from '../lib/api/courses'
import type { CourseStatus, Profile, Region } from '../types/database'

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

  const [regions, setRegions] = useState<Region[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [regionId, setRegionId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<CourseStatus>('planificado')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [instructorProfileId, setInstructorProfileId] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchInstructorCandidates()]).then(([regionsData, instructorsData]) => {
      if (!active) return
      setRegions(regionsData)
      setInstructors(instructorsData)
      setRegionId((prev) => prev || regionsData[0]?.id || '')
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!id) return
    let active = true
    fetchCourseById(id).then((course) => {
      if (!active || !course) return
      setRegionId(course.region_id)
      setTitle(course.title)
      setCategory(course.category)
      setStatus(course.status)
      setStartDate(course.start_date ?? '')
      setEndDate(course.end_date ?? '')
      setInstructorProfileId(course.instructor_profile_id ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

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
      }
      if (isEditing && id) {
        await updateCourse(id, input)
      } else {
        await createCourse(input)
      }
      navigate('/escuela')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el curso.')
    } finally {
      setSubmitting(false)
    }
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
