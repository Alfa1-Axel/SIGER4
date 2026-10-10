import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { createPersonnel, fetchPersonnelById, updatePersonnel } from '../lib/api/personnel'
import { fetchStationById } from '../lib/api/stations'
import type { PersonnelStatus } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'
import { EditConflictPanel } from '../components/EditConflictPanel'
import { isEditConflict } from '../lib/concurrency'
import type { RowSnapshot } from '../lib/concurrency'

// Solo los estados "libres" son editables desde este formulario.
// Renuncia/baja/pase/reserva requieren un motivo obligatorio y se hacen
// desde el detalle del cuartel (changePersonnelStatus) — un trigger en la
// base bloquea llegar a esos estados por UPDATE directo.
const STATUS_OPTIONS: { value: PersonnelStatus; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'licencia', label: 'Licencia' },
  { value: 'aspirante', label: 'Aspirante' },
]

export function PersonalFormPage() {
  const { stationId, id } = useParams<{ stationId?: string; id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, scopes, isAdmin, hasRole } = useAuth()
  const isStationRole = hasRole('presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')
  const isRegionalRole = hasRole('secretario_regional')
  const myStationId = profile?.station_id ?? scopes.find((s) => s.scope_type === 'station')?.station_id ?? null
  const myRegionId = profile?.region_id ?? scopes.find((s) => s.scope_type === 'region')?.region_id ?? null

  const [resolvedStationId, setResolvedStationId] = useState(stationId ?? '')
  const [targetStationRegionId, setTargetStationRegionId] = useState<string | null>(null)
  // personnel_write_admin_regional_station (RLS): secretario_regional solo
  // dentro de su propia región, roles de cuartel solo su propio cuartel — se
  // revalida contra el cuartel real del registro, no solo el rol del actor.
  const canEdit =
    isAdmin ||
    (isRegionalRole && Boolean(targetStationRegionId) && targetStationRegionId === myRegionId) ||
    (isStationRole && Boolean(resolvedStationId) && resolvedStationId === myStationId)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [rank, setRank] = useState('')
  const [roleFunction, setRoleFunction] = useState('')
  const [status, setStatus] = useState<PersonnelStatus>('activo')
  const [department, setDepartment] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [observations, setObservations] = useState('')

  const [loading, setLoading] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La fila tal como se abrió (con su versión) y, si otra persona la cambió
  // mientras se editaba, lo que se intentó guardar.
  const [existing, setExisting] = useState<RowSnapshot | null>(null)
  const [conflict, setConflict] = useState<{ mine: Record<string, unknown> } | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchPersonnelById(id).then((person) => {
      setExisting((person ?? null) as unknown as RowSnapshot | null)
      if (!active || !person) return
      setResolvedStationId(person.station_id)
      setFirstName(person.first_name)
      setLastName(person.last_name)
      setNationalId(person.national_id ?? '')
      setRank(person.rank ?? '')
      setRoleFunction(person.role_function ?? '')
      setStatus(person.status)
      setDepartment(person.department ?? '')
      setJoinDate(person.join_date ?? '')
      setPhone(person.phone ?? '')
      setEmail(person.email ?? '')
      setObservations(person.observations ?? '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!resolvedStationId) return
    let active = true
    fetchStationById(resolvedStationId).then((s) => {
      if (active) setTargetStationRegionId(s?.region_id ?? null)
    })
    return () => {
      active = false
    }
  }, [resolvedStationId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    let attempted: Record<string, unknown> | null = null
    try {
      const input = {
        station_id: resolvedStationId,
        first_name: firstName,
        last_name: lastName,
        national_id: nationalId || null,
        rank: rank || null,
        role_function: roleFunction || null,
        status,
        department: department || null,
        join_date: joinDate || null,
        phone: phone || null,
        email: email || null,
        observations: observations || null,
      }
      if (isEditing && id) {
        attempted = input
        await updatePersonnel(id, input, existing?.row_version)
      } else {
        await createPersonnel(input)
      }
      navigate(`/cuarteles/${resolvedStationId}`)
    } catch (err) {
      if (isEditing && attempted && isEditConflict(err)) {
        setConflict({ mine: attempted })
      } else {
        setError(describeSupabaseError(err, 'No pudimos guardar el personal.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) {
    return (
      <AppShell title="Registro de personal">
        <div className="empty-state">No tenés permiso para {isEditing ? 'editar' : 'cargar'} personal con tu rol actual.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEditing ? 'Editar integrante' : 'Nuevo integrante'}>
      <h1 className="page-title">{isEditing ? 'Editar integrante' : 'Nuevo integrante'}</h1>
      <p className="page-subtitle">
        Registro nominal del cuartel, opcional. Los efectivos (cantidad por categoría) se cargan en la ficha del cuartel, sin nombres.
      </p>

      {!loading && !['activo', 'licencia', 'aspirante'].includes(status) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13 }}>
            Este integrante está en estado "{status}". Podés seguir editando sus datos, pero el
            estado solo se cambia desde el detalle del cuartel.
          </p>
        </div>
      )}

      {loading ? (
        <div className="loading-state" role="status">Cargando datos del personal…</div>
      ) : (
        <form onSubmit={handleSubmit} className="card-solid">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="firstName">Nombre</label>
              <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="lastName">Apellido</label>
              <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="rank">Jerarquía (opcional)</label>
              <input id="rank" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Bombero, Cabo, Oficial..." />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="roleFunction">Cargo / función (opcional)</label>
              <input id="roleFunction" value={roleFunction} onChange={(e) => setRoleFunction(e.target.value)} placeholder="Conductor, Tesorero..." />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="department">Departamento (opcional)</label>
              <input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Cuerpo Activo, Comisión..." />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="joinDate">Fecha de ingreso (opcional)</label>
              <input id="joinDate" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="phone">Teléfono (opcional)</label>
              <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="email">Email (opcional)</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="nationalId">DNI (opcional)</label>
            <input id="nationalId" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="observations">Observaciones (opcional)</label>
            <textarea id="observations" value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} />
          </div>

          {['activo', 'licencia', 'aspirante'].includes(status) && (
            <div className="field">
              <label>Estado</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className="chip"
                    aria-pressed={status === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="field-error">{error}</p>}

          {conflict && existing && id && (

            <EditConflictPanel

              table="personnel"

              recordId={id}

              base={existing}

              mine={conflict.mine}

              onSave={(patch, version) => updatePersonnel(id, patch as Parameters<typeof updatePersonnel>[1], version)}

              onResolved={async () => {

                navigate(`/cuarteles/${resolvedStationId}`)

              }}

              onDiscard={() => window.location.reload()}

              onClose={() => setConflict(null)}

            />

          )}


          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar integrante'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
