import { useAuth } from './useAuth'
import { SCHOOL_AVALES_ROLES } from '../types/roles'

// Espejo de UI de los helpers SQL de Avales (0095_school_avales_module.sql).
// Solo decide qué mostrar: la autorización real la hacen RLS y las policies
// de Storage.
//   - hasAccess: puede entrar a la sección (Informática, coordinador/
//     secretario de Escuela, coordinador de departamento interno).
//   - canViewAll: ve todos los departamentos (can_view_all_school_avales()).
//   - canManage: edita, archiva, elimina y administra departamentos
//     (can_manage_school_avales() = is_super_admin() = solo informatica_r4).
export function useSchoolAvalesAccess() {
  const { isAdmin, hasRole } = useAuth()
  const canViewAll = isAdmin || hasRole('coordinador_escuela', 'secretario_escuela')
  return {
    hasAccess: isAdmin || hasRole(...SCHOOL_AVALES_ROLES),
    canViewAll,
    canManage: hasRole('informatica_r4'),
  }
}
