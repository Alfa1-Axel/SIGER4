import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ContactLink } from '../components/ui/ContactLink'
import { fetchDepartmentBasicDirectory } from '../lib/api/departments'
import type { DepartmentBasic } from '../types/database'
import { describeSupabaseError } from '../lib/api/errors'

// Ficha institucional básica de un departamento (0119): la ve cualquier usuario activo. Solo lectura y solo
// lo institucional: nombre, descripción, contacto, estado y coordinador. Los miembros, informes, actas,
// documentos, eventos, avisos y avales son del coordinador y los miembros del departamento.
export function DepartamentoFichaBasicaPage() {
  const { id } = useParams<{ id: string }>()
  const [department, setDepartment] = useState<DepartmentBasic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchDepartmentBasicDirectory()
      .then((list) => active && setDepartment(list.find((d) => d.id === id) ?? null))
      .catch((err) => active && setError(describeSupabaseError(err, 'No pudimos cargar el departamento. Reintentá en unos segundos.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  return (
    <AppShell title="Departamento">
      <div style={{ marginBottom: 16 }}>
        <Link to="/departamentos?todos=1" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Volver a Departamentos
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="loading-state" role="status">
          Cargando departamento…
        </div>
      )}
      {!loading && !error && !department && <div className="empty-state">No encontramos ese departamento. Puede que lo hayan dado de baja.</div>}

      {department && (
        <>
          <div className="card-solid" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 20, minWidth: 0, overflowWrap: 'anywhere' }}>{department.name}</h1>
              <span className={`badge ${department.is_active ? 'badge-success' : 'badge-danger'}`}>{department.is_active ? 'Activo' : 'Inactivo'}</span>
            </div>
            {department.description && <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{department.description}</p>}
          </div>

          <div className="section-header">
            <h2 className="section-title">Coordinación y contacto</h2>
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {department.coordinator_name ? (
                <>
                  <span style={{ color: 'var(--color-text-muted)' }}>Coordinador: </span>
                  <strong style={{ overflowWrap: 'anywhere' }}>{department.coordinator_name}</strong>
                </>
              ) : (
                'Este departamento todavía no tiene coordinador.'
              )}
            </p>
            {department.contact_info && (
              <div className="contact-list" style={{ marginTop: 12 }}>
                <ContactLink kind="auto" value={department.contact_info} />
              </div>
            )}
          </div>

          <p className="field-help" style={{ marginBottom: 20 }}>
            Esta es la ficha institucional del departamento, que ve cualquier usuario de SIGER4. Sus miembros, informes, actas, documentos, eventos y
            avisos los ven solo su coordinador y sus miembros.
          </p>
        </>
      )}
    </AppShell>
  )
}
