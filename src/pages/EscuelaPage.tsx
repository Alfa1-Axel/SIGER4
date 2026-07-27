import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchCourses } from '../lib/api/courses'
import type { Course } from '../types/database'
import { useAuth } from '../hooks/useAuth'

export function EscuelaPage() {
  const { isAdmin, hasRole } = useAuth()
  const canEdit = isAdmin || hasRole('director_escuela', 'instructor')
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchCourses()
      .then((data) => active && setCourses(data))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <AppShell title="Escuela">
      <div className="card" style={{ marginBottom: 20 }}>
        <img
          src="/logos/logo-escuela.png"
          alt="Escuela Regional de Bomberos"
          style={{ height: 56, width: 56, borderRadius: 12, objectFit: 'cover', marginBottom: 12 }}
        />
        <h1 style={{ margin: 0, fontSize: 18 }}>Escuela Regional de Bomberos</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Regional 4 · Escuela de Capacitación
        </p>
      </div>

      <div className="section-header">
        <h2 className="section-title">Cursos Activos</h2>
      </div>

      {loading && <div className="empty-state">Cargando cursos…</div>}
      {!loading && courses.length === 0 && (
        <div className="empty-state">Todavía no hay cursos cargados en Supabase.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {courses.map((course) => {
          const content = (
            <>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                {course.category}
              </div>
              <h3 style={{ margin: '4px 0 12px', fontSize: 15 }}>{course.title}</h3>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${course.progress_percent}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span>{course.enrolled_count} inscriptos</span>
                <span>{course.progress_percent}%</span>
              </div>
            </>
          )
          return canEdit ? (
            <Link key={course.id} to={`/escuela/${course.id}/editar`} className="card-solid" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              {content}
            </Link>
          ) : (
            <div key={course.id} className="card-solid">
              {content}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <Link
          to="/escuela/nuevo"
          className="btn btn-primary btn-icon"
          style={{ position: 'fixed', bottom: 84, right: 20, zIndex: 25 }}
          aria-label="Nuevo curso"
        >
          <Icon name="plus" size={20} />
        </Link>
      )}
    </AppShell>
  )
}
