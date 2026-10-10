import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AccessDenied } from '../components/ui/AccessDenied'
import { FilePicker } from '../components/ui/FilePicker'
import { Icon } from '../components/ui/Icon'
import { SuccessNotice } from '../components/ui/SuccessNotice'
import { useNavigationNotice } from '../hooks/useNavigationNotice'
import {
  addPointFile,
  fetchPoint,
  fetchPointFiles,
  fetchPointPermissions,
  fetchProfileNames,
  fetchProposals,
  fetchSheet,
  fetchSheetHistory,
  fetchSheetPrivate,
  fetchSupplyStatus,
  fetchVerifications,
  markSheetReviewed,
  removePointFile,
  resolveFollowUp,
  reviewProposal,
  savePrivate,
  validatePointFile,
} from '../lib/api/mapPoints'
import type { PointPermissions } from '../lib/api/mapPoints'
import { describeSupabaseError } from '../lib/api/errors'
import { fetchStationById } from '../lib/api/stations'
import { getMapPointFileUrl, isMapPointMimeAllowed, MAP_POINT_FILE_MAX_BYTES } from '../lib/api/storage'
import { isEditConflict } from '../lib/concurrency'
import { formatBytes } from '../lib/format'
import {
  NO_INFO,
  SHEET_FIELD_LABEL,
  SUPPLY_STATUS_BADGE,
  SUPPLY_STATUS_HELP,
  SUPPLY_STATUS_LABEL,
  VERIFICATION_RESULT_LABEL,
  ageLabel,
  changedSheetFields,
  formatDateAr,
  pointKindLabel,
  sheetReviewLabel,
  showOrNoInfo,
} from '../lib/mapPointMeta'
import type {
  MapCharacteristic,
  MapFileKind,
  MapPointFile,
  MapPointSheet,
  MapPointSheetHistoryRow,
  MapPointSheetPayload,
  MapPointSheetPrivate,
  MapPointSheetProposal,
  MapPointVerification,
  MapReferencePoint,
  MapSupplyPointStatus,
} from '../types/database'

const FILE_ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

const HISTORY_KIND_LABEL: Record<MapPointSheetHistoryRow['change_kind'], string> = {
  alta: 'Ficha creada',
  edicion: 'Ficha editada',
  propuesta_aceptada: 'Cambios propuestos y aceptados',
  revision: 'Se confirmó que la información sigue vigente',
}

const PROPOSAL_STATUS_LABEL: Record<MapPointSheetProposal['status'], string> = {
  pendiente: 'Pendiente de validación',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  reemplazada: 'Reemplazada por una propuesta nueva',
}

function formatValue(field: keyof MapPointSheetPayload, value: unknown): string {
  if (field === 'characteristics') {
    const list = (value as MapCharacteristic[] | null | undefined) ?? []
    return list.length === 0 ? NO_INFO : list.map((c) => `${c.label}: ${c.value}${c.unit ? ` ${c.unit}` : ''}`).join(' · ')
  }
  if (field === 'surveyed_on') return value ? formatDateAr(String(value)) : NO_INFO
  return showOrNoInfo(value as string | number | null | undefined)
}

// Ficha de un punto del Mapa Regional: lo que consta en el relevamiento y de
// dónde sale. No dice cómo actuar ni qué hay ahora en el lugar. Quién ve qué
// lo decide la base (RLS): esta pantalla solo muestra lo que la base entrega.
export function PuntoMapaPage() {
  const { id } = useParams<{ id: string }>()
  const [notice, setNotice, noticeTone] = useNavigationNotice()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [point, setPoint] = useState<MapReferencePoint | null>(null)
  const [sheet, setSheet] = useState<MapPointSheet | null>(null)
  const [priv, setPriv] = useState<MapPointSheetPrivate | null>(null)
  const [history, setHistory] = useState<MapPointSheetHistoryRow[]>([])
  const [proposals, setProposals] = useState<MapPointSheetProposal[]>([])
  const [files, setFiles] = useState<MapPointFile[]>([])
  const [verifications, setVerifications] = useState<MapPointVerification[]>([])
  const [status, setStatus] = useState<MapSupplyPointStatus | null>(null)
  const [perms, setPerms] = useState<PointPermissions>({ canValidate: false, canPropose: false, canViewPrivate: false })
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [stationName, setStationName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    try {
      const pointData = await fetchPoint(id)
      setPoint(pointData)
      if (!pointData) return
      const [sheetData, permissions, filesData, historyData, proposalsData] = await Promise.all([
        fetchSheet(id),
        fetchPointPermissions(id),
        fetchPointFiles(id),
        fetchSheetHistory(id),
        fetchProposals(id),
      ])
      const isSupply = pointData.type === 'abastecimiento'
      const [privData, verificationsData, statusData] = await Promise.all([
        permissions.canViewPrivate && sheetData ? fetchSheetPrivate(id) : Promise.resolve(null),
        isSupply ? fetchVerifications(id) : Promise.resolve([] as MapPointVerification[]),
        isSupply ? fetchSupplyStatus(id) : Promise.resolve(null),
      ])
      setStationName(pointData.station_id ? (await fetchStationById(pointData.station_id))?.name ?? null : null)
      setSheet(sheetData)
      setPerms(permissions)
      setFiles(filesData)
      setHistory(historyData)
      setProposals(proposalsData)
      setPriv(privData)
      setVerifications(verificationsData)
      setStatus(statusData)
      const ids: string[] = []
      if (sheetData?.last_reviewed_by_profile_id) ids.push(sheetData.last_reviewed_by_profile_id)
      for (const h of historyData) if (h.changed_by_profile_id) ids.push(h.changed_by_profile_id)
      setNames(await fetchProfileNames(ids))
    } catch (err) {
      setLoadError(describeSupabaseError(err, 'No pudimos cargar la ficha. Reintentá en unos segundos.'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const who = (profileId: string | null) => (profileId ? names.get(profileId) ?? 'otra persona' : 'otra persona')

  async function run<T>(key: string, action: () => Promise<T>, okMessage: string | null, fallback: string) {
    setError(null)
    setBusy(key)
    try {
      await action()
      if (okMessage) setNotice(okMessage)
      await load()
    } catch (err) {
      setError(
        isEditConflict(err)
          ? 'Otra persona cambió la ficha mientras tanto. Actualizamos la pantalla: revisá y volvé a intentar.'
          : describeSupabaseError(err, fallback),
      )
      if (isEditConflict(err)) await load()
    } finally {
      setBusy(null)
    }
  }

  async function openFile(file: MapPointFile) {
    setError(null)
    try {
      const url = await getMapPointFileUrl(file.storage_path, undefined)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos abrir el archivo.'))
    }
  }

  if (loading) {
    return (
      <AppShell title="Ficha del mapa">
        <div className="loading-state" role="status">Cargando la ficha…</div>
      </AppShell>
    )
  }
  if (loadError) {
    return (
      <AppShell title="Ficha del mapa">
        <Link to="/mapa" className="back-link">← Volver al mapa</Link>
        <div className="alert alert-danger" role="alert">{loadError}</div>
        <button type="button" className="btn btn-outlined" onClick={() => void load()}>Reintentar</button>
      </AppShell>
    )
  }
  if (!point) {
    return (
      <AppShell title="Ficha del mapa">
        <AccessDenied
          title="No encontramos este punto"
          message="Puede que lo hayan quitado del mapa o que no tengas acceso a él."
          backTo="/mapa"
          backLabel="Volver al mapa"
        />
      </AppShell>
    )
  }

  const isSupply = point.type === 'abastecimiento'
  const pendingProposals = proposals.filter((p) => p.status === 'pendiente')
  const unvalidatedFiles = files.filter((f) => f.status === 'pendiente')
  const mainFiles = files.filter((f) => !f.verification_id)

  return (
    <AppShell title={point.name}>
      <Link to="/mapa" className="back-link">← Volver al mapa</Link>
      {notice && <SuccessNotice message={notice} onClose={() => setNotice(null)} tone={noticeTone} />}

      <div className="sheet-header">
        <h1 className="page-title">{point.name}</h1>
        <p className="sheet-kind">
          <Icon name="mapPin" size={14} /> {pointKindLabel(point.type, point.subtype)}
          {!point.is_active && <span className="badge badge-neutral"> Fuera del mapa</span>}
        </p>
        <p className="sheet-review">{sheetReviewLabel(sheet)}</p>
      </div>

      <div className="sheet-actions">
        {perms.canValidate && (
          <Link to={`/mapa/puntos/${point.id}/editar`} className="btn btn-primary">
            <Icon name="edit" size={16} /> {sheet ? 'Editar ficha' : 'Cargar ficha'}
          </Link>
        )}
        {!perms.canValidate && perms.canPropose && (
          <Link to={`/mapa/puntos/${point.id}/editar`} className="btn btn-primary">
            <Icon name="edit" size={16} /> Proponer cambios
          </Link>
        )}
        {perms.canValidate && sheet && (
          <button
            type="button"
            className="btn btn-outlined"
            disabled={busy !== null}
            onClick={() => void run('review', () => markSheetReviewed(point.id), 'Quedó registrado que la información fue revisada y sigue vigente.', 'No pudimos registrar la revisión.')}
          >
            {busy === 'review' ? 'Guardando…' : 'Confirmar que sigue vigente'}
          </button>
        )}
        {isSupply && perms.canPropose && (
          <Link to={`/mapa/puntos/${point.id}/verificaciones/nueva`} className="btn btn-outlined">
            <Icon name="check" size={16} /> Registrar verificación
          </Link>
        )}
        <Link to={`/mapa?punto=${point.id}`} className="btn btn-ghost">Ver en el mapa</Link>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {isSupply && status && (
        <section className="card-solid sheet-section" aria-labelledby="sec-estado">
          <h2 id="sec-estado" className="sheet-section-title">Estado según las verificaciones</h2>
          <p>
            <span className={`badge ${SUPPLY_STATUS_BADGE[status.status]}`}>{SUPPLY_STATUS_LABEL[status.status]}</span>
          </p>
          <p className="sheet-help">{SUPPLY_STATUS_HELP[status.status]}</p>
          {status.last_verified_on ? (
            <p>
              Última verificación: {formatDateAr(status.last_verified_on)} ({ageLabel(status.last_verified_on)})
              {status.last_verified_by_name ? `, por ${status.last_verified_by_name}` : ''}.
            </p>
          ) : (
            <p>Todavía no hay verificaciones registradas.</p>
          )}
          <p className="sheet-help">
            {status.review_every_days
              ? `Regla de revisión cargada en la ficha: cada ${status.review_every_days} días${status.review_due_on ? ` (corresponde volver a verificar desde el ${formatDateAr(status.review_due_on)})` : ''}.`
              : 'No hay una regla de revisión cargada para este punto: no tiene fecha de vencimiento.'}
          </p>
          <p className="sheet-help">Una verificación es un dato de su fecha. No reemplaza comprobar el punto en el lugar.</p>
        </section>
      )}

      <section className="card-solid sheet-section" aria-labelledby="sec-ficha">
        <h2 id="sec-ficha" className="sheet-section-title">Datos de la ficha</h2>
        {!sheet ? (
          <p className="empty-note">
            Este punto todavía no tiene ficha. {perms.canValidate ? 'Podés cargarla con "Cargar ficha".' : perms.canPropose ? 'Podés proponer los datos con "Proponer cambios" y los valida Informática o el Secretario Regional.' : ''}
          </p>
        ) : (
          <>
            <dl className="sheet-dl">
              <dt>Dirección o referencia</dt><dd>{showOrNoInfo(sheet.address)}</dd>
              <dt>Localidad</dt><dd>{showOrNoInfo(sheet.locality)}</dd>
              <dt>Cuartel responsable</dt><dd>{stationName ?? 'Sin cuartel asignado'}</dd>
              <dt>Entidad responsable</dt><dd>{showOrNoInfo(sheet.responsible_entity)}</dd>
              <dt>Contacto institucional</dt><dd>{showOrNoInfo(sheet.institutional_contact)}</dd>
              <dt>Accesos</dt><dd>{showOrNoInfo(sheet.access_notes)}</dd>
              <dt>Observaciones</dt><dd>{showOrNoInfo(sheet.observations)}</dd>
              <dt>Riesgos documentados</dt><dd>{showOrNoInfo(sheet.documented_risks)}</dd>
            </dl>
            <h3 className="sheet-subtitle">Características conocidas</h3>
            {sheet.characteristics.length === 0 ? (
              <p className="empty-note">{NO_INFO}</p>
            ) : (
              <ul className="sheet-characteristics">
                {sheet.characteristics.map((c, i) => (
                  <li key={`${c.label}-${i}`}>
                    <strong>{c.label}:</strong> {c.value}
                    {c.unit ? ` ${c.unit}` : ''}
                    {c.source ? <span className="sheet-source"> · fuente: {c.source}</span> : <span className="sheet-source"> · fuente: sin indicar</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="sheet-provenance">
              Relevado{sheet.surveyed_by_name ? ` por ${sheet.surveyed_by_name}` : ''}
              {sheet.surveyed_on ? ` el ${formatDateAr(sheet.surveyed_on)} (${ageLabel(sheet.surveyed_on)})` : ' (fecha sin indicar)'}.
              {sheet.last_reviewed_at
                ? ` Validado por ${who(sheet.last_reviewed_by_profile_id)} el ${formatDateAr(sheet.last_reviewed_at)} (${ageLabel(sheet.last_reviewed_at)}).`
                : ' Todavía no fue validado por quien corresponde.'}{' '}
              Es lo registrado en ese momento: no describe el estado actual del lugar.
            </p>
          </>
        )}
      </section>

      {perms.canViewPrivate && sheet && (
        <PrivateSection pointId={point.id} data={priv} onSaved={() => void load()} />
      )}

      <section className="card-solid sheet-section" aria-labelledby="sec-archivos">
        <h2 id="sec-archivos" className="sheet-section-title">Archivos</h2>
        {mainFiles.length === 0 ? (
          <p className="empty-note">No hay archivos cargados.</p>
        ) : (
          <ul className="attachment-list attachment-list--boxed">
            {mainFiles.map((f) => (
              <FileItem
                key={f.id}
                file={f}
                perms={perms}
                busy={busy === `file-${f.id}`}
                onOpen={() => void openFile(f)}
                onValidate={() => void run(`file-${f.id}`, () => validatePointFile(f.id), 'El archivo quedó validado.', 'No pudimos validar el archivo.')}
                onRemove={() => {
                  if (window.confirm(`¿Quitar "${f.file_name}" de la ficha? El archivo se borra.`)) {
                    void run(`file-${f.id}`, () => removePointFile(f), 'Se quitó el archivo.', 'No pudimos quitar el archivo.')
                  }
                }}
              />
            ))}
          </ul>
        )}
        {unvalidatedFiles.length > 0 && !perms.canValidate && (
          <p className="sheet-help">Los archivos pendientes los ve solo quien los subió y quienes validan, hasta que se validen.</p>
        )}
        {perms.canPropose && <FileUploader pointId={point.id} canViewPrivate={perms.canViewPrivate} onUploaded={(m) => { setNotice(m); void load() }} />}
      </section>

      {(pendingProposals.length > 0 || proposals.length > 0) && (
        <section className="card-solid sheet-section" aria-labelledby="sec-propuestas">
          <h2 id="sec-propuestas" className="sheet-section-title">Cambios propuestos</h2>
          <ul className="sheet-list">
            {proposals.map((p) => (
              <ProposalItem
                key={p.id}
                proposal={p}
                sheet={sheet}
                canValidate={perms.canValidate}
                busy={busy === `prop-${p.id}`}
                onReview={(accept, note) =>
                  void run(
                    `prop-${p.id}`,
                    () => reviewProposal(p.id, accept, note || null, sheet?.row_version ?? null),
                    accept ? 'La propuesta se aceptó y la ficha quedó actualizada.' : 'La propuesta se rechazó.',
                    'No pudimos resolver la propuesta.',
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {isSupply && (
        <section className="card-solid sheet-section" aria-labelledby="sec-verificaciones">
          <h2 id="sec-verificaciones" className="sheet-section-title">Historial de verificaciones</h2>
          {verifications.length === 0 ? (
            <p className="empty-note">Todavía no hay verificaciones registradas.</p>
          ) : (
            <ul className="sheet-list">
              {verifications.map((v) => (
                <VerificationItem
                  key={v.id}
                  verification={v}
                  evidence={files.filter((f) => f.verification_id === v.id)}
                  canResolve={perms.canPropose}
                  busy={busy === `ver-${v.id}`}
                  onOpenFile={(f) => void openFile(f)}
                  onResolve={(resolution) =>
                    void run(`ver-${v.id}`, () => resolveFollowUp(v.id, resolution || null), 'El seguimiento quedó marcado como resuelto.', 'No pudimos resolver el seguimiento.')
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card-solid sheet-section" aria-labelledby="sec-historial">
        <h2 id="sec-historial" className="sheet-section-title">Historial de la ficha</h2>
        {history.length === 0 ? (
          <p className="empty-note">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="sheet-list">
            {history.map((h, index) => {
              const previous = history[index + 1]?.snapshot ?? null
              const changed = h.change_kind === 'revision' ? [] : changedSheetFields(previous, h.snapshot)
              return (
                <li key={h.id} className="sheet-list-item">
                  <strong>{HISTORY_KIND_LABEL[h.change_kind]}</strong>
                  <span className="sheet-meta">
                    {' '}
                    · versión {h.version} · {who(h.changed_by_profile_id)} · {formatDateAr(h.changed_at)}
                  </span>
                  {changed.length > 0 && <div className="sheet-meta">Cambió: {changed.map((f) => SHEET_FIELD_LABEL[f]).join(', ')}.</div>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="sheet-footnote">
        Esta ficha muestra lo registrado en el relevamiento y quién lo cargó. No reemplaza la verificación en el lugar ni indica cómo actuar.
      </p>
    </AppShell>
  )
}

// ---------------- Parte reservada ----------------

function PrivateSection({ pointId, data, onSaved }: { pointId: string; data: MapPointSheetPrivate | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [contacts, setContacts] = useState(data?.personal_contacts ?? '')
  const [notes, setNotes] = useState(data?.sensitive_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await savePrivate(pointId, { personal_contacts: contacts.trim() || null, sensitive_notes: notes.trim() || null }, data?.row_version ?? null)
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(
        isEditConflict(err)
          ? 'Otra persona cambió esta parte mientras la editabas. Actualizamos la pantalla; copiá lo que escribiste antes de volver a editar.'
          : describeSupabaseError(err, 'No pudimos guardar la parte reservada.'),
      )
      if (isEditConflict(err)) {
        setEditing(false)
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card-solid sheet-section sheet-section--private" aria-labelledby="sec-reservado">
      <h2 id="sec-reservado" className="sheet-section-title">
        <Icon name="lock" size={16} /> Reservado
      </h2>
      <p className="sheet-help">
        Contactos personales y notas sensibles. Solo lo ven Informática, el Secretario Regional y el Presidente de CD, el jefe de cuerpo activo y el usuario de carga de este cuartel.
      </p>
      {editing ? (
        <div>
          <div className="field">
            <label htmlFor="reservado-contactos">Contactos personales</label>
            <textarea id="reservado-contactos" rows={3} value={contacts} maxLength={1000} onChange={(e) => setContacts(e.target.value)} disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="reservado-notas">Notas sensibles</label>
            <textarea id="reservado-notas" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
          </div>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="btn btn-outlined" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <dl className="sheet-dl">
            <dt>Contactos personales</dt><dd>{showOrNoInfo(data?.personal_contacts)}</dd>
            <dt>Notas sensibles</dt><dd>{showOrNoInfo(data?.sensitive_notes)}</dd>
          </dl>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <button
            type="button"
            className="btn btn-outlined btn-sm"
            onClick={() => {
              setContacts(data?.personal_contacts ?? '')
              setNotes(data?.sensitive_notes ?? '')
              setEditing(true)
            }}
          >
            Editar parte reservada
          </button>
        </>
      )}
    </section>
  )
}

// ---------------- Archivos ----------------

function FileItem({
  file,
  perms,
  busy,
  onOpen,
  onValidate,
  onRemove,
}: {
  file: MapPointFile
  perms: PointPermissions
  busy: boolean
  onOpen: () => void
  onValidate: () => void
  onRemove: () => void
}) {
  return (
    <li className="attachment-item">
      <span className="list-item-icon">
        <Icon name={file.mime_type.startsWith('image/') ? 'image' : 'file'} size={18} />
      </span>
      <span className="file-picker-name">
        <strong>{file.caption || file.file_name}</strong>
        <span>
          {file.file_kind === 'foto' ? 'Foto' : file.file_kind === 'plano' ? 'Plano' : 'Documento'} · {formatBytes(file.file_size)}
          {file.visibility === 'reservado' && ' · Reservado'}
          {file.status === 'pendiente' && ' · Pendiente de validación'}
        </span>
      </span>
      <button type="button" className="btn btn-outlined btn-sm" onClick={onOpen} disabled={busy}>Abrir</button>
      {perms.canValidate && file.status === 'pendiente' && (
        <button type="button" className="btn btn-outlined btn-sm" onClick={onValidate} disabled={busy}>Validar</button>
      )}
      {(perms.canValidate || file.status === 'pendiente') && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} disabled={busy}>Quitar</button>
      )}
    </li>
  )
}

function FileUploader({ pointId, canViewPrivate, onUploaded }: { pointId: string; canViewPrivate: boolean; onUploaded: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<MapFileKind>('foto')
  const [visibility, setVisibility] = useState<'compartido' | 'reservado'>('compartido')
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    setProgress(0)
    try {
      const saved = await addPointFile({ pointId, file, kind, visibility, caption }, setProgress)
      setFile(null)
      setCaption('')
      onUploaded(saved.status === 'validado' ? 'El archivo se agregó a la ficha.' : 'El archivo se subió y queda pendiente de validación.')
    } catch (err) {
      setError(describeSupabaseError(err, 'No pudimos subir el archivo.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="sheet-uploader">
      <h3 className="sheet-subtitle">Agregar un archivo</h3>
      <FilePicker
        id="ficha-archivo"
        label="Foto, plano o documento"
        file={file}
        onChange={setFile}
        accept={FILE_ACCEPT}
        isAllowedType={isMapPointMimeAllowed}
        maxBytes={MAP_POINT_FILE_MAX_BYTES}
        formatsLabel="PDF, JPG, PNG o WEBP, hasta 10 MB"
        allowCamera
        disabled={uploading}
      />
      <div className="form-row">
        <div className="field">
          <label htmlFor="ficha-archivo-tipo">Qué es</label>
          <select id="ficha-archivo-tipo" value={kind} onChange={(e) => setKind(e.target.value as MapFileKind)} disabled={uploading}>
            <option value="foto">Foto</option>
            <option value="plano">Plano</option>
            <option value="documento">Documento</option>
          </select>
        </div>
        {canViewPrivate && (
          <div className="field">
            <label htmlFor="ficha-archivo-vis">Quién lo ve</label>
            <select id="ficha-archivo-vis" value={visibility} onChange={(e) => setVisibility(e.target.value as 'compartido' | 'reservado')} disabled={uploading}>
              <option value="compartido">Quien ve el punto (una vez validado)</option>
              <option value="reservado">Solo quien ve la parte reservada</option>
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="ficha-archivo-leyenda">Leyenda (opcional)</label>
        <input id="ficha-archivo-leyenda" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} disabled={uploading} />
      </div>
      {uploading && <progress max={1} value={progress} aria-label="Progreso de la subida" />}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={() => void handleUpload()} disabled={!file || uploading}>
        {uploading ? 'Subiendo…' : 'Subir archivo'}
      </button>
    </div>
  )
}

// ---------------- Propuestas ----------------

function ProposalItem({
  proposal,
  sheet,
  canValidate,
  busy,
  onReview,
}: {
  proposal: MapPointSheetProposal
  sheet: MapPointSheet | null
  canValidate: boolean
  busy: boolean
  onReview: (accept: boolean, note: string) => void
}) {
  const [note, setNote] = useState('')
  const changed = useMemo(() => changedSheetFields(sheet as MapPointSheetPayload | null, proposal.payload), [sheet, proposal.payload])
  const outdated = proposal.status === 'pendiente' && sheet !== null && proposal.base_version !== null && proposal.base_version < (sheet.row_version ?? 0)
  return (
    <li className="sheet-list-item">
      <strong>{PROPOSAL_STATUS_LABEL[proposal.status]}</strong>
      <span className="sheet-meta">
        {' '}
        · {proposal.proposed_by_name ?? 'otra persona'} · {formatDateAr(proposal.proposed_at)}
      </span>
      {proposal.note && <div className="sheet-note">“{proposal.note}”</div>}
      {outdated && <div className="alert alert-warning">La ficha cambió después de esta propuesta: revisá que siga correspondiendo.</div>}
      <ul className="sheet-diff">
        {changed.map((field) => (
          <li key={field}>
            <strong>{SHEET_FIELD_LABEL[field]}:</strong> <span className="sheet-before">{formatValue(field, sheet?.[field])}</span> → <span className="sheet-after">{formatValue(field, proposal.payload[field])}</span>
          </li>
        ))}
        {changed.length === 0 && <li>No cambia ningún dato respecto de la ficha actual.</li>}
      </ul>
      {proposal.status !== 'pendiente' && proposal.reviewed_at && (
        <div className="sheet-meta">
          Resuelta por {proposal.reviewed_by_name ?? 'otra persona'} el {formatDateAr(proposal.reviewed_at)}
          {proposal.review_note ? `: ${proposal.review_note}` : '.'}
        </div>
      )}
      {canValidate && proposal.status === 'pendiente' && (
        <div className="sheet-review-form">
          <label htmlFor={`nota-${proposal.id}`} className="sr-only">Nota para quien propuso (opcional)</label>
          <input id={`nota-${proposal.id}`} placeholder="Nota para quien propuso (opcional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onReview(true, note)} disabled={busy}>Aceptar y actualizar la ficha</button>
            <button type="button" className="btn btn-outlined btn-sm" onClick={() => onReview(false, note)} disabled={busy}>Rechazar</button>
          </div>
        </div>
      )}
    </li>
  )
}

// ---------------- Verificaciones ----------------

function VerificationItem({
  verification: v,
  evidence,
  canResolve,
  busy,
  onOpenFile,
  onResolve,
}: {
  verification: MapPointVerification
  evidence: MapPointFile[]
  canResolve: boolean
  busy: boolean
  onOpenFile: (file: MapPointFile) => void
  onResolve: (resolution: string) => void
}) {
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState('')
  return (
    <li className="sheet-list-item">
      <strong>{formatDateAr(v.verified_on)}</strong>
      <span className="sheet-meta">
        {' '}
        · {VERIFICATION_RESULT_LABEL[v.result]} · {v.verified_by_name ?? 'otra persona'}
      </span>
      {v.problems && <div className="sheet-note"><strong>Problema informado:</strong> {v.problems}</div>}
      {v.notes && <div className="sheet-note">{v.notes}</div>}
      {v.follow_up && <div className="sheet-note"><strong>Seguimiento:</strong> {v.follow_up}</div>}
      {v.follow_up_status === 'pendiente' && <div className="sheet-meta">Seguimiento pendiente.</div>}
      {v.follow_up_status === 'resuelto' && (
        <div className="sheet-meta">
          Seguimiento resuelto el {formatDateAr(v.follow_up_resolved_on)} por {v.follow_up_resolved_by_name ?? 'otra persona'}
          {v.follow_up_resolution ? `: ${v.follow_up_resolution}` : '.'}
        </div>
      )}
      {evidence.length > 0 && (
        <div className="sheet-meta">
          Evidencia:{' '}
          {evidence.map((f) => (
            <button key={f.id} type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenFile(f)}>
              {f.caption || f.file_name}
            </button>
          ))}
        </div>
      )}
      {canResolve && v.follow_up_status === 'pendiente' && (
        <div className="sheet-review-form">
          {resolving ? (
            <>
              <label htmlFor={`res-${v.id}`} className="sr-only">Cómo se resolvió (opcional)</label>
              <input id={`res-${v.id}`} placeholder="Cómo se resolvió (opcional)" value={resolution} maxLength={500} onChange={(e) => setResolution(e.target.value)} disabled={busy} />
              <div className="sheet-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onResolve(resolution)} disabled={busy}>{busy ? 'Guardando…' : 'Marcar como resuelto'}</button>
                <button type="button" className="btn btn-outlined btn-sm" onClick={() => setResolving(false)} disabled={busy}>Cancelar</button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-outlined btn-sm" onClick={() => setResolving(true)}>Resolver el seguimiento</button>
          )}
        </div>
      )}
    </li>
  )
}
