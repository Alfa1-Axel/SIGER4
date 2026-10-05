// Roles del sistema SIGER4.
// El rol "informatica_r4" es el administrador maximo del sistema:
// puede ver, cargar, editar, auditar y administrar todo.
//
// Los roles son un enum de Postgres (role_key): no hay tabla de roles en la
// base, así que la metadata visual (grupo, alcance, permisos principales)
// vive acá. Es la única fuente para mostrar roles en la UI; la autorización
// real sigue estando en RLS/Edge Functions, nunca en este archivo.
export type RoleKey =
  | 'informatica_r4'
  | 'integrante_informatica'
  | 'director_escuela'
  | 'instructor'
  | 'coordinador_escuela'
  | 'secretario_escuela'
  | 'coordinador_departamento_escuela'
  | 'secretario_regional'
  | 'presidente_cuartel'
  | 'jefe_cuerpo_activo'
  | 'usuario_carga_cuartel'
  | 'secretario_comision'
  | 'administrativo'
  | 'invitado'

// Grupo visual de cada rol (tipo/nivel). El coordinador de un departamento
// no es un rol: es el campo "Coordinador" de la sección Departamentos (ver
// DEPARTMENT_COORDINATOR_INFO más abajo).
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
    description: 'Gestión administrativa con alcance sobre toda la Regional.',
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

// Niveles de alcance que usa el sistema. "Subsede" no tiene roles propios:
// es un alcance (scope) que se le asigna a un usuario, no un tipo de rol.
export const SCOPE_LEVELS: { label: string; description: string }[] = [
  { label: 'Sistema (global)', description: 'Todo el sistema: todas las Regionales, subsedes y cuarteles.' },
  { label: 'Regional', description: 'Todos los cuarteles y subsedes de la Regional.' },
  { label: 'Subsede', description: 'Los cuarteles de una subsede. Se asigna como alcance del usuario, no hay roles exclusivos de subsede.' },
  { label: 'Cuartel', description: 'Un solo cuartel: el propio del usuario.' },
  { label: 'Escuela', description: 'Escuela Regional: cursos, capacitaciones y avales.' },
  { label: 'Departamento', description: 'Uno o más departamentos de la sección Departamentos (Fuego, Forestal, FASME...). Su coordinador e integrantes ven solo los suyos: integrantes, informes, actas, eventos y avisos.' },
]

export interface RoleDefinition {
  key: RoleKey
  label: string
  description: string
  category: RoleCategory
  // Nivel de alcance del rol.
  scope: 'system' | 'regional' | 'escuela' | 'cuartel'
  // Alcance en lenguaje institucional, para mostrar junto al rol.
  scopeLabel: string
  // Permisos principales, resumidos de la matriz final de permisos
  // (DEPLOYMENT.md, secciones 31.4 y 53). Informativo, no autoriza nada.
  permissions: string[]
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
    permissions: [
      'Ve, carga y edita en todos los módulos y cuarteles.',
      'Gestiona usuarios, roles y alcances. Es el único que puede eliminar usuarios y modificar a otro Informática R4.',
      'Purga definitiva de documentos y configuración del sistema.',
      'Avales regionales: ve y carga en todos los departamentos, y es el único que edita, archiva o elimina avales.',
      'Único rol con acceso a Auditoría.',
    ],
    assignable: true,
  },
  {
    key: 'integrante_informatica',
    label: 'Integrante de Informática',
    description: 'Integrante del equipo de informática y estadística.',
    category: 'informatica',
    scope: 'system',
    scopeLabel: 'Todo el sistema (salvo usuarios Informática R4)',
    permissions: [
      'Ve, carga y edita en los módulos operativos de todo el sistema.',
      'Gestiona usuarios, roles y alcances, excepto a usuarios Informática R4.',
      'Notificaciones manuales solo dentro de su Regional.',
      'Avales regionales: ve y carga en todos los departamentos. No edita, archiva ni elimina.',
      'Sin acceso a Auditoría (exclusiva de Dpto. Informática y Estadística R4).',
    ],
    assignable: true,
  },
  {
    key: 'director_escuela',
    label: 'Director de Escuela Regional',
    description: 'Máxima autoridad de la Escuela Regional: cursos, capacitaciones e instructores.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Su Regional (Escuela Regional)',
    permissions: [
      'Crea y edita cursos y capacitaciones.',
      'Calendario: eventos de Escuela y Capacitación.',
      'Lectura regional de cuarteles, personal, vehículos, asistencia e intervenciones (sin escritura).',
      'Alta de usuarios con cualquier rol, salvo Informática y roles de Avales.',
      'Reportes regionales, Inventario Regional y aprobación de préstamos.',
      'Departamentos: ve todos, para los reportes (sin informes ni actas).',
      'Sin acceso a Avales regionales.',
    ],
    assignable: true,
  },
  {
    key: 'instructor',
    label: 'Instructor',
    description: 'Dicta cursos y capacitaciones en la Escuela Regional.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Su Regional (Escuela Regional)',
    permissions: [
      'Crea y edita cursos y capacitaciones.',
      'Calendario: eventos de Escuela y Capacitación.',
      'Lectura regional de cuarteles y datos operativos (sin escritura).',
      'Notificaciones manuales dentro de su Regional.',
      'Sin acceso a Reportes ni a Avales regionales.',
    ],
    assignable: true,
  },
  {
    key: 'coordinador_escuela',
    label: 'Coordinador de Escuela',
    description: 'Coordina la Escuela Regional y sus avales.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Avales: todos los departamentos',
    permissions: [
      'Avales regionales: ve todos los departamentos y sus documentos.',
      'Carga avales en cualquier departamento activo.',
      'No edita, archiva ni elimina avales ya cargados.',
      'No suma permisos en cursos, cuarteles ni otros módulos.',
    ],
    assignable: true,
  },
  {
    key: 'secretario_escuela',
    label: 'Secretario de Escuela',
    description: 'Gestión administrativa de la Escuela Regional y sus avales.',
    category: 'escuela',
    scope: 'escuela',
    scopeLabel: 'Avales: todos los departamentos',
    permissions: [
      'Avales regionales: ve todos los departamentos y sus documentos.',
      'Carga avales en cualquier departamento activo.',
      'No edita, archiva ni elimina avales ya cargados.',
      'No suma permisos en cursos, cuarteles ni otros módulos.',
    ],
    assignable: true,
  },
  {
    key: 'secretario_regional',
    label: 'Secretario Regional',
    description: 'Gestión administrativa de toda la Regional.',
    category: 'region',
    scope: 'regional',
    scopeLabel: 'Su Regional',
    permissions: [
      'Crea y edita cuarteles, personal, vehículos, asistencia, intervenciones e historial de su Regional.',
      'Documentos y carpetas de su Regional (sin purga definitiva).',
      'Calendario regional, Inventario Regional y aprobación de préstamos.',
      'Departamentos: ve todos; carga integrantes sin usuario, actividad y eventos, y puede avisar a un departamento.',
      'Reportes regionales.',
    ],
    assignable: true,
  },
  {
    key: 'presidente_cuartel',
    label: 'Presidente de Cuartel',
    description: 'Máxima autoridad institucional del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    permissions: [
      'Edita datos del cuartel, personal, vehículos, asistencia e intervenciones de su cuartel.',
      'Documentos, carpetas e historial institucional de su cuartel.',
      'Calendario de su cuartel y solicitudes de préstamo.',
      'Sin acceso a Reportes.',
    ],
    assignable: true,
  },
  {
    key: 'jefe_cuerpo_activo',
    label: 'Jefe de Cuerpo Activo',
    description: 'Responsable operativo del cuerpo activo del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    permissions: [
      'Edita datos operativos del cuartel: personal, vehículos, asistencia e intervenciones.',
      'Gestiona usuarios de su cuartel: alta con roles de cuartel, contraseña, activar y desactivar.',
      'Documentos, historial y calendario de su cuartel.',
      'Reportes de su cuartel y solicitudes de préstamo.',
    ],
    assignable: true,
  },
  {
    key: 'usuario_carga_cuartel',
    label: 'Usuario de carga de cuartel',
    description: 'Carga datos operativos y administrativos del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    permissions: [
      'Carga y edita personal, vehículos, asistencia e intervenciones de su cuartel.',
      'Documentos, historial y calendario de su cuartel.',
      'Reportes de su cuartel y solicitudes de préstamo.',
    ],
    assignable: true,
  },
  {
    key: 'secretario_comision',
    label: 'Secretario de Comisión',
    description: 'Gestión administrativa de la comisión directiva del cuartel.',
    category: 'cuartel',
    scope: 'cuartel',
    scopeLabel: 'Su propio cuartel',
    permissions: [
      'Documentos, carpetas e historial institucional de su cuartel.',
      'Calendario de su cuartel.',
      'Solo lectura de personal, vehículos, asistencia e intervenciones.',
      'Sin acceso a Reportes.',
    ],
    assignable: true,
  },
  {
    key: 'invitado',
    label: 'Invitado / Solo lectura',
    description: 'Acceso de solo lectura limitado.',
    category: 'otros',
    scope: 'cuartel',
    scopeLabel: 'Su cuartel, solo lectura',
    permissions: ['Solo lectura dentro de su cuartel.', 'Sin acceso a Auditoría, Reportes ni carga de datos.'],
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
    permissions: ['No da ningún permiso desde la migración 0097.'],
    assignable: false,
  },
  {
    key: 'administrativo',
    label: 'Administrativo (rol retirado)',
    description: 'Rol retirado: ya no se asigna. Si un usuario todavía lo tiene, conviene quitárselo.',
    category: 'otros',
    scope: 'cuartel',
    scopeLabel: 'Sin uso',
    permissions: ['No se ofrece en ningún formulario desde la migración 0043.'],
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
// (además de Informática). El coordinador de un departamento también entra,
// pero solo a su departamento, y no por rol: por ser el coordinador en la
// sección Departamentos (ver 0097).
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
//                   department_members (integrantes).
//   - Informática y los roles de avales de Escuela no piden división.
// ---------------------------------------------------------------------------
export type DivisionNeed = 'none' | 'station' | 'region'

export const STATION_DIVISION_ROLES: RoleKey[] = ['presidente_cuartel', 'jefe_cuerpo_activo', 'usuario_carga_cuartel', 'secretario_comision', 'invitado']
export const REGION_DIVISION_ROLES: RoleKey[] = ['secretario_regional', 'director_escuela', 'instructor']

export function roleDivisionNeed(role: RoleKey | string): DivisionNeed {
  if ((STATION_DIVISION_ROLES as string[]).includes(role)) return 'station'
  if ((REGION_DIVISION_ROLES as string[]).includes(role)) return 'region'
  return 'none'
}

// Roles de división departamental. No son valores de role_key: se asignan
// eligiendo los departamentos (coordinador en departments, integrantes en
// department_members) y la base los valida con my_department_ids() y
// can_view_department() (0103).
export type DepartmentRoleKey = 'coordinador_departamento' | 'integrante_departamento'

export interface DepartmentRoleDefinition {
  key: DepartmentRoleKey
  label: string
  description: string
  scopeLabel: string
  permissions: string[]
}

export const DEPARTMENT_ROLE_DEFINITIONS: DepartmentRoleDefinition[] = [
  {
    key: 'coordinador_departamento',
    label: 'Coordinador de departamento',
    description: 'Gestiona uno o más departamentos (Fuego, Forestal, FASME…). Cada departamento tiene un solo coordinador.',
    scopeLabel: 'Solo los departamentos que coordina',
    permissions: [
      'Ve y edita su departamento: datos, integrantes, informes, actas y eventos.',
      'Avisa a todo su departamento desde Notificaciones.',
      'Avales regionales: ve y carga los de su departamento. No edita, archiva ni elimina.',
      'No ve otros departamentos. Lo asigna Informática.',
    ],
  },
  {
    key: 'integrante_departamento',
    label: 'Integrante de departamento',
    description: 'Participa en uno o más departamentos.',
    scopeLabel: 'Solo los departamentos que integra',
    permissions: [
      'Ve su departamento: integrantes, informes, actas y eventos.',
      'Carga informes, actas y eventos de su departamento.',
      'Recibe los avisos de su departamento.',
      'No ve otros departamentos. Lo suma Informática o el coordinador.',
    ],
  },
]

// Roles que solo Informática puede asignar al crear un usuario (espejo de
// INFORMATICA_ONLY_ROLES en supabase/functions/admin-create-user/index.ts):
// los de Informática y los que dan acceso a Avales regionales.
export const INFORMATICA_ONLY_ASSIGNABLE_ROLES: RoleKey[] = [...ADMIN_ROLES, ...SCHOOL_AVALES_ROLES]
