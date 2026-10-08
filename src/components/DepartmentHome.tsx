import { useEffect, useState } from 'react'
import { AppShell } from './layout/AppShell'
import { Icon } from './ui/Icon'
import { DepartmentDashboard } from './DepartmentDashboard'
import { PendientesResumen } from './PendientesResumen'
import { SupportContact } from './SupportContact'
import { openGlobalSearch } from '../lib/searchControl'
import { fetchVisibleDepartments } from '../lib/api/departments'
import { describeSupabaseError } from '../lib/api/errors'
import { greeting, longToday } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import type { VisibleDepartment } from '../types/database'

// Inicio del modo departamento (quien solo es Coordinador o Miembro de
// Departamento): su departamento con sus acciones y lo que tiene pendiente.
// Sin cuarteles, documentos, inventario, estado de la Regional ni tareas de
// otros módulos.
export function DepartmentHome() {
  const { profile } = useAuth()
  // null mientras carga: así no se muestra "sin departamento" por un instante.
  const [departments, setDepartments] = useState<VisibleDepartment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVisibleDepartments()
      .then((list) => active && setDepartments(list.filter((d) => d.my_relation)))
      .catch((err) => {
        if (!active) return
        setDepartments([])
        setError(describeSupabaseError(err, 'No pudimos cargar tu departamento. Reintentá en unos segundos.'))
      })
    return () => {
      active = false
    }
  }, [])

  const mine = departments ?? []
  const coordinatedNames = mine.filter((d) => d.my_relation === 'coordinador').map((d) => d.name)
  const memberNames = mine.filter((d) => d.my_relation === 'integrante').map((d) => d.name)
  const roleSummary = [
    ...(coordinatedNames.length ? [`Coordinador de ${coordinatedNames.join(', ')}`] : []),
    ...(memberNames.length ? [`Miembro de ${memberNames.join(', ')}`] : []),
  ]
  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <AppShell title="Inicio">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="page-subtitle">
            {longToday()}
            {roleSummary.length > 0 && ` · ${roleSummary.slice(0, 3).join(' · ')}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <button type="button" className="home-search" onClick={openGlobalSearch}>
        <Icon name="search" size={18} />
        <span>Buscar en SIGER4: tu departamento, informes, eventos, avisos…</span>
      </button>

      {departments === null && (
        <div className="loading-state" role="status">
          Cargando tu departamento…
        </div>
      )}

      {departments !== null && mine.length === 0 && !error && (
        <div className="card dept-home-empty">
          <h2 className="section-title">Todavía no tenés un departamento asignado</h2>
          <p>
            Tu rol trabaja con un departamento, pero Informática y Estadística todavía no te asignó uno. Cuando te sumen, lo vas a ver acá con sus informes,
            actas, eventos y avisos.
          </p>
          <SupportContact variant="inline" lead="¿Creés que es un error? Consultá a Informática y Estadística:" />
        </div>
      )}

      {mine.length > 0 && <DepartmentDashboard departments={mine} />}

      <PendientesResumen />
    </AppShell>
  )
}
