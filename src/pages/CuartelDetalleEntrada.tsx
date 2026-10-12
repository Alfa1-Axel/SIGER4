import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { CuartelDetallePage } from './CuartelDetallePage'
import { CuartelFichaBasicaPage } from './CuartelFichaBasicaPage'
import { fetchStationById } from '../lib/api/stations'

// Entrada de /cuarteles/:id (0119). Si la persona puede leer el cuartel (su cuartel, o los de su Regional
// o subsede según el rol), se abre la ficha de siempre. Si no, se abre la ficha institucional básica, que
// ve cualquier usuario activo y no trae nada interno. La decisión la toma la base (RLS de stations): la
// pantalla solo la refleja, no se decide por rol en el navegador.
export function CuartelDetalleEntrada() {
  const { id } = useParams<{ id: string }>()
  const [mode, setMode] = useState<'loading' | 'full' | 'basic'>('loading')

  useEffect(() => {
    if (!id) return
    let active = true
    setMode('loading')
    fetchStationById(id)
      .then((station) => active && setMode(station ? 'full' : 'basic'))
      .catch(() => active && setMode('basic'))
    return () => {
      active = false
    }
  }, [id])

  if (mode === 'loading') {
    return (
      <AppShell title="Cuartel">
        <div className="loading-state" role="status">
          Cargando información del cuartel…
        </div>
      </AppShell>
    )
  }
  return mode === 'full' ? <CuartelDetallePage /> : <CuartelFichaBasicaPage />
}
