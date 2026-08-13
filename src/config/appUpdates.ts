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
//      es la clave que decide si un usuario ya lo vio, Y la clave de
//      deduplicación de la notificación interna (ver más abajo). Convención
//      sugerida: "YYYY-MM-DD-slug-corto".
//   3. Con guardar y desplegar alcanza — no hace falta ninguna migración ni
//      variable de entorno nueva (la migración 0077, que agrega el tipo de
//      notificación y la columna de deduplicación, ya está aplicada de una
//      vez para siempre — no hay que tocarla por cada novedad nueva).
//
// Notificación interna automática (desde 2026-08-13, migración 0077): cada
// vez que AppUpdateBanner.tsx detecta que APP_UPDATES[0] es una novedad que
// el usuario todavía no vio (independiente de si el banner llega a
// mostrarse o no en este dispositivo puntual), inserta una notificación
// interna ("Nueva actualización disponible. Ingresá para conocer las
// novedades.") en /notificaciones — persistente hasta que el usuario la
// marque como leída, visible desde cualquier sesión/dispositivo (a
// diferencia del banner, que es "una vez por navegador" vía localStorage).
// Tocar esa notificación reabre el modal de esa novedad puntual (ver
// forceShowAppUpdateBanner en src/lib/appUpdateBannerControl.ts). No hace
// falta ningún paso manual para esto — se dispara solo con solo agregar la
// entrada nueva acá arriba.
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
    id: '2026-08-09-v1-0-beta',
    date: '2026-08-09',
    title: 'SIGER4 v1.0 beta',
    description: 'Primera versión estable de SIGER4 para uso institucional. Se reforzaron permisos y auditoría en todo el sistema, y se agregaron notificaciones y reportes nuevos.',
    changes: [
      'Reportes de Departamentos Regionales (general y por departamento) en PDF.',
      'Auditoría filtrada según el rol de cada usuario, sin detalles técnicos para roles institucionales.',
      'Notificaciones automáticas a Informática ante cambios sensibles (altas, bajas, roles, alcances).',
      'Resumen semanal enriquecido para Informática y recordatorios automáticos de devolución de préstamos.',
      'Corrección de recargas inesperadas de la app al volver de segundo plano.',
      'Revisión completa de permisos por rol en todos los módulos.',
    ],
    severity: 'important',
  },
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
