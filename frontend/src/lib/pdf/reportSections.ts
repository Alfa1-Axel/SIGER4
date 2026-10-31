// Qué información puede incluir cada reporte ("tipo de información"). Quien
// genera el reporte elige qué secciones quiere; por defecto van todas.

export type ReportSection =
  | 'efectivos'
  | 'asistencia'
  | 'intervenciones'
  | 'moviles'
  | 'inventario'
  | 'pendientes'
  | 'integrantes'
  | 'informes'
  | 'eventos'
  | 'archivos'
  | 'actividad'

export interface ReportSectionOption {
  key: ReportSection
  label: string
}

// Reportes que dejan elegir secciones.
export const REPORT_SECTION_OPTIONS: Partial<Record<string, ReportSectionOption[]>> = {
  cuartel_general: [
    { key: 'efectivos', label: 'Efectivos' },
    { key: 'asistencia', label: 'Asistencia' },
    { key: 'intervenciones', label: 'Intervenciones' },
    { key: 'moviles', label: 'Móviles' },
    { key: 'inventario', label: 'Inventario' },
    { key: 'pendientes', label: 'Pendientes' },
  ],
  regional_consolidado: [
    { key: 'efectivos', label: 'Efectivos' },
    { key: 'asistencia', label: 'Asistencia' },
    { key: 'intervenciones', label: 'Intervenciones' },
    { key: 'moviles', label: 'Móviles' },
    { key: 'pendientes', label: 'Cargas pendientes' },
  ],
  departamento_especifico: [
    { key: 'integrantes', label: 'Coordinador e integrantes' },
    { key: 'informes', label: 'Informes y actas' },
    { key: 'eventos', label: 'Eventos' },
    { key: 'archivos', label: 'Archivos' },
    { key: 'actividad', label: 'Actividad' },
  ],
}

export function allSections(reportKey: string): ReportSection[] {
  return (REPORT_SECTION_OPTIONS[reportKey] ?? []).map((o) => o.key)
}
