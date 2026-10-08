import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { recordAuditEvent } from '../lib/api/audit'
import { createNotification } from '../lib/api/notifications'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import { fetchDepartments } from '../lib/api/departments'
import { REPORT_GENERATORS, type ReportKey } from '../lib/pdf/reportGenerators'
import { REPORT_SECTION_OPTIONS, allSections } from '../lib/pdf/reportSections'
import type { ReportSection } from '../lib/pdf/reportSections'
import type { Department, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const REPORT_TYPES: { key: ReportKey; label: string; needsStation?: boolean; needsDepartment?: boolean }[] = [
  { key: 'cuartel_general', label: 'Reporte de cuartel', needsStation: true },
  { key: 'regional_consolidado', label: 'Reporte Regional' },
  { key: 'departamento_especifico', label: 'Reporte de departamento', needsDepartment: true },
  { key: 'asistencias', label: 'Reporte de asistencia' },
  { key: 'intervenciones', label: 'Reporte de intervenciones' },
  { key: 'vehiculos', label: 'Reporte de móviles' },
  { key: 'cursos', label: 'Reporte de cursos y Escuela' },
  { key: 'departamentos_general', label: 'Departamentos: resumen general' },
]

// 2026-09-01 → 01/09/2026, como se lee en el Cuerpo.
function dmy(day: string): string {
  const [y, m, d] = day.split('-')
  return y && m && d ? `${d}/${m}/${y}` : day
}

// director_escuela y secretario_regional tienen visión regional/subsede/cuartel,
// pero acotada a Escuela/capacitación y panorama general — no a datos
// operativos de cuartel como Vehículos e Intervenciones. Sí tienen acceso a
// los reportes de Departamentos (visión regional/escuela, confirmado con el
// usuario).
const ESCUELA_REGIONAL_REPORT_KEYS: ReportKey[] = [
  'asistencias',
  'cursos',
  'regional_consolidado',
  'cuartel_general',
  'departamentos_general',
  'departamento_especifico',
]

// jefe_cuerpo_activo y usuario_carga_cuartel solo ven reportes de su propio
// cuartel: no tiene sentido mostrarles "Reporte Regional Consolidado" ni los
// reportes globales de Departamentos (no son roles de cuartel, confirmado con
// el usuario: "no permitir que roles de cuartel generen reportes globales de
// departamentos salvo decisión explícita").
const STATION_ONLY_REPORT_KEYS: ReportKey[] = ['asistencias', 'intervenciones', 'cursos', 'vehiculos', 'cuartel_general']

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function ReportesPage() {
  const { profile, isAdmin, hasRole } = useAuth()
  // Alcance regional/subsede/cuartel: informatica_r4, integrante_informatica
  // (isAdmin), director_escuela, secretario_regional. Alcance limitado a su
  // propio cuartel: jefe_cuerpo_activo, usuario_carga_cuartel (sin selector de
  // región/subsede/otro cuartel — ReportsRoute ya bloquea al resto de roles).
  const isStationOnly = !isAdmin && hasRole('jefe_cuerpo_activo', 'usuario_carga_cuartel') && !hasRole('director_escuela', 'secretario_regional')
  const isEscuelaRegional = !isAdmin && hasRole('director_escuela', 'secretario_regional')

  const availableReportTypes = isStationOnly
    ? REPORT_TYPES.filter((r) => STATION_ONLY_REPORT_KEYS.includes(r.key))
    : isEscuelaRegional
      ? REPORT_TYPES.filter((r) => ESCUELA_REGIONAL_REPORT_KEYS.includes(r.key))
      : REPORT_TYPES

  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  const [reportKey, setReportKey] = useState<ReportKey>(availableReportTypes[0]?.key ?? 'asistencias')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [regionId, setRegionId] = useState(isEscuelaRegional ? (profile?.region_id ?? '') : '')
  const [subsedeId, setSubsedeId] = useState('')
  const [stationId, setStationId] = useState(isStationOnly ? (profile?.station_id ?? '') : '')
  const [departmentId, setDepartmentId] = useState('')
  // Qué secciones incluir en los reportes que lo permiten (todas por defecto).
  const [sections, setSections] = useState<ReportSection[]>(allSections(availableReportTypes[0]?.key ?? 'asistencias'))

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedKey, setConfirmedKey] = useState<ReportKey | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchRegions(), fetchSubsedes(), fetchStations(), fetchDepartments()]).then(
      ([regionsData, subsedesData, stationsData, departmentsData]) => {
        if (!active) return
        // director_escuela/secretario_regional tienen alcance regional (no de
        // cuartel único), pero igual acotado a SU región -- antes el selector
        // dejaba elegir cualquier región/subsede/cuartel del sistema aunque el
        // reporte resultante saliera vacío por RLS. Se acota acá igual que ya
        // se hacía para isStationOnly.
        setRegions(isEscuelaRegional ? regionsData.filter((r) => r.id === profile?.region_id) : regionsData)
        setSubsedes(isEscuelaRegional ? subsedesData.filter((s) => s.region_id === profile?.region_id) : subsedesData)
        // Un rol de solo-cuartel jamás debe ver otros cuarteles en el selector,
        // ni siquiera de solo lectura: reduce la lista al propio.
        setStations(
          isStationOnly
            ? stationsData.filter((s) => s.id === profile?.station_id)
            : isEscuelaRegional
              ? stationsData.filter((s) => s.region_id === profile?.region_id)
              : stationsData,
        )
        // El reporte "Departamento específico" muestra todos los departamentos
        // a informatica_r4/integrante_informatica/secretario_regional/
        // director_escuela (visión regional/escuela); para el resto (que llega
        // acá solo si coordina al menos uno, ver reportDef.needsDepartment más
        // abajo) se acota a los departamentos que coordina.
        setDepartments(
          isAdmin || isEscuelaRegional
            ? departmentsData
            : departmentsData.filter((d) => d.coordinator_profile_id === profile?.id),
        )
      },
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El coordinador de un departamento no necesariamente tiene un rol de los
  // que ya ven "Departamentos Regionales — General" (ese reporte sí queda
  // reservado a admin/secretario_regional/director_escuela) — pero puede
  // generar el reporte de SU propio departamento si coordina al menos uno.
  const isDepartmentCoordinator = !isAdmin && !isEscuelaRegional && !isStationOnly && departments.length > 0
  const availableReportTypesWithCoordinator = isDepartmentCoordinator
    ? [...availableReportTypes, REPORT_TYPES.find((r) => r.key === 'departamento_especifico')!]
    : availableReportTypes

  const reportDef =
    availableReportTypesWithCoordinator.find((r) => r.key === reportKey) ?? availableReportTypesWithCoordinator[0] ?? REPORT_TYPES[0]

  function scopeLabelFor(): string {
    if (reportDef.needsDepartment) {
      return departmentId ? departments.find((d) => d.id === departmentId)?.name ?? 'Departamento seleccionado' : 'Todos los departamentos'
    }
    if (stationId) return stations.find((s) => s.id === stationId)?.name ?? 'Cuartel seleccionado'
    if (subsedeId) return subsedes.find((s) => s.id === subsedeId)?.name ?? 'Subsede seleccionada'
    if (regionId) return regions.find((r) => r.id === regionId)?.name ?? 'Regional seleccionada'
    return 'Todo el alcance disponible'
  }

  function periodLabelFor(): string {
    if (periodStart && periodEnd) return `${dmy(periodStart)} al ${dmy(periodEnd)}`
    if (periodStart) return `Desde el ${dmy(periodStart)}`
    if (periodEnd) return `Hasta el ${dmy(periodEnd)}`
    return 'Todo el histórico disponible'
  }

  // Cambiar de reporte vuelve a marcar todas sus secciones.
  function selectReport(key: ReportKey) {
    setReportKey(key)
    setSections(allSections(key))
    setError(null)
  }

  function toggleSection(key: ReportSection) {
    setSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setError(null)
  }

  const sectionOptions = REPORT_SECTION_OPTIONS[reportKey] ?? []

  // Lo que se eligió, para imprimirlo bajo el encabezado del PDF.
  function filtersAppliedFor(stationIdUsed: string | null): string[] {
    const list: string[] = []
    if (reportDef.needsDepartment) {
      if (departmentId) list.push(`Departamento: ${departments.find((d) => d.id === departmentId)?.name ?? 'seleccionado'}`)
    } else if (reportKey !== 'departamentos_general') {
      if (stationIdUsed) list.push(`Cuartel: ${stations.find((s) => s.id === stationIdUsed)?.name ?? 'seleccionado'}`)
      else if (subsedeId) list.push(`Subsede: ${subsedes.find((s) => s.id === subsedeId)?.name ?? 'seleccionada'}`)
      else if (regionId) list.push(`Regional: ${regions.find((r) => r.id === regionId)?.name ?? 'seleccionada'}`)
      else list.push('Regional: todo el alcance disponible')
    }
    if (sectionOptions.length > 0) {
      list.push(sections.length === sectionOptions.length ? 'Incluye: todo' : `Incluye: ${sectionOptions.filter((o) => sections.includes(o.key)).map((o) => o.label).join(', ')}`)
    }
    return list
  }

  async function handleGenerate() {
    setError(null)
    setConfirmedKey(null)

    if (reportDef.needsStation && !stationId) {
      setError('Seleccioná un cuartel para este reporte.')
      return
    }
    if (reportDef.needsDepartment && !departmentId) {
      setError('Seleccioná un departamento para este reporte.')
      return
    }
    if (sectionOptions.length > 0 && sections.length === 0) {
      setError('Elegí al menos una sección para incluir en el reporte.')
      return
    }

    // Defensa en profundidad: un rol de solo-cuartel siempre genera acotado a
    // su propio cuartel, sin importar el estado de regionId/subsedeId/stationId
    // (RLS ya lo garantiza a nivel de datos; esto evita además cualquier
    // filtro "todos" inconsistente en el PDF/label mostrado al usuario). Un
    // coordinador de departamento (sin rol regional/escuela/admin) solo puede
    // elegir entre los departamentos que coordina — ver filtrado de
    // "departments" más arriba — así que effectiveDepartmentId ya viene
    // acotado por construcción del <select>, no hace falta reforzarlo acá.
    const effectiveStationId = isStationOnly ? profile?.station_id ?? null : stationId || null
    const effectiveRegionId = isStationOnly ? null : regionId || null
    const effectiveSubsedeId = isStationOnly ? null : subsedeId || null

    setGenerating(true)
    try {
      const generator = REPORT_GENERATORS[reportKey]
      const doc = await generator({
        filters: {
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          regionId: effectiveRegionId,
          subsedeId: effectiveSubsedeId,
          stationId: effectiveStationId,
        },
        scopeLabel: scopeLabelFor(),
        periodLabel: periodLabelFor(),
        filtersApplied: filtersAppliedFor(effectiveStationId),
        sections: sectionOptions.length > 0 ? sections : undefined,
        generatedByLabel: profile?.full_name ?? 'Usuario SIGER4',
        profileId: profile?.id ?? null,
        departmentId: reportDef.needsDepartment ? departmentId || null : null,
      })

      const fileName = `siger4-${slugify(reportDef.label)}-${new Date().toISOString().slice(0, 10)}.pdf`
      doc.save(fileName)

      // No debe bloquear ni hacer fallar la generación del reporte: el PDF ya
      // se guardó (doc.save arriba). Si la auditoría falla (ej. problema de
      // red transitorio), el usuario no debe ver "no pudimos generar el
      // reporte" cuando en realidad sí se generó.
      await recordAuditEvent({
        action: 'reporte_generado',
        tableName: 'reports',
        reason: `${reportDef.label} · ${scopeLabelFor()} · ${periodLabelFor()}`,
      }).catch((err) => console.warn('[SIGER4] No se pudo registrar la auditoría del reporte:', err))

      if (profile?.id) {
        await createNotification({
          type: 'reporte_generado',
          title: `Reporte generado: ${reportDef.label}`,
          body: `${scopeLabelFor()} · ${periodLabelFor()}`,
          profile_id: profile.id,
        }).catch(() => undefined)
      }

      setConfirmedKey(reportKey)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos generar el reporte.'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <AppShell title="Reportes">
      <h1 className="page-title">Reportes</h1>
      <p className="page-subtitle">Elegí el tipo de reporte y el alcance: SIGER4 arma el PDF con los datos cargados.</p>

      <div className="card-solid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="reportType">Tipo de reporte</label>
          <select id="reportType" value={reportKey} onChange={(e) => selectReport(e.target.value as ReportKey)}>
            {availableReportTypesWithCoordinator.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="periodStart">Desde</label>
            <input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="periodEnd">Hasta</label>
            <input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        {reportDef.needsDepartment ? (
          <div className="field">
            <label htmlFor="departmentFilter">
              Departamento <span style={{ color: 'var(--color-link)' }}>*</span>
            </label>
            <select id="departmentFilter" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Seleccionar departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {isDepartmentCoordinator && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                Solo podés generar reportes de los departamentos que coordinás.
              </p>
            )}
          </div>
        ) : reportKey === 'departamentos_general' ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Este reporte incluye todos los departamentos regionales, sin filtro de Regional, subsede o cuartel.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {!isStationOnly && (
              <>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label htmlFor="regionFilter">Regional</label>
                  <select
                    id="regionFilter"
                    value={regionId}
                    onChange={(e) => {
                      setRegionId(e.target.value)
                      setSubsedeId('')
                      setStationId('')
                    }}
                  >
                    <option value="">Todas</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label htmlFor="subsedeFilter">Subsede</label>
                  <select
                    id="subsedeFilter"
                    value={subsedeId}
                    onChange={(e) => {
                      setSubsedeId(e.target.value)
                      setStationId('')
                    }}
                  >
                    <option value="">Todas</option>
                    {subsedes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {isEscuelaRegional && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      Solo podés generar reportes de tu propia Regional.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="stationFilter">
                Cuartel {reportDef.needsStation && <span style={{ color: 'var(--color-link)' }}>*</span>}
              </label>
              <select id="stationFilter" value={stationId} onChange={(e) => setStationId(e.target.value)} disabled={isStationOnly}>
                {!isStationOnly && <option value="">{reportDef.needsStation ? 'Seleccionar cuartel' : 'Todos'}</option>}
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {isStationOnly && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Solo podés generar reportes de tu propio cuartel.
                </p>
              )}
            </div>
          </div>
        )}

        {sectionOptions.length > 0 && (
          <div className="field">
            <span className="field-label">Qué incluir</span>
            <div className="filter-bar" role="group" aria-label="Qué incluir en el reporte">
              {sectionOptions.map((o) => (
                <button key={o.key} type="button" className="chip" aria-pressed={sections.includes(o.key)} onClick={() => toggleSection(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="field-error">{error}</p>}

        <button type="button" className="btn btn-primary btn-block" disabled={generating} onClick={handleGenerate}>
          {generating ? 'Generando PDF…' : 'Generar y descargar PDF'}
        </button>

        {confirmedKey === reportKey && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
            Reporte generado y descargado. Queda registrado en Auditoría.
          </p>
        )}
      </div>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        {availableReportTypesWithCoordinator.map((report) => (
          <button
            key={report.key}
            type="button"
            className="card-solid"
            style={{ textAlign: 'left', cursor: 'pointer', border: reportKey === report.key ? '2px solid var(--color-primary)' : undefined }}
            onClick={() => selectReport(report.key)}
          >
            <Icon name="chart" size={20} />
            <h3 style={{ margin: '8px 0 0', fontSize: 14 }}>{report.label}</h3>
          </button>
        ))}
      </div>
    </AppShell>
  )
}
