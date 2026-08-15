// Helpers de redacción para los reportes PDF: SIGER4 guarda algunos nombres
// (subsedes) con un prefijo institucional ya incluido en el dato real (ej.
// subsedes.name = "Subsede Luque", ver migración 0001/0007) -- eso es correcto
// como nombre propio, pero si el texto generado antepone la MISMA palabra
// ("subsede " + nombre), queda duplicado ("subsede Subsede Luque"). Estos
// helpers arman las frases evitando esa duplicación, sin tocar el dato
// guardado en la base.

// Nombre de subsede "corto", sin el prefijo "Subsede " si ya lo trae (para
// usar junto a una etiqueta que YA dice "Subsede:" — mostrar "Luque" en vez
// de "Subsede Luque" evita la duplicación). Si el nombre no trae el prefijo,
// se devuelve tal cual.
export function shortSubsedeName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.replace(/^subsede\s+/i, '').trim() || name
}

// Cuartel + subsede + estado en una frase institucional corta, sin duplicar
// "Cuartel"/"Subsede" ni mostrar campos crudos. Ej.:
// "Cuartel: Asociación Bomberos Voluntarios Villa del Rosario (030). Subsede: Luque. Estado: operativo."
export function stationSummaryLine(station: {
  name: string
  code: string
  status: string
  subsede?: { name: string } | null
}): string {
  const subsede = shortSubsedeName(station.subsede?.name)
  const parts = [`Cuartel: ${station.name} (${station.code}).`, subsede ? `Subsede: ${subsede}.` : null, `Estado: ${station.status}.`]
  return parts.filter(Boolean).join(' ')
}
