import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { supabase } from '../lib/supabaseClient'
import type { Course } from '../types/database'

export function EscuelaPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('courses')
      .select('*')
      .order('start_date', { ascending: true })
      .then(({ data }) => {
        if (active) {
          setCourses((data ?? []) as Course[])
          setLoading(false)
        }
      })
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
        {courses.map((course) => (
          <div key={course.id} className="card-solid">
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
          </div>
        ))}
      </div>
    </AppShell>
  )
}
