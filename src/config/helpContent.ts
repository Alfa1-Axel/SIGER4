// SIGER4 - Contenido del Centro de ayuda (/ayuda) y de la búsqueda global.
//
// Artículos cortos, para usuarios: qué hacer, paso a paso, y a qué pantalla
// ir. Cada artículo tiene un público (audience): solo lo ven quienes pueden
// hacer eso en el sistema. Para agregar o corregir ayuda, se edita este
// archivo; si el cambio es relevante, sumarlo también a Novedades
// (src/config/appUpdates.ts).

import { canUseModule } from '../lib/moduleAccess'
import type { AppModule } from '../lib/moduleAccess'

// Público de un artículo. 'solo_departamento' y 'otros_roles' separan al modo
// departamento (quien solo es Coordinador o Miembro de Departamento) de los
// demás: cada uno ve la ayuda de lo que su menú le ofrece.
export type HelpAudience =
  | 'todos'
  | 'solo_departamento'
  | 'otros_roles'
  | 'mis_departamentos'
  | 'pedir_prestamos'
  | 'gestionar_prestamos'
  | 'departamentos'
  | 'escuela_avales'
  | 'escuela_cursos'
  | 'subir_documentos'
  | 'gestionar_usuarios'
  | 'informatica'
  | 'auditoria'
  | 'avisar_departamento'

export interface HelpAudienceContext {
  isAdmin: boolean
  isSuperAdmin: boolean
  canRequestLoans: boolean
  canManageLoans: boolean
  hasReportsAccess: boolean
  hasAvalesAccess: boolean
  isEscuelaRole: boolean
  canUploadDocuments: boolean
  canManageUsers: boolean
  // Coordinador de algún departamento, Secretario Regional o Informática.
  canNotifyDepartments: boolean
  // Modo departamento: sus únicos roles son de departamento (lib/moduleAccess.ts).
  departmentOnly: boolean
  // Coordina o integra al menos un departamento, con su rol.
  hasOwnDepartments: boolean
}

export type HelpSection = 'inicio' | 'inventario' | 'departamentos' | 'escuela' | 'documentos' | 'cuenta' | 'administracion' | 'faq'

export const HELP_SECTION_LABEL: Record<HelpSection, string> = {
  inicio: 'Primeros pasos',
  inventario: 'Inventario y préstamos',
  departamentos: 'Departamentos',
  escuela: 'Escuela',
  documentos: 'Documentos',
  cuenta: 'Tu cuenta',
  administracion: 'Administración',
  faq: 'Preguntas frecuentes',
}

export const HELP_SECTION_ORDER: HelpSection[] = ['inicio', 'inventario', 'departamentos', 'escuela', 'documentos', 'cuenta', 'administracion', 'faq']

export interface HelpArticle {
  id: string
  section: HelpSection
  audience: HelpAudience
  title: string
  summary: string
  steps?: string[]
  // Para las preguntas frecuentes: una respuesta corta en vez de pasos.
  answer?: string
  links?: { label: string; to: string }[]
  keywords: string[]
  // Módulo del que habla: en modo departamento no se muestra la ayuda de un
  // módulo que ese modo no abre (Inventario, Escuela, Documentos…).
  module?: AppModule
}

export function canSeeHelpArticle(article: Pick<HelpArticle, 'audience' | 'module'>, ctx: HelpAudienceContext): boolean {
  if (article.module && !canUseModule(article.module, ctx.departmentOnly)) return false
  switch (article.audience) {
    case 'todos':
      return true
    case 'solo_departamento':
      return ctx.departmentOnly
    case 'otros_roles':
      return !ctx.departmentOnly
    case 'mis_departamentos':
      return ctx.hasOwnDepartments
    case 'pedir_prestamos':
      return ctx.canRequestLoans
    case 'gestionar_prestamos':
      return ctx.canManageLoans
    case 'departamentos':
      return ctx.hasReportsAccess
    case 'escuela_avales':
      return ctx.hasAvalesAccess
    case 'escuela_cursos':
      return ctx.isEscuelaRole || ctx.isAdmin
    case 'subir_documentos':
      return ctx.canUploadDocuments
    case 'gestionar_usuarios':
      return ctx.canManageUsers
    case 'informatica':
      return ctx.isAdmin
    case 'auditoria':
      return ctx.isSuperAdmin
    case 'avisar_departamento':
      return ctx.canNotifyDepartments
    default:
      return false
  }
}

// Minúsculas y sin tildes: "prestamo" encuentra "préstamo".
export function foldText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function helpArticleMatches(article: HelpArticle, query: string): boolean {
  const q = foldText(query.trim())
  if (!q) return true
  return foldText(`${article.title} ${article.summary} ${article.keywords.join(' ')} ${(article.steps ?? []).join(' ')} ${article.answer ?? ''}`).includes(q)
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------- Primeros pasos ----------------
  {
    id: 'usar-inicio',
    section: 'inicio',
    audience: 'otros_roles',
    title: 'Cómo usar el Inicio',
    summary: 'Lo que requiere tu atención, accesos rápidos y lo que viene.',
    steps: [
      '"Tareas y pendientes" junta lo que necesita una acción tuya, agrupado por módulo. Lo urgente aparece primero.',
      'Tocá una tarea para ir directo a la pantalla donde se resuelve.',
      '"Accesos rápidos" te lleva a lo que más usás según tu rol.',
      'Más abajo están los eventos de hoy y los próximos.',
    ],
    links: [{ label: 'Ir al Inicio', to: '/panel' }],
    keywords: ['inicio', 'panel', 'pendientes', 'tareas', 'empezar'],
  },
  {
    id: 'buscar',
    section: 'inicio',
    audience: 'otros_roles',
    title: 'Buscar en SIGER4',
    summary: 'Encontrá documentos, informes, elementos, cuarteles y más desde cualquier pantalla.',
    steps: [
      'Tocá "Buscar en SIGER4" arriba (en el celular, la lupa) o usá Ctrl + K en la computadora.',
      'Escribí al menos 2 letras: los resultados aparecen agrupados por módulo.',
      'Usá los filtros de arriba para buscar en un solo módulo y ver más resultados.',
      'Solo aparece lo que tu rol puede abrir.',
    ],
    keywords: ['buscar', 'búsqueda', 'encontrar', 'ctrl k'],
  },
  {
    id: 'notificaciones',
    section: 'inicio',
    audience: 'otros_roles',
    title: 'Ver y ordenar tus notificaciones',
    summary: 'Filtrá por no leídas, importantes o módulo, y marcá todo como leído.',
    steps: [
      'Abrí Notificaciones desde la campana del encabezado.',
      'Filtrá por "No leídas", "Importantes" o por módulo (Inventario, Escuela, Documentos…).',
      'Tocá "Abrir" para ir a lo que se avisa, o "Leída" para sacarla de pendientes.',
      '"Marcar todas como leídas" limpia la bandeja de una vez.',
    ],
    links: [{ label: 'Ir a Notificaciones', to: '/notificaciones' }],
    keywords: ['notificaciones', 'avisos', 'campana', 'leídas', 'no leídas'],
  },
  {
    id: 'push',
    section: 'inicio',
    audience: 'todos',
    title: 'Recibir avisos en el celular',
    summary: 'Activá las notificaciones push para enterarte aunque no tengas SIGER4 abierto.',
    steps: [
      'Entrá a Mi perfil y ajustes, sección "Notificaciones push".',
      'Tocá "Activar notificaciones push" y aceptá el permiso que pide el navegador.',
      'En Android conviene instalar SIGER4: menú del navegador → "Agregar a la pantalla de inicio".',
      'En iPhone, primero agregá SIGER4 a la pantalla de inicio y abrilo desde ahí.',
    ],
    links: [{ label: 'Ir a Mi perfil y ajustes', to: '/ajustes' }],
    keywords: ['push', 'celular', 'avisos', 'notificaciones', 'activar', 'instalar'],
  },
  {
    id: 'novedades',
    section: 'inicio',
    audience: 'todos',
    title: 'Ver qué cambió en SIGER4',
    summary: 'La versión actual y las mejoras de cada actualización.',
    steps: [
      'Tocá el número de versión que aparece en el pie de cualquier pantalla o entrá a Novedades desde el menú.',
      'Cada versión lista lo nuevo, las mejoras y las correcciones, con el módulo afectado.',
    ],
    links: [{ label: 'Ir a Novedades', to: '/novedades' }],
    keywords: ['novedades', 'versión', 'cambios', 'actualización'],
  },

  // ---------------- Inventario ----------------
  {
    id: 'pedir-elemento',
    section: 'inventario',
    audience: 'pedir_prestamos',
    module: 'inventario',
    title: 'Pedir un elemento prestado',
    summary: 'Solicitá herramientas o equipos del Inventario Regional para tu cuartel.',
    steps: [
      'Entrá a Inventario y tocá el elemento.',
      'Si dice "Disponible para pedir prestado", tocá "Solicitar préstamo".',
      'Elegí el cuartel (si te lo pide), contá para qué lo necesitan y la devolución estimada.',
      'Tocá "Enviar solicitud". Te avisamos cuando el responsable la apruebe o la rechace.',
    ],
    links: [{ label: 'Ir a Inventario', to: '/inventario' }],
    keywords: ['inventario', 'pedir', 'préstamo', 'solicitar', 'elemento', 'herramienta', 'equipo'],
  },
  {
    id: 'mis-solicitudes',
    section: 'inventario',
    audience: 'todos',
    module: 'inventario',
    title: 'Ver el estado de mis solicitudes',
    summary: 'Pendiente, aprobada, prestada o devuelta: qué significa cada estado.',
    steps: [
      'Entrá a Inventario → "Solicitudes" y dejá activado "Mis solicitudes".',
      'Pendiente: el responsable todavía no respondió. Aprobada: está reservado para tu cuartel, coordiná el retiro.',
      'Prestado: tu cuartel lo tiene. Devuelto: el préstamo terminó.',
      'Mientras está pendiente o aprobada, la podés cancelar desde la solicitud.',
    ],
    links: [{ label: 'Ir a Solicitudes', to: '/inventario/solicitudes' }],
    keywords: ['solicitudes', 'estado', 'préstamo', 'aprobada', 'pendiente', 'devolución'],
  },
  {
    id: 'gestionar-prestamos',
    section: 'inventario',
    audience: 'gestionar_prestamos',
    module: 'inventario',
    title: 'Aprobar y registrar préstamos',
    summary: 'Aprobá o rechazá pedidos y registrá el retiro y la devolución.',
    steps: [
      'Las solicitudes para revisar aparecen en tu Inicio, en "Tareas y pendientes".',
      'Abrí la solicitud y tocá "Aprobar" o "Rechazar" (con el motivo).',
      'Cuando el cuartel lo retira, registrá el retiro con el estado del elemento. Al volver, la devolución.',
      'Un elemento prestado no se puede aprobar para otro cuartel hasta que se devuelva.',
    ],
    links: [{ label: 'Ir a Solicitudes', to: '/inventario/solicitudes' }],
    keywords: ['aprobar', 'rechazar', 'retiro', 'devolución', 'préstamo', 'responsable'],
  },

  // ---------------- Departamentos ----------------
  {
    id: 'cargar-informe',
    section: 'departamentos',
    audience: 'departamentos',
    title: 'Cargar un informe o un acta',
    summary: 'Subí el acta o el informe de tu departamento, con fotos y videos.',
    steps: [
      'Entrá a tu departamento (menú "Mi departamento" o "Departamentos") → "Nuevo" → "Cargar informe o acta".',
      'Elegí el archivo, o tocá "Sacar foto" para fotografiar el papel. Podés sumar fotos y videos.',
      'Revisá el título (se completa con el nombre del archivo), el tipo y la fecha.',
      'Tocá "Guardar informe". Lo ven el coordinador, los miembros e Informática, y les llega un aviso.',
    ],
    links: [{ label: 'Ir a Departamentos', to: '/departamentos' }],
    keywords: ['informe', 'acta', 'departamento', 'cargar', 'subir', 'fotos', 'video'],
  },
  {
    id: 'redactar-informe',
    section: 'departamentos',
    audience: 'departamentos',
    title: 'Redactar un informe en SIGER4',
    summary: 'Escribí el informe directamente, sin archivo.',
    steps: [
      'Entrá a tu departamento y tocá "Nuevo" → "Redactar informe".',
      'Escribí qué se hizo, quiénes participaron y qué se resolvió.',
      'Si querés, sumá fotos de respaldo. Tocá "Guardar informe".',
    ],
    links: [{ label: 'Ir a Departamentos', to: '/departamentos' }],
    keywords: ['redactar', 'informe', 'escribir', 'departamento'],
  },
  {
    id: 'evento-departamento',
    section: 'departamentos',
    audience: 'departamentos',
    title: 'Cargar un evento del departamento',
    summary: 'Reuniones o prácticas que solo ven y reciben los miembros.',
    steps: [
      'Entrá a tu departamento (o desde el Inicio, "Nuevo evento").',
      'Tocá "Nuevo" → "Evento del departamento".',
      'Completá título, tipo y fecha. Si querés, marcá "Notificar al crear" o un recordatorio.',
      'El aviso y el recordatorio les llegan solo al coordinador y a los miembros.',
    ],
    links: [{ label: 'Ir a Departamentos', to: '/departamentos' }],
    keywords: ['evento', 'reunión', 'calendario', 'departamento', 'práctica'],
  },
  {
    id: 'avisar-departamento',
    section: 'departamentos',
    audience: 'avisar_departamento',
    title: 'Avisar a todo el departamento',
    summary: 'Un aviso que le llega a cada miembro, también al celular.',
    steps: [
      'Entrá al departamento y tocá "Nuevo" → "Aviso al departamento" (o "Avisar al departamento" desde el Inicio).',
      'Elegí el tipo, escribí el título y el mensaje.',
      'Tocá "Enviar notificación": te confirmamos a cuántas personas les llegó.',
      'No les llega a otros departamentos.',
    ],
    links: [{ label: 'Ir a Departamentos', to: '/departamentos' }],
    keywords: ['aviso', 'avisar', 'notificar', 'notificación', 'departamento', 'coordinador'],
  },

  // ---------------- Modo departamento (Coordinador y Miembro) ----------------
  {
    id: 'usar-inicio-departamento',
    section: 'inicio',
    audience: 'solo_departamento',
    title: 'Cómo usar el Inicio de tu departamento',
    summary: 'Tu departamento, lo que pide atención y lo último, en una pantalla.',
    steps: [
      'Arriba ves tu nombre y tu rol con el departamento ("Coordinador de Fuego", "Miembro de Forestal").',
      '"Pendientes y avisos" junta lo que necesita tu atención. Si no hay nada, dice "Todo al día".',
      'Más abajo están los últimos informes y actas y los próximos eventos de tu departamento.',
      'Si estás en más de un departamento, elegí cuál ver con los botones de arriba de la tarjeta.',
      '"Cargar informe", "Nuevo evento" y los accesos de abajo te llevan directo a lo que más usás.',
    ],
    links: [{ label: 'Ir al Inicio', to: '/panel' }],
    keywords: ['inicio', 'panel', 'pendientes', 'avisos', 'departamento', 'todo al día', 'empezar'],
  },
  {
    id: 'buscar-departamento',
    section: 'inicio',
    audience: 'solo_departamento',
    title: 'Buscar en SIGER4',
    summary: 'Encontrá tu departamento, sus informes, eventos, avisos y la ayuda.',
    steps: [
      'Tocá la lupa de arriba (o Ctrl + K en la computadora).',
      'Escribí al menos 2 letras: los resultados aparecen agrupados.',
      'Solo se busca en lo tuyo: tu departamento, sus informes y actas, sus eventos, tus notificaciones, la ayuda y las novedades.',
    ],
    keywords: ['buscar', 'búsqueda', 'encontrar', 'ctrl k', 'informe', 'departamento'],
  },
  {
    id: 'notificaciones-departamento',
    section: 'inicio',
    audience: 'solo_departamento',
    title: 'Ver las notificaciones de tu departamento',
    summary: 'Los avisos de tu departamento y los tuyos, con su origen y su propio estado de leído.',
    steps: [
      'Abrí Notificaciones desde la campana del encabezado. El número rojo son las que no leíste.',
      'Los avisos de tu departamento dicen de dónde vienen: "Departamento Fuego".',
      'Filtrá por "No leídas" o por "Departamentos". Tocá "Abrir" para ir a lo que se avisa, o "Leída" para sacarla de pendientes.',
      'Marcar una como leída es solo tuyo: no cambia nada para el resto del departamento.',
    ],
    links: [{ label: 'Ir a Notificaciones', to: '/notificaciones' }],
    keywords: ['notificaciones', 'avisos', 'campana', 'departamento', 'leídas', 'no leídas', 'origen'],
  },
  {
    id: 'ver-mi-departamento',
    section: 'departamentos',
    audience: 'mis_departamentos',
    title: 'Ver mi departamento',
    summary: 'Sus miembros, informes, actas y eventos, en un solo lugar.',
    steps: [
      'Entrá a "Mi departamento" desde el menú (si estás en varios, "Mis departamentos" y elegí uno). También desde "Ver departamento" en el Inicio.',
      'Arriba están el coordinador y la cantidad de miembros. Más abajo, la lista de miembros.',
      'En "Informes y actas" ves lo que cargó el departamento: tocá uno para leerlo, ver sus fotos y descargarlo.',
      'En "Eventos" están las reuniones y prácticas del departamento.',
      'Solo ves tus departamentos: no los de otros.',
    ],
    links: [{ label: 'Ir a mi departamento', to: '/departamentos' }],
    keywords: ['departamento', 'miembros', 'informes', 'actas', 'eventos', 'ver', 'mi departamento'],
  },
  {
    id: 'ver-informes',
    section: 'departamentos',
    audience: 'mis_departamentos',
    title: 'Ver y descargar informes y actas',
    summary: 'Leé un informe, mirá sus fotos y bajalo.',
    steps: [
      'Entrá a tu departamento: en "Informes y actas" están ordenados del más nuevo al más viejo.',
      'Filtrá por tipo de informe y, si hace falta, mostrá también los archivados. Para buscar por palabras, usá la lupa de arriba.',
      'Tocá un informe para leerlo y ver sus archivos y fotos. "Descargar" baja el archivo original.',
      'Si lo cargaste vos (o coordinás el departamento), también lo podés editar o archivar.',
    ],
    links: [{ label: 'Ir a mi departamento', to: '/departamentos' }],
    keywords: ['informe', 'acta', 'descargar', 'ver', 'archivo', 'foto', 'leer'],
  },
  {
    id: 'que-puedo-hacer-departamento',
    section: 'cuenta',
    audience: 'solo_departamento',
    title: 'Qué puedo hacer con mi rol',
    summary: 'Lo que permite ser Coordinador o Miembro de Departamento.',
    steps: [
      'Los dos roles ven su departamento: miembros, informes, actas, eventos y avisos. No ven otros departamentos.',
      'Los dos pueden cargar y redactar informes y actas, y cargar eventos del departamento. Cada uno edita lo que cargó.',
      'El Coordinador además edita y archiva todos los informes del departamento, avisa a todos los miembros y sube los avales del departamento.',
      'El Miembro no avisa a todo el departamento, no archiva informes ajenos y no sube avales.',
      'Cuarteles, Escuela, Documentos, Inventario, Reportes y Usuarios no forman parte de estos roles: por eso no aparecen en el menú.',
      'Si te asignan otro rol además, vas a ver también lo que ese rol permite.',
    ],
    links: [{ label: 'Ver mis roles', to: '/ajustes' }],
    keywords: ['rol', 'permisos', 'coordinador', 'miembro', 'departamento', 'qué puedo hacer', 'puedo'],
  },
  {
    id: 'sin-seccion-departamento',
    section: 'faq',
    audience: 'solo_departamento',
    title: 'Qué hacer si no veo una sección',
    summary: 'Tu menú muestra solo lo que tu rol necesita para trabajar en tu departamento.',
    answer:
      'Ver menos es normal: Coordinador y Miembro de Departamento usan su departamento, el calendario del departamento, las notificaciones, la ayuda y su perfil. Si no ves tu departamento, todavía no te asignaron uno. Si necesitás otra sección (por ejemplo Documentos o Inventario), pedile a Informática R4 que te asigne el rol que corresponde, contando qué necesitás hacer.',
    keywords: ['menú', 'sección', 'no veo', 'falta', 'permiso', 'departamento', 'rol'],
  },

  // ---------------- Escuela ----------------
  {
    id: 'subir-aval',
    section: 'escuela',
    audience: 'escuela_avales',
    title: 'Subir un aval regional',
    summary: 'Cargá avales de la Escuela en el departamento que corresponde.',
    steps: [
      'Entrá a Escuela → "Avales regionales" y tocá "Subir aval".',
      'Elegí el departamento (si coordinás uno, ya viene elegido).',
      'Elegí el archivo o sacale una foto, y completá el título.',
      'Tocá "Subir aval". El coordinador de un departamento ve solo el suyo.',
    ],
    links: [{ label: 'Ir a Avales', to: '/escuela/avales' }],
    keywords: ['aval', 'avales', 'escuela', 'subir', 'departamento'],
  },
  {
    id: 'cursos',
    section: 'escuela',
    audience: 'escuela_cursos',
    module: 'escuela',
    title: 'Cursos de la Escuela',
    summary: 'Consultá y cargá cursos y capacitaciones.',
    steps: [
      'Entrá a Escuela → "Cursos".',
      'Con permiso de edición, tocá "Nuevo curso" para cargar uno, o un curso existente para actualizarlo.',
    ],
    links: [{ label: 'Ir a Escuela', to: '/escuela' }],
    keywords: ['cursos', 'capacitación', 'escuela'],
  },

  // ---------------- Documentos ----------------
  {
    id: 'subir-documento',
    section: 'documentos',
    audience: 'subir_documentos',
    module: 'documentos',
    title: 'Subir un documento',
    summary: 'Circulares, actas y manuales para tu Regional o cuartel.',
    steps: [
      'Entrá a Documentos, abrí la carpeta y tocá "Subir documento".',
      'Elegí el archivo o sacale una foto, poné un título y el tipo (circular, acta…).',
      'Elegí para quién es: Regional, subsede, cuartel o una persona.',
    ],
    links: [{ label: 'Ir a Documentos', to: '/documentos' }],
    keywords: ['documento', 'circular', 'subir', 'archivo', 'carpeta'],
  },

  // ---------------- Cuenta ----------------
  {
    id: 'mi-perfil',
    section: 'cuenta',
    audience: 'todos',
    title: 'Cambiar mi contraseña o mi foto',
    summary: 'Tus datos, foto y contraseña, en Mi perfil y ajustes.',
    steps: [
      'Tocá tu foto (arriba a la derecha) o entrá a "Mi perfil y ajustes".',
      'Desde ahí cambiás tu foto, tus datos de contacto y tu contraseña.',
    ],
    links: [{ label: 'Ir a Mi perfil', to: '/ajustes' }],
    keywords: ['contraseña', 'foto', 'perfil', 'datos', 'cuenta'],
  },
  {
    id: 'sin-permiso',
    section: 'cuenta',
    audience: 'todos',
    title: 'Qué hacer si no tengo permiso',
    summary: 'Cada rol ve y hace cosas distintas. Si te falta algo, se pide.',
    steps: [
      'Si una pantalla dice "No tenés permiso", es por tu rol o tu alcance, no por un error.',
      'Revisá en "Roles y permisos" qué puede hacer cada rol.',
      'Si necesitás un acceso, pedíselo a Informática R4 (o al coordinador de tu departamento, si es para Departamentos).',
    ],
    links: [{ label: 'Ver Roles y permisos', to: '/roles' }],
    keywords: ['permiso', 'acceso', 'no puedo', 'rol', 'denegado'],
  },
  {
    id: 'roles',
    section: 'cuenta',
    audience: 'todos',
    title: 'Qué significa cada rol',
    summary: 'El rol dice qué hacés; la división (cuartel, Regional, Escuela o departamento), dónde.',
    steps: [
      'Informática administra el sistema y ve todo. La Auditoría es solo de Dpto. Informática y Estadística R4.',
      'Los roles de cuartel (Jefe de Cuerpo Activo, Presidente, usuario de carga…) ven y cargan los datos de su cuartel, no de otros.',
      'El Secretario Regional ve la Regional completa, también todos los departamentos.',
      'El Coordinador y el Secretario de Escuela ven los avales de todos los departamentos.',
      'Coordinador de Departamento y Miembro de Departamento son roles de la Regional que van con sus departamentos (Fuego, Forestal, FASME…): ven solo esos departamentos, con sus miembros, informes, actas, eventos y avisos.',
      'Tus roles y dónde aplican están en Mi perfil y ajustes.',
    ],
    links: [
      { label: 'Ver Roles y permisos', to: '/roles' },
      { label: 'Ver mis roles', to: '/ajustes' },
    ],
    keywords: ['roles', 'permisos', 'informática', 'escuela', 'regional', 'cuartel', 'división', 'alcance', 'departamento', 'coordinador', 'miembro', 'integrante'],
  },

  // ---------------- Administración ----------------
  {
    id: 'crear-usuario',
    section: 'administracion',
    audience: 'gestionar_usuarios',
    title: 'Crear un usuario y darle acceso',
    summary: 'Alta de cuentas con contraseña temporal, roles y alcance.',
    steps: [
      'Entrá a Usuarios → "Nuevo usuario".',
      'Completá los 4 pasos: datos, contraseña temporal, cuartel y alcance, y roles.',
      'Compartí la contraseña temporal por un canal seguro: el sistema le pide cambiarla al ingresar.',
    ],
    links: [{ label: 'Ir a Usuarios', to: '/usuarios' }],
    keywords: ['usuario', 'crear', 'alta', 'cuenta', 'contraseña', 'roles'],
  },
  {
    id: 'coordinador',
    section: 'administracion',
    audience: 'informatica',
    title: 'Asignar Coordinador o Miembro de Departamento',
    summary: 'El rol va con sus departamentos: se eligen juntos.',
    steps: [
      'Usuario nuevo: en "3. Roles" elegí Coordinador o Miembro de Departamento y marcá sus departamentos (es obligatorio elegir al menos uno).',
      'Usuario existente: en su ficha, sección Departamentos, elegí Miembro o Coordinador en cada departamento y guardá. El rol se asigna solo.',
      'Desde un departamento también podés elegir el coordinador (Datos del departamento) y sumar miembros: el rol se asigna solo.',
      'Cada departamento tiene un solo coordinador: al elegir otro, se reemplaza. Si alguien deja de estar en todos sus departamentos, se le quita el rol (salvo que sea su único rol).',
    ],
    links: [
      { label: 'Ir a Usuarios', to: '/usuarios' },
      { label: 'Ir a Departamentos', to: '/departamentos' },
    ],
    keywords: ['coordinador', 'miembro', 'departamento', 'asignar', 'rol', 'avales'],
  },
  {
    id: 'auditoria',
    section: 'administracion',
    audience: 'auditoria',
    title: 'Revisar la auditoría',
    summary: 'Quién hizo qué y cuándo. Solo para el Dpto. de Informática y Estadística R4.',
    steps: [
      'Entrá a Auditoría desde el menú.',
      'Filtrá por fecha, usuario, acción o módulo, y abrí "Ver detalle" para ver los cambios.',
    ],
    links: [{ label: 'Ir a Auditoría', to: '/auditoria' }],
    keywords: ['auditoría', 'registro', 'cambios', 'historial'],
  },

  // ---------------- Preguntas frecuentes ----------------
  {
    id: 'faq-no-veo-seccion',
    section: 'faq',
    audience: 'otros_roles',
    title: 'No veo una sección del menú',
    summary: 'El menú muestra solo lo que tu rol puede usar.',
    answer: 'Cada rol tiene su menú. Si creés que deberías ver una sección, pedíselo a Informática R4 indicando qué necesitás hacer.',
    keywords: ['menú', 'sección', 'no veo', 'falta'],
  },
  {
    id: 'faq-olvide-contrasena',
    section: 'faq',
    audience: 'todos',
    title: 'Olvidé mi contraseña',
    summary: 'La restablece Informática R4.',
    answer: 'Pedile a Informática R4 que te asigne una contraseña temporal. Al ingresar, el sistema te pide cambiarla por una tuya.',
    keywords: ['contraseña', 'olvidé', 'no puedo entrar', 'ingresar'],
  },
  {
    id: 'faq-archivo-celular',
    section: 'faq',
    audience: 'todos',
    title: 'No puedo subir un archivo desde el celular',
    summary: 'Revisá el formato, el tamaño y la conexión.',
    answer:
      'Se admiten PDF, Word, Excel y fotos (y videos en informes). El máximo es 20 MB (50 MB los videos). Si el celular recargó la página al elegir el archivo, volvé a elegirlo: lo que habías escrito se recupera solo.',
    keywords: ['subir', 'celular', 'archivo', 'foto', 'error', 'tamaño'],
  },
  {
    id: 'faq-no-puedo-pedir',
    section: 'faq',
    audience: 'todos',
    module: 'inventario',
    title: 'No me deja pedir un elemento',
    summary: 'Puede estar prestado, reservado o en mantenimiento.',
    answer:
      'El detalle del elemento dice por qué: prestado a otro cuartel, reservado, en mantenimiento o de baja. Si está disponible y no ves "Solicitar préstamo", tu rol no puede pedir: lo hacen los roles de cuartel, el Secretario Regional e Informática.',
    keywords: ['pedir', 'préstamo', 'no me deja', 'inventario', 'prestado'],
  },
  {
    id: 'faq-no-veo-informe',
    section: 'faq',
    audience: 'todos',
    title: 'No veo un departamento o sus informes',
    summary: 'Cada departamento lo ven su coordinador, sus miembros e Informática.',
    answer:
      'Si tenés que verlo, pedile al coordinador del departamento (o a Informática) que te sume como miembro. Desde ese momento lo ves en Departamentos, en tu Inicio y en la búsqueda.',
    keywords: ['informe', 'departamento', 'no veo', 'acta', 'menú', 'miembro', 'integrante'],
  },
]
