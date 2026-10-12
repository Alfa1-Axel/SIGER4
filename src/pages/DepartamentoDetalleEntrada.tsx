import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DepartamentoDetallePage } from './DepartamentoDetallePage'
import { DepartamentoFichaBasicaPage } from './DepartamentoFichaBasicaPage'
import { fetchDepartmentById } from '../lib/api/departments'

// Entrada de /departamentos/:id (0119). Si la persona puede leer el departamento (su coordinador, sus
// miembros, Informática, el Secretario Regional y el Director de Escuela), se abre la pantalla de siempre.
// Si no, se abre la ficha institucional básica, que ve cualquier usuario activo y no trae nada interno.
// La decisión la toma la base (RLS de departments): la pantalla solo la refleja.
export function DepartamentoDetalleEntrada() {
  const { id } = useParams<{ id: string }>()
  const [mode, setMode] = useState<'loading' | 'full' | 'basic'>('loading')

  useEffect(() => {
    if (!id) return
    let active = true
    setMode('loading')
    fetchDepartmentById(id)
      .then((department) => active && setMode(department ? 'full' : 'basic'))
      .catch(() => active && setMode('basic'))
    return () => {
      active = false
    }
  }, [id])

  if (mode === 'loading') {
    return (
      <AppShell title="Departamento">
        <div className="loading-state" role="status">
          Cargando departamento…
        </div>
      </AppShell>
    )
  }
  return mode === 'full' ? <DepartamentoDetallePage /> : <DepartamentoFichaBasicaPage />
}
