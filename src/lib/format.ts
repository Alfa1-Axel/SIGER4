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
