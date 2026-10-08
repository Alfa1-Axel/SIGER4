// Roles del sistema SIGER4.
// El rol "informatica_r4" es el administrador maximo del sistema:
// puede ver, cargar, editar, auditar y administrar todo.
//
// Los roles son un enum de Postgres (role_key): no hay tabla de roles en la
// base, así que la metadata visual (grupo, alcance, resumen de lo que puede
// hacer) vive acá. Es la única fuente para mostrar roles en la UI; la autorización
// real sigue estando en RLS/Edge Functions, nunca en este archivo.
//
// No hay una pantalla con la explicación de todos los roles: cada persona ve
// solo el suyo en Mi perfil ("Tu rol en SIGER4", selfSummary). La descripción
// y el alcance de cada rol se muestran a quien asigna roles al crear o editar
// un usuario (RoleGroupedPicker). La matriz completa de permisos está en
// DEPLOYMENT.md (secciones 31.4 y 53).
export type RoleKey =
  | 'informatica_r4'
  | 'integrante_informatica'
  | 'director_escuela'
  | 'instructor'
  | 'coordinador_escuela'
  | 'secretario_escuela'
  | 'coordinador_departamento_escuela'
  | 'secretario_regional'
  | 'coordinador_departamento'
  | 'miembro_departamento'
  | 'presidente_cuartel'
  | 'jefe_cuerpo_activo'
  | 'usuario_carga_cuartel'
  | 'secretario_comision'
  | 'administrativo'
  | 'invitado'

// Grupo visual de cada rol (tipo/nivel). Los roles de departamento van en el
// grupo Regional, con sus departamentos como división.
export type RoleCategory = 'informatica' | 'escuela' | 'region' | 'cuartel' | 'otros'

export interface RoleCategoryDefinition {
  key: RoleCategory
  label: string
  description: string
}

// Orden = orden en que se muestran los grupos.
export const ROLE_CATEGORIES: RoleCategoryDefinition[] = [
  {
    key: 'informatica',
    label: 'Informática',
    description: 'Administración del sistema. Alcance global: todo el sistema.',
  },
  {
    key: 'escuela',
    label: 'Escuela Regional',
    description: 'Cursos, capacitaciones y gestión de la Escuela Regional.',
  },
  {
    key: 'region',
    label: 'Regional',
    description: 'Gestión de la Regional y roles de departamento (Fuego, Forestal, FASME…): el rol se asigna junto con sus departamentos.',
  },
  {
    key: 'cuartel',
    label: 'Cuartel',
    description: 'Roles operativos e institucionales de un cuartel. Su alcance es el propio cuartel.',
  },
  {
    key: 'otros',
    label: 'Otros',
    description: 'Accesos limitados de solo lectura y roles retirados.',
  },
]

export interface RoleDefinition {
  key: RoleKey
  label: string
  description: string
  category: RoleCategory
  // Nivel de alcance del rol.
  scope: 'system' | 'regional' | 'escuela' | 'cuartel' | 'departamento'
  // Alcance en lenguaje institucional, para mostrar junto al rol.
  scopeLabel: string
  // Qué puede hacer quien tiene el rol, en segunda persona y en pocas frases.
  // Se muestra solo a quien lo tiene (Mi perfil → "Tu rol en SIGER4"); no hay
  // pantalla con los de todos los roles. Informativo, no autoriza nada.
  selfSummary: string
  // false = rol retirado: se muestra solo si un usuario todavía lo tiene,
  // para poder identificarlo y quitarlo, pero nunca se ofrece para asignar.
  assignable: boolean
}

// Roles asignables, en el orden en que se muestran dentro de cada grupo.
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'informatica_r4',
    label: 'Dpto. Informática y Estadística R4',
    description: 'Administrador supremo del sistema. Acceso total a todos los módulos y cuarteles.',
    category: 'informatica',
    scope: 'system',
    scopeLabel: 'Todo el sistema',
    selfSummary: 'Tenés acceso total al sistema: ves, cargás y editás en todos los módulos y cuarteles, administrás usuarios y roles, y accedés a Auditoría.',
    assignable: true,
  },
  {
    key: 'integrante_informatica',
    label: 'Integrante de Informática',
    description: 'Integrante del equipo de informática y estadística.',
    category: 'informatica',
    scope: 'system',
    scopeLabel: 'Todo el sistema (salvo usuarios Informática R4)',
    selfSummary: 'Ves, cargás y editás en los módulos operativos de todo el sistema y administrás usuarios y roles, salvo los de Informática R4. No accedés a Auditoría.',
    assignable: true,
  },
  {
    key: 'director_escuela',
    label: 'Director de Escuela Regional',
    description: 'Máxima autoridad de la Escuela Regional: cursos, capacitaciones e instructores.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Su Regional (Escuela Regional)',
    selfSummary: 'Gestionás la Escuela Regional: cursos, capacitaciones y eventos de Escuela. Consultás los datos de los cuarteles de tu Regional, generás reportes regionales, aprobás préstamos de Inventario y podés dar de alta usuarios.',
    assignable: true,
  },
  {
    key: 'instructor',
    label: 'Instructor',
    description: 'Dicta cursos y capacitaciones en la Escuela Regional.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Su Regional (Escuela Regional)',
    selfSummary: 'Creás y editás cursos y capacitaciones de la Escuela Regional y sus eventos en el Calendario. Consultás los datos de los cuarteles de tu Regional, sin editarlos.',
    assignable: true,
  },
  {
    key: 'coordinador_escuela',
    label: 'Coordinador de Escuela',
    description: 'Coordina la Escuela Regional y sus avales.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Avales: todos los departamentos',
    selfSummary: 'Consultás los avales regionales de todos los departamentos y cargás avales nuevos. No podés editar, archivar ni eliminar los ya cargados.',
    assignable: true,
  },
  {
    key: 'secretario_escuela',
    label: 'Secretario de Escuela',
    description: 'Gestión administrativa de la Escuela Regional y sus avales.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Avales: todos los departamentos',
    selfSummary: 'Consultás los avales regionales de todos los departamentos y cargás avales nuevos. No podés editar, archivar ni eliminar los ya cargados.',
    assignable: true,
  },
  {
    key: 'secretario_regional',
    label: 'Secretario Regional',
    description: 'Gestión administrativa de toda la Regional.',
    category: 'region',
    scope: 'regional',
    scopeLabel: 'Su Regional',
    selfSummary: 'Gestionás la información de los cuarteles de tu Regional (datos, efectivos, personal, móviles, asistencia, intervenciones e historial), sus documentos y el calendario regional. Ves todos los departamentos, podés avisarles, aprobás préstamos de Inventario y generás reportes regionales.',
    assignable: true,
  },
  {
    key: 'coordinador_departamento',
    label: 'Coordinador de Departamento',
    description: 'Gestiona uno o más departamentos (Fuego, Forestal, FASME…). Cada departamento tiene un solo coordinador.',
    category: 'region',
    scope: 'departamento',
    scopeLabel: 'Solo los departamentos que coordina',
    selfSummary: 'Podés cargar y consultar informes, actas, eventos y avisos de tu departamento, sumar o quitar miembros y avisar a todo el departamento. También ves y cargás los avales de tu departamento. No ves otros departamentos.',
    assignable: true,
  },
  {
    key: 'miembro_departamento',
    label: 'Miembro de Departamento',
    description: 'Participa en uno o más departamentos.',
    category: 'region',
    scope: 'departamento',
    scopeLabel: 'Solo los departamentos de los que es miembro',
    selfSummary: 'Podés consultar y cargar informes, actas, actividad y eventos de tu departamento, y recibís sus avisos. No ves otros departamentos.',
    assignable: true,
  },
  {
    key: 'presidente_cuartel',
    label: 'Presidente de Cuartel',
    description: 'Máxima autoridad institucional del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    selfSummary: 'Podés gestionar la información de tu cuartel: datos, efectivos, personal, móviles, asistencia, intervenciones, documentos, historial y calendario. No accedés a Reportes.',
    assignable: true,
  },
  {
    key: 'jefe_cuerpo_activo',
    label: 'Jefe de Cuerpo Activo',
    description: 'Responsable operativo del cuerpo activo del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    selfSummary: 'Podés gestionar la información operativa de tu cuartel (efectivos, personal, móviles, asistencia e intervenciones), sus documentos, su historial y su calendario, y generar reportes del cuartel. También das de alta y administrás a los usuarios de tu cuartel.',
    assignable: true,
  },
  {
    key: 'usuario_carga_cuartel',
    label: 'Usuario de carga de cuartel',
    description: 'Carga datos operativos y administrativos del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    selfSummary: 'Podés cargar y editar la información operativa de tu cuartel (efectivos, personal, móviles, asistencia e intervenciones), sus documentos, su historial y su calendario, y generar reportes del cuartel.',
    assignable: true,
  },
  {
    key: 'secretario_comision',
    label: 'Secretario de Comisión',
    description: 'Gestión administrativa de la comisión directiva del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    selfSummary: 'Podés gestionar los documentos, el historial institucional y el calendario de tu cuartel. Consultás el personal, los móviles, la asistencia y las intervenciones, sin editarlos.',
    assignable: true,
  },
  {
    key: 'invitado',
    label: 'Invitado / Solo lectura',
    description: 'Acceso de solo lectura limitado.',
    category: 'otros',
    scope: 'cuartel',
    scopeLabel: 'Su cuartel, solo lectura',
    selfSummary: 'Podés consultar la información de tu cuartel. No podés cargar ni editar datos.',
    assignable: true,
  },
]

// 'administrativo' se retiró de las opciones seleccionables (ver
// 0043_remove_administrativo_role_ui.sql). El valor sigue existiendo en el
// enum role_key de Postgres por si algún perfil real todavía lo tiene: se
// define acá solo para poder mostrarlo con nombre (y quitarlo) en esos
// casos, nunca para asignarlo.
export const RETIRED_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'coordinador_departamento_escuela',
    label: 'Coordinador de departamento (rol retirado)',
    description: 'Rol retirado: el coordinador de un departamento ahora es el que figura en la sección Departamentos. Si un usuario todavía lo tiene, se puede quitar.',
    category: 'otros',
    scope: 'escuela',
    scopeLabel: 'Sin uso',
    selfSummary: 'Este rol ya no se usa y no da permisos. Si tenés otros roles, rigen esos. Consultá a Informática y Estadística para quitarlo.',
    assignable: false,
  },
  {
    key: 'administrativo',
    label: 'Administrativo (rol retirado)',
    description: 'Rol retirado: ya no se asigna. Si un usuario todavía lo tiene, conviene quitárselo.',
    category: 'otros',
    scope: 'cuartel',
    scopeLabel: 'Sin uso',
    selfSummary: 'Este rol ya no se usa y no da permisos. Si tenés otros roles, rigen esos. Consultá a Informática y Estadística para quitarlo.',
    assignable: false,
  },
]

const ALL_ROLE_DEFINITIONS: RoleDefinition[] = [...ROLE_DEFINITIONS, ...RETIRED_ROLE_DEFINITIONS]

export function getRoleDefinition(role: RoleKey | string): RoleDefinition | undefined {
  return ALL_ROLE_DEFINITIONS.find((r) => r.key === role)
}

export function roleLabel(role: RoleKey | string): string {
  return getRoleDefinition(role)?.label ?? role
}

export function getRoleCategory(category: RoleCategory): RoleCategoryDefinition {
  return ROLE_CATEGORIES.find((c) => c.key === category) ?? ROLE_CATEGORIES[ROLE_CATEGORIES.length - 1]
}

export interface RoleGroup {
  category: RoleCategoryDefinition
  roles: RoleDefinition[]
}

// Agrupa una lista de roles por categoría, en el orden de ROLE_CATEGORIES y
// conservando el orden de la lista dentro de cada grupo. Omite los grupos
// vacíos.
export function groupRolesByCategory(roles: RoleDefinition[]): RoleGroup[] {
  return ROLE_CATEGORIES.map((category) => ({
    category,
    roles: roles.filter((role) => role.category === category.key),
  })).filter((group) => group.roles.length > 0)
}

// Debe reflejar exactamente los roles que is_informatica_r4() considera
// administrador maximo en Supabase (0002_rls_helpers.sql), para que el gate de
// admin del frontend (isAdmin en useAuth) coincida con lo que RLS ya permite.
export const ADMIN_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica']

// Roles que dan acceso a TODOS los departamentos de Avales regionales
// (además de Informática). El Coordinador de Departamento también entra, pero
// solo a los departamentos que coordina (0097, 0106).
export const SCHOOL_AVALES_ROLES: RoleKey[] = ['coordinador_escuela', 'secretario_escuela']

// ---------------------------------------------------------------------------
// División: dónde aplica cada rol.
//
// El rol dice qué puede hacer la persona; la división, dónde. No hay una
// columna de división en user_roles: cada división tiene su fuente única.
//   - cuartel:      profiles.station_id o un alcance de cuartel/subsede
//                   (user_scopes), igual que my_station_ids() en la base.
//   - regional:     profiles.region_id o un alcance de Regional.
//   - departamento: departments.coordinator_profile_id (coordinador) y
//                   department_members (miembros). La base exige rol Y
//                   departamento (0106) y los mantiene sincronizados.
//   - Informática y los roles de avales de Escuela no piden división.
// ---------------------------------------------------------------------------
export type DivisionNeed = 'none' | 'station' | 'region' | 'department'

export const DEPARTMENT_ROLES: RoleKey[] = ['coordinador_departamento', 'miembro_departamento']

export const STATION_DIVISION_ROLES: RoleKey[] = ['presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'invitado']
export const REGION_DIVISION_ROLES: RoleKey[] = ['secretario_regional', 'director_escuela', 'instructor']

export function roleDivisionNeed(role: RoleKey | string): DivisionNeed {
  if ((STATION_DIVISION_ROLES as string[]).includes(role)) return 'station'
  if ((REGION_DIVISION_ROLES as string[]).includes(role)) return 'region'
  if ((DEPARTMENT_ROLES as string[]).includes(role)) return 'department'
  return 'none'
}

// Roles que solo Informática puede asignar al crear un usuario (espejo de
// admin-create-user): los de Informática, los que dan acceso a Avales
// regionales y los de departamento (sus departamentos los asigna Informática).
export const INFORMATICA_ONLY_ASSIGNABLE_ROLES: RoleKey[] = [...ADMIN_ROLES, ...SCHOOL_AVALES_ROLES, ...DEPARTMENT_ROLES]
