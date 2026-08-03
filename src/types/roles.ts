// Roles del sistema SIGER4.
// El rol "informatica_r4" es el administrador maximo del sistema:
// puede ver, cargar, editar, auditar y administrar todo.
export type RoleKey =
  | 'informatica_r4'
  | 'integrante_informatica'
  | 'director_escuela'
  | 'instructor'
  | 'secretario_regional'
  | 'presidente_cuartel'
  | 'jefe_cuerpo_activo'
  | 'usuario_carga_cuartel'
  | 'secretario_comision'
  | 'administrativo'
  | 'invitado'

export interface RoleDefinition {
  key: RoleKey
  label: string
  description: string
  scope: 'system' | 'regional' | 'escuela' | 'cuartel'
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'informatica_r4',
    label: 'Dpto. Informática y Estadística R4',
    description: 'Administrador máximo del sistema. Acceso total a todos los módulos y cuarteles.',
    scope: 'system',
  },
  {
    key: 'integrante_informatica',
    label: 'Integrante de Informática',
    description: 'Integrante del equipo de informática y estadística.',
    scope: 'system',
  },
  {
    key: 'director_escuela',
    label: 'Director de Escuela Regional',
    description: 'Máxima autoridad de la Escuela Regional: cursos, capacitaciones e instructores. Puede ver información regional para reportes de Escuela, pero no tiene escritura sobre cuarteles, vehículos, personal ni documentos (eso es de secretario_regional o roles de cuartel).',
    scope: 'escuela',
  },
  {
    key: 'instructor',
    label: 'Instructor',
    description: 'Dicta cursos y capacitaciones en la Escuela Regional.',
    scope: 'escuela',
  },
  {
    key: 'secretario_regional',
    label: 'Secretario Regional',
    description: 'Gestión administrativa a nivel regional, reporta al Director de Escuela.',
    scope: 'regional',
  },
  {
    key: 'presidente_cuartel',
    label: 'Presidente de Cuartel',
    description: 'Máxima autoridad institucional del cuartel.',
    scope: 'cuartel',
  },
  {
    key: 'jefe_cuerpo_activo',
    label: 'Jefe de Cuerpo Activo',
    description: 'Responsable operativo del cuerpo activo del cuartel.',
    scope: 'cuartel',
  },
  {
    key: 'usuario_carga_cuartel',
    label: 'Usuario de carga de cuartel',
    description: 'Carga datos operativos y administrativos del cuartel.',
    scope: 'cuartel',
  },
  {
    key: 'secretario_comision',
    label: 'Secretario de Comisión',
    description: 'Gestión administrativa de la comisión directiva del cuartel.',
    scope: 'cuartel',
  },
  // 'administrativo' se retiró de las opciones seleccionables (ver
  // 0043_remove_administrativo_role_ui.sql): ya no aparece en ningún
  // formulario ni matriz de permisos. El valor sigue existiendo en el enum
  // role_key de Postgres (no se puede borrar sin recrear el tipo) por si
  // algún perfil real todavía lo tiene asignado; RoleKey lo mantiene para que
  // ese caso siga tipando correctamente, pero ROLE_DEFINITIONS ya no lo
  // ofrece para asignar a nadie nuevo.
  {
    key: 'invitado',
    label: 'Invitado / Solo lectura',
    description: 'Acceso de solo lectura limitado.',
    scope: 'cuartel',
  },
]

// Debe reflejar exactamente los roles que is_informatica_r4() considera
// administrador maximo en Supabase (0002_rls_helpers.sql), para que el gate de
// admin del frontend (isAdmin en useAuth) coincida con lo que RLS ya permite.
export const ADMIN_ROLES: RoleKey[] = ['informatica_r4', 'integrante_informatica']
