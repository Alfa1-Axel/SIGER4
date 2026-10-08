// Efectivos del cuartel: cantidades por categoría (0108, año y historial en
// 0109). Las categorías y su orden están acá, en un solo lugar: lo usan la
// ficha del cuartel, Asistencia y los reportes.

export type StaffingCategoryKey =
  | 'aspirantes_menores'
  | 'aspirantes_mayores'
  | 'bomberos_nivel_1'
  | 'bomberos_nivel_2'
  | 'bomberos_nivel_3'
  | 'bomberos_nivel_4'
  | 'personal_reserva'
  | 'cuerpo_auxiliar'

export type StaffingCounts = Record<StaffingCategoryKey, number>

export interface StaffingCategory {
  key: StaffingCategoryKey
  label: string
}

export interface StaffingGroup {
  title: string
  categories: StaffingCategory[]
}

// Agrupadas como se piensan los efectivos del cuartel: aspirantes, personal
// activo (bomberos por nivel), y reserva con cuerpo auxiliar.
export const STAFFING_GROUPS: StaffingGroup[] = [
  {
    title: 'Aspirantes',
    categories: [
      { key: 'aspirantes_menores', label: 'Aspirantes menores' },
      { key: 'aspirantes_mayores', label: 'Aspirantes mayores' },
    ],
  },
  {
    title: 'Personal activo',
    categories: [
      { key: 'bomberos_nivel_1', label: 'Bomberos Nivel 1' },
      { key: 'bomberos_nivel_2', label: 'Bomberos Nivel 2' },
      { key: 'bomberos_nivel_3', label: 'Bomberos Nivel 3' },
      { key: 'bomberos_nivel_4', label: 'Bomberos Nivel 4' },
    ],
  },
  {
    title: 'Reserva y cuerpo auxiliar',
    categories: [
      { key: 'personal_reserva', label: 'Reserva' },
      { key: 'cuerpo_auxiliar', label: 'Cuerpo auxiliar' },
    ],
  },
]

export const STAFFING_CATEGORIES: StaffingCategory[] = STAFFING_GROUPS.flatMap((g) => g.categories)

// Tope por categoría: el mismo que la base (station_staffing_counts_range).
export const MAX_STAFFING_COUNT = 9999

export const EMPTY_STAFFING: StaffingCounts = {
  aspirantes_menores: 0,
  aspirantes_mayores: 0,
  bomberos_nivel_1: 0,
  bomberos_nivel_2: 0,
  bomberos_nivel_3: 0,
  bomberos_nivel_4: 0,
  personal_reserva: 0,
  cuerpo_auxiliar: 0,
}

// Qué integra el total, para decirlo en pantalla y en los reportes.
export const STAFFING_TOTAL_NOTE = 'Suma de aspirantes, bomberos de Nivel 1 a 4, reserva y cuerpo auxiliar.'

// Años que se ofrecen como referencia: el actual, el siguiente (para cargar
// por adelantado) y cinco hacia atrás. La base acepta de 2000 a 2100.
export function staffingYearOptions(now: Date = new Date()): number[] {
  const current = now.getFullYear()
  return Array.from({ length: 7 }, (_, i) => current + 1 - i)
}

// Total de los efectivos: la suma de las categorías. En la base lo calcula la
// misma suma (station_staffing.total), acá se usa para mostrarlo en vivo
// mientras se carga.
export function sumStaffing(counts: StaffingCounts): number {
  return STAFFING_CATEGORIES.reduce((sum, c) => sum + counts[c.key], 0)
}

export function staffingCountsOf(row: Partial<StaffingCounts> | null | undefined): StaffingCounts {
  const counts = { ...EMPTY_STAFFING }
  for (const c of STAFFING_CATEGORIES) {
    const value = row?.[c.key]
    counts[c.key] = typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return counts
}

export function sameStaffing(a: StaffingCounts, b: StaffingCounts): boolean {
  return STAFFING_CATEGORIES.every((c) => a[c.key] === b[c.key])
}
