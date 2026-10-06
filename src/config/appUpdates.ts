// SIGER4 - Versión y novedades del sistema.
//
// Es la única fuente de la versión que ven los usuarios: la versión actual
// es la de la primera entrada de APP_UPDATES. Se muestra en el pie de cada
// pantalla, en Mi perfil y ajustes y en la página Novedades (/novedades),
// que lista todo el historial. La novedad más reciente además se muestra una
// vez a cada usuario al ingresar (AppUpdateBanner) y queda como
// notificación en /notificaciones (migraciones 0077/0079).
//
// Cómo publicar una versión (antes del commit y el deploy):
//   1. Agregar una entrada AL PRINCIPIO de APP_UPDATES, con:
//      - id único y estable, nunca reutilizado: "YYYY-MM-DD-slug-corto". Es
//        la clave de "ya visto" y de la notificación.
//      - version nueva: MAYOR.MENOR.PARCHE. MENOR para funciones nuevas o
//        mejoras visibles, PARCHE para correcciones, MAYOR para cambios de
//        fondo en la forma de trabajar.
//      - date (YYYY-MM-DD), title, summary y changes. Cada cambio con su
//        tipo (nuevo, mejora, correccion), el módulo y un texto para
//        usuarios: qué cambia para ellos, sin detalles técnicos.
//   2. Poner la misma versión en "version" de package.json (el build avisa
//      si no coinciden).
//   3. Commit y deploy. No hace falta migración ni variable de entorno.
export type AppUpdateSeverity = 'info' | 'improvement' | 'important'

export type AppUpdateChangeType = 'nuevo' | 'mejora' | 'correccion'

export interface AppUpdateChange {
  type: AppUpdateChangeType
  // Módulo o sección afectada, como la ve el usuario (Inventario, Escuela…).
  module: string
  text: string
}

export interface AppUpdate {
  // Identificador único y estable (ver src/lib/appUpdateSeen.ts). Cambiar el
  // id de una novedad ya publicada hace que vuelva a mostrarse a todos.
  id: string
  version: string
  // Fecha de publicación, "YYYY-MM-DD".
  date: string
  title: string
  summary: string
  changes: AppUpdateChange[]
  // Etiqueta del aviso al ingresar.
  severity: AppUpdateSeverity
}

export const APP_UPDATES: AppUpdate[] = [
  {
    id: '2026-10-06-roles-departamento',
    version: '1.7.0',
    date: '2026-10-06',
    title: 'Roles de departamento y avisos para cada departamento',
    summary: 'Coordinador y Miembro de Departamento son roles de la Regional que se asignan con sus departamentos, y cada departamento recibe sus propios avisos.',
    changes: [
      { type: 'nuevo', module: 'Usuarios', text: 'Roles Coordinador de Departamento y Miembro de Departamento: al elegirlos se marcan sus departamentos (uno o más). Ya no hace falta un rol de relleno para quien solo trabaja en un departamento.' },
      { type: 'nuevo', module: 'Notificaciones', text: 'Avisos para el coordinador y los miembros: informe nuevo, archivado o editado, actividad registrada, eventos, te sumaron, ahora coordinás y aval nuevo. Nunca le llegan a otro departamento.' },
      { type: 'mejora', module: 'Notificaciones', text: 'Cada aviso de un departamento muestra su origen ("Departamento Fuego") y aparece en el filtro Departamentos.' },
      { type: 'mejora', module: 'Inicio', text: 'El panel de tu departamento muestra sus pendientes y avisos sin leer ("Todo al día" si no hay) y accesos a informes, eventos y miembros.' },
      { type: 'mejora', module: 'Departamentos', text: 'Para ver un departamento hacen falta el rol y el departamento: si a alguien se le quita el rol, deja de verlo.' },
    ],
    severity: 'important',
  },
  {
    id: '2026-10-06-asistencia',
    version: '1.6.1',
    date: '2026-10-06',
    title: 'Resumen de asistencia corregido',
    summary: 'Ya se pueden cargar los resúmenes de asistencia, y el formulario pide solo lo necesario.',
    changes: [
      { type: 'correccion', module: 'Asistencia', text: 'Guardar un resumen de asistencia daba error. Ahora se guarda desde el celular y la computadora.' },
      { type: 'correccion', module: 'Cuarteles', text: 'También se corrigieron la carga de intervenciones y los cambios de estado del cuartel, del personal y de los vehículos, que daban el mismo error.' },
      { type: 'mejora', module: 'Asistencia', text: 'El formulario pide el período, la tasa (con coma o punto) y observaciones. La dotación sale del Personal del cuartel: ya no hay que cargar el total de miembros ni el promedio de presentes.' },
      { type: 'mejora', module: 'Asistencia', text: 'Si algo no está bien (tasa fuera de 0 a 100, fechas invertidas o un período ya cargado), te lo dice junto al campo.' },
    ],
    severity: 'important',
  },
  {
    id: '2026-10-05-roles-divisiones',
    version: '1.6.0',
    date: '2026-10-05',
    title: 'Roles por división: cada uno ve lo suyo',
    summary: 'Cada rol aplica a un cuartel, la Regional, la Escuela o uno o más departamentos, y SIGER4 muestra solo lo que corresponde a cada uno.',
    changes: [
      { type: 'nuevo', module: 'Inicio', text: 'Si coordinás o integrás un departamento, el Inicio te muestra sus últimos informes, próximos eventos y accesos directos. Con varios, elegís cuál ver.' },
      { type: 'nuevo', module: 'Departamentos', text: 'Eventos del departamento en el Calendario y avisos a todo el departamento: solo los ven y reciben sus integrantes.' },
      { type: 'mejora', module: 'Departamentos', text: 'Cada departamento lo ven su coordinador, sus integrantes e Informática; el Secretario Regional y el Director de Escuela, todos.' },
      { type: 'mejora', module: 'Usuarios', text: 'Al crear un usuario, cada rol pide dónde aplica (cuartel o Regional) y se pueden elegir sus departamentos. La ficha muestra "rol · dónde aplica".' },
      { type: 'mejora', module: 'Calendario', text: 'Cada cuartel ve sus eventos, los de su subsede y Regional y los de Escuela, no los de otros cuarteles.' },
      { type: 'correccion', module: 'Departamentos', text: 'La lista de integrantes muestra a los de otros cuarteles con su nombre y cuartel.' },
    ],
    severity: 'important',
  },
  {
    id: '2026-10-05-busqueda-ayuda',
    version: '1.5.0',
    date: '2026-10-05',
    title: 'Búsqueda global, Centro de ayuda y tareas en Inicio',
    summary: 'Encontrá cualquier cosa desde el encabezado, aprendé a usar cada sección en Ayuda y mirá en el Inicio lo que necesita tu acción.',
    changes: [
      { type: 'nuevo', module: 'Búsqueda', text: 'Buscá usuarios, cuarteles, documentos, informes, elementos, cursos, eventos y notificaciones desde el encabezado o con Ctrl+K. Solo aparece lo que podés abrir.' },
      { type: 'nuevo', module: 'Ayuda', text: 'Centro de ayuda con guías cortas para tu rol: pedir un elemento, cargar un informe, subir un aval y más.' },
      { type: 'mejora', module: 'Inicio', text: 'Tareas y pendientes agrupados por módulo: qué retirar, qué entregar, solicitudes en espera, avales e informes nuevos.' },
      { type: 'mejora', module: 'Notificaciones', text: 'Filtros por no leídas, importantes y módulo, "Marcar todas como leídas" y un botón para abrir lo relacionado.' },
      { type: 'nuevo', module: 'Departamentos', text: 'El coordinador y los integrantes reciben un aviso cuando se carga un informe en su departamento.' },
      { type: 'correccion', module: 'Notificaciones', text: 'Los avisos para todo el cuartel o la Regional se marcan como leídos solo para vos y ya no quedan pendientes en el contador.' },
    ],
    severity: 'important',
  },
  {
    id: '2026-10-03-inventario-novedades',
    version: '1.4.0',
    date: '2026-10-03',
    title: 'Préstamos de inventario, Novedades y más azul SIGER4',
    summary:
      'Se corrigieron las solicitudes de préstamo del Inventario, ahora podés ver la versión y el historial de cambios del sistema, y el modo claro tiene más identidad.',
    changes: [
      { type: 'correccion', module: 'Inventario', text: 'Informática y el Secretario Regional pueden solicitar elementos en nombre de un cuartel. Antes la pantalla no los dejaba.' },
      { type: 'mejora', module: 'Inventario', text: 'Cada elemento muestra si está disponible, reservado o prestado. Un elemento prestado no se puede volver a pedir hasta que se devuelva.' },
      { type: 'mejora', module: 'Inventario', text: '"Mis solicitudes" y una explicación de qué sigue en cada estado de la solicitud.' },
      { type: 'nuevo', module: 'Novedades', text: 'Esta sección: la versión actual de SIGER4 y qué cambió en cada actualización.' },
      { type: 'mejora', module: 'Diseño', text: 'En modo claro, el encabezado y el menú usan el azul de SIGER4.' },
      { type: 'correccion', module: 'Seguridad', text: 'Se reforzaron los permisos de los avisos automáticos del sistema.' },
    ],
    severity: 'improvement',
  },
  {
    id: '2026-10-03-informes-inicio',
    version: '1.3.0',
    date: '2026-10-03',
    title: 'Informes en Departamentos e Inicio renovado',
    summary: 'Los departamentos pueden guardar informes y actas con fotos y videos, y la pantalla de inicio se adapta a cada rol.',
    changes: [
      { type: 'nuevo', module: 'Departamentos', text: 'Informes y actas: redactá el informe en SIGER4 o subí el acta, con fotos, videos y documentos, desde la computadora o el celular.' },
      { type: 'mejora', module: 'Inicio', text: 'Al ingresar ves lo que requiere atención, accesos rápidos según tu rol y tus notificaciones sin leer.' },
      { type: 'mejora', module: 'Ingreso', text: 'Botón para ver la contraseña, opción para recordar tu email y guardado en el gestor del navegador.' },
      { type: 'mejora', module: 'General', text: 'El logo lleva al Inicio y tu foto a tu perfil.' },
      { type: 'correccion', module: 'General', text: 'En todo el sistema se usa "Regional" en lugar de "Región".' },
    ],
    severity: 'important',
  },
  {
    id: '2026-10-02-coordinadores-celular',
    version: '1.2.0',
    date: '2026-10-02',
    title: 'Coordinadores, carga desde el celular y Auditoría',
    summary: 'El coordinador de cada departamento se asigna en un solo lugar y los archivos se pueden subir desde el celular.',
    changes: [
      { type: 'mejora', module: 'Escuela', text: 'El coordinador de cada departamento se asigna una sola vez, en Departamentos, y ya puede ver y subir sus avales.' },
      { type: 'nuevo', module: 'Documentos', text: 'Carga de documentos, avales y fotos desde el celular, incluida la cámara.' },
      { type: 'mejora', module: 'Auditoría', text: 'Queda reservada al Dpto. de Informática y Estadística R4.' },
      { type: 'mejora', module: 'General', text: 'Mensajes claros cuando una sección no está disponible para tu rol.' },
    ],
    severity: 'improvement',
  },
  {
    id: '2026-10-02-avales-diseno',
    version: '1.1.0',
    date: '2026-10-02',
    title: 'Avales regionales y nuevo diseño',
    summary: 'Escuela suma los avales regionales por departamento y todo el sistema tiene un diseño nuevo.',
    changes: [
      { type: 'nuevo', module: 'Escuela', text: 'Avales regionales organizados por departamento.' },
      { type: 'mejora', module: 'Diseño', text: 'Nuevo diseño visual institucional en todas las pantallas, en modo claro y oscuro.' },
      { type: 'mejora', module: 'Roles', text: 'La guía de roles agrupa los permisos por tipo: Informática, Escuela, Regional y cuartel.' },
    ],
    severity: 'improvement',
  },
  {
    id: '2026-08-09-v1-0-beta',
    version: '1.0.0-beta.1',
    date: '2026-08-09',
    title: 'SIGER4 v1.0 beta',
    summary:
      'Primera versión estable de SIGER4 para uso institucional. Se reforzaron permisos y auditoría en todo el sistema, y se agregaron notificaciones y reportes nuevos.',
    changes: [
      { type: 'nuevo', module: 'Reportes', text: 'Reportes de Departamentos Regionales (general y por departamento) en PDF.' },
      { type: 'mejora', module: 'Auditoría', text: 'Auditoría filtrada según el rol, sin detalles técnicos para roles institucionales.' },
      { type: 'nuevo', module: 'Notificaciones', text: 'Avisos automáticos a Informática ante cambios sensibles (altas, bajas, roles y alcances).' },
      { type: 'nuevo', module: 'Notificaciones', text: 'Resumen semanal para Informática y recordatorios de devolución de préstamos.' },
      { type: 'correccion', module: 'General', text: 'Corrección de recargas inesperadas de la app al volver de segundo plano.' },
      { type: 'mejora', module: 'General', text: 'Revisión completa de permisos por rol en todos los módulos.' },
    ],
    severity: 'important',
  },
  {
    id: '2026-08-06-documentos-desktop',
    version: '0.9.0',
    date: '2026-08-06',
    title: 'SIGER4 actualizado',
    summary: 'Mejoras y correcciones en Documentos y en el uso desde el celular.',
    changes: [
      { type: 'mejora', module: 'Documentos', text: 'Se mejoró la gestión de documentos.' },
      { type: 'correccion', module: 'Documentos', text: 'Se corrigió la carga de archivos desde la computadora.' },
      { type: 'mejora', module: 'General', text: 'Se mejoró el uso desde el celular.' },
      { type: 'mejora', module: 'Seguridad', text: 'Se actualizaron permisos y seguridad.' },
    ],
    severity: 'improvement',
  },
]

// Versión actual del sistema: la de la novedad más reciente.
export const CURRENT_APP_UPDATE = APP_UPDATES[0]
export const CURRENT_VERSION = CURRENT_APP_UPDATE.version

export const CHANGE_TYPE_LABEL: Record<AppUpdateChangeType, string> = {
  nuevo: 'Nuevo',
  mejora: 'Mejora',
  correccion: 'Corrección',
}

export function formatUpdateDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}
