// SIGER4 - Novedades/actualizaciones del sistema, mostradas una sola vez por
// usuario (ver AppUpdateBanner.tsx). Fuente estática desde el frontend por
// ahora — si en el futuro conviene manejarlo desde la base (para poder
// publicar una novedad sin redeploy, o dirigirla a un subconjunto de
// usuarios), este archivo es el único lugar a reemplazar por un fetch: el
// resto del sistema (AppUpdateBanner, el helper de "ya visto") ya trabaja
// contra el tipo AppUpdate sin asumir de dónde viene.
//
// Cómo agregar una novedad nueva (ver DEPLOYMENT.md para más detalle):
//   1. Agregar un nuevo objeto AL PRINCIPIO de APP_UPDATES (el más reciente
//      primero — es el único que se muestra).
//   2. "id" tiene que ser único y estable (nunca reutilizar un id ya usado):
//      es la clave que decide si un usuario ya lo vio. Convención sugerida:
//      "YYYY-MM-DD-slug-corto".
//   3. Con guardar y desplegar alcanza — no hace falta ninguna migración ni
//      variable de entorno.
export type AppUpdateSeverity = 'info' | 'improvement' | 'important'

export interface AppUpdate {
  // Identificador único y estable de esta novedad — es la clave que se
  // guarda como "ya visto" (ver src/lib/appUpdateSeen.ts). Cambiar el id de
  // una novedad ya publicada hace que vuelva a mostrarse a todos.
  id: string
  // Fecha de publicación, formato "YYYY-MM-DD" — solo se muestra en el
  // banner, no participa en ninguna lógica.
  date: string
  title: string
  description: string
  changes: string[]
  severity: AppUpdateSeverity
}

// Únicamente el PRIMER elemento del array se muestra (la novedad más
// reciente) — ver getLatestAppUpdate() en AppUpdateBanner.tsx. El resto del
// array queda como historial en el código, no se descarta, por si en algún
// momento se agrega una pantalla de "novedades anteriores".
export const APP_UPDATES: AppUpdate[] = [
  {
    id: '2026-08-06-documentos-desktop',
    date: '2026-08-06',
    title: 'SIGER4 actualizado',
    description: 'Se hicieron mejoras y correcciones en el módulo de Documentos y en la experiencia mobile.',
    changes: [
      'Se mejoró la gestión de documentos.',
      'Se corrigió la carga de archivos desde escritorio.',
      'Se optimizó la experiencia mobile.',
      'Se actualizaron permisos y seguridad.',
    ],
    severity: 'improvement',
  },
]
