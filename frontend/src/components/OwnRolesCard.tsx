import { useAuth } from '../hooks/useAuth'
import { useMyRoleAssignments } from '../hooks/useMyRoleAssignments'
import { groupOwnRoles } from '../lib/roleAssignments'
import { Icon } from './ui/Icon'

// "Tu rol en SIGER4" (Mi perfil): solo los roles que la persona tiene, dónde
// aplican y qué puede hacer con ellos, en pocas frases. No hay una pantalla
// con la explicación de todos los roles del sistema.
export function OwnRolesCard() {
  const { roles } = useAuth()
  const assignments = useMyRoleAssignments()
  const own = groupOwnRoles(assignments)
  // Los nombres de cuartel y departamento llegan después del perfil.
  const loading = roles.length > 0 && assignments.length === 0

  return (
    <section className="card-solid own-roles" aria-labelledby="own-roles-title" style={{ marginBottom: 20 }}>
      <h2 id="own-roles-title" className="section-title">
        Tu rol en SIGER4
      </h2>

      {loading && (
        <p className="field-help" role="status">
          Cargando tu rol…
        </p>
      )}

      {!loading && own.length === 0 && (
        <p className="field-help">Todavía no tenés un rol asignado. Consultá a Informática y Estadística.</p>
      )}

      {own.length > 0 && (
        <ul className="own-roles-list">
          {own.map((r) => (
            <li key={r.key} className={`own-role${r.missing ? ' own-role--missing' : ''}`}>
              <div className="own-role-head">
                <span className="own-role-name">{r.role}</span>
                <span className="own-role-sep" aria-hidden="true">
                  ·
                </span>
                <span className="own-role-scope">
                  {r.missing && <Icon name="info" size={14} />}
                  {r.divisions.join(', ')}
                </span>
              </div>
              <p className="own-role-summary">{r.summary}</p>
            </li>
          ))}
        </ul>
      )}

      {own.length > 0 && <p className="field-help own-roles-note">Tu rol lo asigna Informática y Estadística; el de departamento, también su coordinador.</p>}
    </section>
  )
}
