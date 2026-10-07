import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchProfiles } from '../lib/api/users'
import { createNotification } from '../lib/api/notifications'
import { fetchVisibleDepartments, notifyDepartment } from '../lib/api/departments'
import type { NotificationType, Profile, Region, Station, Subsede, VisibleDepartment } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const NOTIFICATION_TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'curso_nuevo', label: 'Curso nuevo' },
  { value: 'circular_nueva', label: 'Circular nueva' },
  { value: 'asistencia_pendiente', label: 'Asistencia pendiente' },
  { value: 'estadisticas_nuevas', label: 'Estadísticas nuevas' },
  { value: 'cambio_estado', label: 'Cambio de estado' },
  { value: 'actividad_proxima', label: 'Actividad próxima' },
  { value: 'documento_actualizado', label: 'Documento actualizado' },
  { value: 'reporte_generado', label: 'Reporte generado' },
]

type NotifScopeTarget = 'region' | 'subsede' | 'station' | 'profile' | 'department'

const NOTIF_SCOPE_OPTIONS: { value: NotifScopeTarget; label: string }[] = [
  { value: 'region', label: 'Regional' },
  { value: 'subsede', label: 'Subsede' },
  { value: 'station', label: 'Cuartel' },
  { value: 'profile', label: 'Usuario específico' },
]

export function NotificacionFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetDepartmentId = searchParams.get('departamento') ?? ''
  const { profile: currentProfile, isAdmin, hasRole, coordinatedDepartmentIds } = useAuth()
  const canCreateGeneral = isAdmin || hasRole('secretario_regional', 'director_escuela', 'instructor')
  // Aviso a un departamento: su coordinador, el Secretario Regional o
  // Informática (can_notify_department(), 0103).
  const canNotifyDepartments = isAdmin || hasRole('secretario_regional') || coordinatedDepartmentIds.length > 0
  const canCreate = canCreateGeneral || canNotifyDepartments
  // Alcance total: únicamente informatica_r4 (no isAdmin en general, que
  // también incluye a integrante_informatica). secretario_regional/
  // director_escuela/instructor/integrante_informatica solo pueden notificar
  // dentro de su propia región (RLS: notifications_write_scoped, migración
  // 0071 — antes, hasta la v1.0.0-beta.1, integrante_informatica compartía
  // alcance total con informatica_r4 vía is_informatica_r4(), inconsistente
  // con cómo se lo trata en el resto del sistema, ver DEPLOYMENT.md 31.4/31.6).
  const scopeLockedToOwnRegion = !hasRole('informatica_r4')

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<VisibleDepartment[]>([])
  const [departmentId, setDepartmentId] = useState(presetDepartmentId)

  const startsWithDepartment = Boolean(presetDepartmentId) || !canCreateGeneral
  const [type, setType] = useState<NotificationType>(startsWithDepartment ? 'aviso_departamento' : 'circular_nueva')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scopeTarget, setScopeTarget] = useState<NotifScopeTarget>(startsWithDepartment ? 'department' : 'region')
  // "Aviso de departamento" solo tiene sentido con destino Departamento.
  const typeOptions =
    scopeTarget === 'department' ? [{ value: 'aviso_departamento' as const, label: 'Aviso de departamento' }, ...NOTIFICATION_TYPE_OPTIONS] : NOTIFICATION_TYPE_OPTIONS
  useEffect(() => {
    if (scopeTarget !== 'department' && type === 'aviso_departamento') setType('circular_nueva')
  }, [scopeTarget, type])
  const [regionId, setRegionId] = useState('')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState('')
  const [profileId, setProfileId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generalScopeOptions = !canCreateGeneral
    ? []
    : scopeLockedToOwnRegion
      ? NOTIF_SCOPE_OPTIONS.filter((o) => o.value !== 'region' || currentProfile?.region_id)
      : NOTIF_SCOPE_OPTIONS
  const visibleScopeOptions =
    canNotifyDepartments && departments.length > 0 ? [...generalScopeOptions, { value: 'department' as const, label: 'Departamento' }] : generalScopeOptions

  // Departamentos a los que puede avisar: los que coordina, o todos los
  // activos para Informática y el Secretario Regional.
  useEffect(() => {
    if (!canNotifyDepartments) return
    let active = true
    fetchVisibleDepartments()
      .then((data) => {
        if (!active) return
        const options = data.filter((d) => d.is_active && (isAdmin || hasRole('secretario_regional') || d.my_relation === 'coordinador'))
        setDepartments(options)
        setDepartmentId((prev) => prev || (options.length === 1 ? options[0].id : ''))
      })
      .catch(() => active && setDepartments([]))
    return () => {
      active = false
    }
    // hasRole cambia de identidad en cada render; isAdmin alcanza como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canNotifyDepartments, isAdmin])

  useEffect(() => {
    if (!canCreateGeneral) return
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchProfiles()]).then(
      ([regionsData, subsedesData, stationsData, profilesData]) => {
        if (!active) return
        const ownRegionId = currentProfile?.region_id ?? null
        const ownStationId = currentProfile?.station_id ?? null
        const ownStation = ownStationId ? stationsData.find((s) => s.id === ownStationId) ?? null : null
        const ownSubsedeId = ownStation?.subsede_id ?? null

        setRegions(scopeLockedToOwnRegion ? regionsData.filter((r) => r.id === ownRegionId) : regionsData)
        setSubsedes(
          scopeLockedToOwnRegion
            ? subsedesData.filter((s) => s.id === ownSubsedeId || s.region_id === ownRegionId)
            : subsedesData,
        )
        setStations(
          scopeLockedToOwnRegion ? stationsData.filter((s) => s.region_id === ownRegionId || s.id === ownStationId) : stationsData,
        )
        setProfiles(profilesData)
        setRegionId((prev) => prev || (scopeLockedToOwnRegion ? ownRegionId ?? '' : regionsData[0]?.id ?? ''))
        if (scopeLockedToOwnRegion && !ownRegionId && !presetDepartmentId) {
          // Sin región propia asignada: no puede armar un envío por región,
          // el único alcance seguro que le queda es "usuario específico".
          setScopeTarget('profile')
        }
      },
    )
    return () => {
      active = false
    }
  }, [canCreateGeneral, scopeLockedToOwnRegion, currentProfile?.region_id, currentProfile?.station_id, presetDepartmentId])

  if (!canCreate) {
    return (
      <AppShell title="Nueva Notificación">
        <div className="empty-state">No tenés permiso para crear notificaciones con tu rol actual.</div>
      </AppShell>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (scopeTarget === 'region' && !regionId) {
      setError('Elegí la Regional destino.')
      return
    }
    if (scopeTarget === 'subsede' && !subsedeId) {
      setError('Seleccioná la subsede destino.')
      return
    }
    if (scopeTarget === 'station' && !stationId) {
      setError('Seleccioná el cuartel destino.')
      return
    }
    if (scopeTarget === 'profile' && !profileId) {
      setError('Seleccioná el usuario destino.')
      return
    }
    if (scopeTarget === 'department' && !departmentId) {
      setError('Elegí el departamento.')
      return
    }

    setSubmitting(true)
    try {
      if (scopeTarget === 'department') {
        const sent = await notifyDepartment(departmentId, type, title, body || null)
        const name = departments.find((d) => d.id === departmentId)?.name ?? 'el departamento'
        navigate(`/departamentos/${departmentId}`, {
          state: {
            notice:
              sent === 0
                ? `El aviso no le llegó a nadie: ${name} todavía no tiene otros miembros.`
                : `Aviso enviado a ${sent === 1 ? '1 persona' : `${sent} personas`} de ${name}.`,
          },
        })
        return
      }
      await createNotification({
        type,
        title,
        body: body || null,
        region_id: scopeTarget === 'region' ? regionId : null,
        subsede_id: scopeTarget === 'subsede' ? subsedeId : null,
        station_id: scopeTarget === 'station' ? stationId : null,
        profile_id: scopeTarget === 'profile' ? profileId : null,
      })
      navigate('/notificaciones')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos crear la notificación.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Nueva Notificación">
      <h1 className="page-title">Nueva Notificación</h1>
      <p className="page-subtitle">
        {canCreateGeneral
          ? 'Enviá un aviso institucional al alcance que corresponda.'
          : 'Enviá un aviso a todo tu departamento: le llega a cada integrante, también al celular si activó los avisos.'}
      </p>

      <form onSubmit={handleSubmit} className="card-solid">
        <div className="field">
          <label>Tipo</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {typeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className="chip"
                aria-pressed={type === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular N°12" />
        </div>

        <div className="field">
          <label htmlFor="body">Mensaje (opcional)</label>
          <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </div>

        <div className="field">
          <label>Alcance</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {visibleScopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScopeTarget(option.value)}
                className="chip"
                aria-pressed={scopeTarget === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          {scopeTarget === 'region' && (
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Seleccionar Regional</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'subsede' && (
            <select value={subsedeId} onChange={(e) => setSubsedeId(e.target.value)}>
              <option value="">Seleccionar subsede</option>
              {subsedes.map((subsede) => (
                <option key={subsede.id} value={subsede.id}>
                  {subsede.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'station' && (
            <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">Seleccionar cuartel</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          )}

          {scopeTarget === 'department' && (
            <>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Departamento">
                <option value="">Seleccionar departamento</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="field-help">Le llega solo al coordinador y a los miembros de ese departamento. No a otros departamentos.</p>
            </>
          )}

          {scopeTarget === 'profile' && (
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Seleccionar usuario</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar notificación'}
        </button>
      </form>
    </AppShell>
  )
}
