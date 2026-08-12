import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Icon } from '../components/ui/Icon'
import { fetchTrashedDocuments, restoreDocument, purgeDocuments, fetchDocumentFolders } from '../lib/api/documents'
import { fetchProfiles } from '../lib/api/users'
import { fetchRegions } from '../lib/api/regions'
import { fetchSubsedes } from '../lib/api/subsedes'
import { fetchStations } from '../lib/api/stations'
import type { DocumentFolder, DocumentRecord, Profile, Region, Station, Subsede } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { describeSupabaseError } from '../lib/api/errors'

const RETENTION_DAYS = 30

function daysRemaining(purgeAfter: string | null): number {
  if (!purgeAfter) return RETENTION_DAYS
  const diffMs = new Date(purgeAfter).getTime() - Date.now()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export function PapeleraDocumentosPage() {
  const { isAdmin, hasRole, profile: currentProfile } = useAuth()
  // Enviar a la papelera / restaurar usa el mismo alcance que editar el
  // documento (documents_update_admin_regional_station, 0053) — no solo
  // informática. La purga definitiva sí es exclusiva de informática (ver
  // documents_delete_informatica), reflejado acá con "canPurge".
  const canManage = isAdmin || hasRole('secretario_regional', 'usuario_carga_cuartel', 'presidente_cuartel', 'secretario_comision', 'jefe_cuerpo_activo')
  const canPurge = isAdmin

  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subsedes, setSubsedes] = useState<Subsede[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purgingAll, setPurgingAll] = useState(false)

  async function reload() {
    const [documentsData, foldersData, profilesData, regionsData, subsedesData, stationsData] = await Promise.all([
      fetchTrashedDocuments(),
      fetchDocumentFolders(),
      fetchProfiles(),
      fetchRegions(),
      fetchSubsedes(),
      fetchStations(),
    ])
    setDocuments(documentsData)
    setFolders(foldersData)
    setProfiles(profilesData)
    setRegions(regionsData)
    setSubsedes(subsedesData)
    setStations(stationsData)
  }

  useEffect(() => {
    let active = true
    reload()
      .catch((err) => active && setError(describeSupabaseError(err, 'Error al cargar la papelera')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])

  function scopeLabel(doc: DocumentRecord): string {
    if (doc.station_id) return stations.find((s) => s.id === doc.station_id)?.name ?? 'Cuartel'
    if (doc.subsede_id) return subsedes.find((s) => s.id === doc.subsede_id)?.name ?? 'Subsede'
    if (doc.region_id) return regions.find((r) => r.id === doc.region_id)?.name ?? 'Regional'
    if (doc.profile_id) return profileById.get(doc.profile_id)?.full_name ?? 'Usuario específico'
    return 'Sin alcance'
  }

  async function handleRestore(doc: DocumentRecord) {
    setError(null)
    setInfo(null)
    setBusyId(doc.id)
    try {
      await restoreDocument(doc.id, currentProfile?.id ?? null)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      setInfo(`"${doc.title}" fue restaurado.`)
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos restaurar el documento.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurgeOne(doc: DocumentRecord) {
    if (!window.confirm(`¿Borrar "${doc.title}" definitivamente? Esta acción no se puede deshacer y borra también el archivo.`)) return
    setError(null)
    setInfo(null)
    setBusyId(doc.id)
    try {
      const result = await purgeDocuments(doc.id)
      if (result.failed > 0) {
        setError(result.details.find((d) => !d.ok)?.error ?? 'No pudimos borrar el archivo de almacenamiento.')
      } else {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
        setInfo(`"${doc.title}" fue borrado definitivamente.`)
      }
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos purgar el documento.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurgeExpired() {
    if (!window.confirm('¿Borrar definitivamente todos los documentos vencidos (más de 30 días en la papelera)? Esta acción no se puede deshacer.')) return
    setError(null)
    setInfo(null)
    setPurgingAll(true)
    try {
      const result = await purgeDocuments()
      await reload()
      if (result.purged === 0 && result.failed === 0) {
        setInfo('No había documentos vencidos para purgar todavía.')
      } else {
        setInfo(`Se purgaron ${result.purged} documento${result.purged === 1 ? '' : 's'}.${result.failed > 0 ? ` ${result.failed} fallaron (ver detalle en los logs).` : ''}`)
      }
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos ejecutar la purga.'))
    } finally {
      setPurgingAll(false)
    }
  }

  if (!canManage) {
    return (
      <AppShell title="Papelera">
        <div className="empty-state">No tenés permisos para ver la papelera de documentos.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Papelera">
      <Link to="/documentos" className="link-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Volver a Documentos
      </Link>

      <h1 className="page-title">Papelera</h1>
      <p className="page-subtitle">
        Documentos eliminados. Se pueden restaurar durante {RETENTION_DAYS} días; pasado ese plazo se
        purgan automáticamente (o pueden purgarse antes manualmente).
      </p>

      {error && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="field-error">{error}</p>
        </div>
      )}
      {info && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--color-success)', margin: 0 }}>{info}</p>
        </div>
      )}

      {loading && <div className="empty-state">Cargando papelera…</div>}
      {!loading && documents.length === 0 && <div className="empty-state">La papelera está vacía.</div>}

      {!loading && documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {documents.map((doc) => {
            const remaining = daysRemaining(doc.purge_after)
            const deletedBy = doc.deleted_by_profile_id ? profileById.get(doc.deleted_by_profile_id)?.full_name : null
            return (
              <div key={doc.id} className="card-solid list-item">
                <div className="list-item-body">
                  <h3 className="list-item-title">{doc.title}</h3>
                  <p className="list-item-subtitle">
                    Carpeta: {doc.folder_id ? folderById.get(doc.folder_id)?.name ?? 'Desconocida' : 'General'} · Alcance: {scopeLabel(doc)}
                  </p>
                  <p className="list-item-subtitle">
                    Eliminado por {deletedBy ?? 'usuario desconocido'} el{' '}
                    {doc.deleted_at ? new Date(doc.deleted_at).toLocaleDateString('es-AR', { dateStyle: 'medium' }) : '—'}
                    {doc.delete_reason && ` · Motivo: ${doc.delete_reason}`}
                  </p>
                  <div className="list-item-meta">
                    <span className="badge badge-info">{doc.category}</span>
                    <span className={`badge ${remaining <= 5 ? 'badge-danger' : 'badge-warning'}`}>
                      {remaining === 0 ? 'Vencido, listo para purgar' : `${remaining} día${remaining === 1 ? '' : 's'} antes de purgarse`}
                    </span>
                  </div>
                </div>
                <div className="list-item-actions">
                  <button type="button" className="btn btn-outlined" disabled={busyId === doc.id} onClick={() => handleRestore(doc)}>
                    Restaurar
                  </button>
                  {canPurge && (
                    <button
                      type="button"
                      className="btn btn-outlined"
                      disabled={busyId === doc.id}
                      onClick={() => handlePurgeOne(doc)}
                    >
                      <Icon name="trash" size={14} />
                      <span className="btn-label-full">Borrar ya</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canPurge && documents.length > 0 && (
        <button type="button" className="btn btn-outlined btn-block" disabled={purgingAll} onClick={handlePurgeExpired}>
          {purgingAll ? 'Purgando…' : 'Purgar vencidos ahora'}
        </button>
      )}
    </AppShell>
  )
}
