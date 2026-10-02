// Formateo de porcentajes: SIGER4 nunca redondea un porcentaje para mostrarlo.
// 89.94 se muestra "89.9", nunca "90" ni "89". Si hay más de un decimal se
// trunca (no se redondea) a la cantidad de decimales pedida — Math.round()/
// toFixed() redondean el último dígito mostrado, por eso no se usan acá.
export function truncateDecimals(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.trunc(value * factor) / factor
}

export function formatPercent(value: number, decimals = 1): string {
  return `${truncateDecimals(value, decimals)}%`
}

// Tamaño de archivo legible: "820 B", "34 KB", "1.2 MB".
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
