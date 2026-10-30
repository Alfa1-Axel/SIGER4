-- SIGER4 - Papelera de Documentos con retencion de 30 dias
--
-- Nuevo modulo (ciclo funcional 2026-08): eliminar un documento ya no lo
-- borra de inmediato. Pasa a un estado de "papelera" (soft delete) durante
-- 30 dias, en los que puede restaurarse; pasado ese plazo puede purgarse
-- definitivamente (fila de documents + document_versions + archivos reales
-- en el bucket "documents" de Storage).
--
-- Esto era deuda documentada desde 0045_document_folders.sql ("Fuera de
-- alcance... papelera de 30 dias / borrado definitivo diferido").
--
-- Diseño:
--   1. Columnas nuevas en documents para el soft delete (ver mas abajo).
--   2. La policy de escritura existente (documents_write_admin_regional_station,
--      "for all", ver 0047/0048) YA autoriza UPDATE dentro del alcance de
--      cada rol -- enviar a papelera y restaurar son UPDATE (deleted_at
--      pasa a tener valor o vuelve a null), asi que NO necesitan una policy
--      nueva: los mismos roles que hoy pueden editar/borrar un documento
--      son los que pueden mandarlo a papelera o restaurarlo.
--   3. Lo que SI cambia es el DELETE real (purga): la matriz pedida es
--      "purga definitiva preferentemente solo informatica_r4" -- mas
--      restrictivo que la policy "for all" actual, que tambien permite
--      DELETE a roles regionales/de cuartel. Postgres no permite "restar"
--      permiso agregando una policy adicional (las policies permisivas se
--      OR-ean entre si) -- hay que reemplazar la policy "for all" por 3
--      policies separadas (select/insert/update, sin cambios de alcance) +
--      una policy de delete nueva, informatica_r4-only.
--   4. La purga real (borrar el archivo del bucket, no solo la fila) NO se
--      puede hacer desde SQL/PL-pgSQL puro: `delete from storage.objects`
--      borra la fila de metadata pero no el blob fisico en el object store
--      (esa operacion solo la expone la Storage API, no SQL). Por eso la
--      purga es una Edge Function nueva (purge-documents), no una funcion
--      de Postgres -- mismo motivo por el que enviar push real requiere
--      send-push en vez de un trigger de SQL.
--   5. purge_after se calcula en el momento de mandar a la papelera
--      (deleted_at + 30 dias) y queda fijo -- no se recalcula si el
--      documento se restaura y se vuelve a borrar (cada paso a papelera es
--      un ciclo nuevo con su propio purge_after).

alter table documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists purge_after timestamptz,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_profile_id uuid references profiles(id) on delete set null;

comment on column documents.deleted_at is 'Momento en que el documento se envio a la papelera (soft delete). NULL = documento activo, visible en los listados normales.';
comment on column documents.deleted_by_profile_id is 'Quien lo envio a la papelera.';
comment on column documents.delete_reason is 'Motivo opcional del envio a papelera.';
comment on column documents.purge_after is 'Momento a partir del cual el documento puede purgarse definitivamente (deleted_at + 30 dias, fijado al momento del soft delete). NULL si el documento nunca fue enviado a la papelera.';
comment on column documents.restored_at is 'Momento de la ultima restauracion desde la papelera (si aplica). No se borra al volver a eliminarse -- solo informativo del ultimo ciclo.';
comment on column documents.restored_by_profile_id is 'Quien restauro el documento la ultima vez.';

-- Indice parcial: la papelera y la busqueda de vencidos para purgar son las
-- unicas consultas que filtran por deleted_at, y siempre sobre documentos
-- YA en papelera -- un indice parcial (solo where deleted_at is not null)
-- es mas chico y mas util que uno sobre toda la tabla.
create index if not exists idx_documents_deleted_at on documents(deleted_at) where deleted_at is not null;
create index if not exists idx_documents_purge_after on documents(purge_after) where deleted_at is not null and purge_after is not null;

-- ============================================================
-- Trigger: fijar purge_after automaticamente al mandar a la papelera
-- ============================================================
-- Se calcula server-side (no confia en que el cliente mande la fecha
-- correcta): apenas deleted_at pasa de null a un valor, purge_after queda
-- fijo en deleted_at + 30 dias. Si se restaura (deleted_at vuelve a null),
-- purge_after tambien se limpia -- un documento activo no deberia tener una
-- fecha de purga pendiente colgada.

create or replace function set_document_purge_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.purge_after := new.deleted_at + interval '30 days';
  elsif new.deleted_at is null and old.deleted_at is not null then
    new.purge_after := null;
  end if;
  return new;
end;
$$;

comment on function set_document_purge_after() is 'Fija documents.purge_after = deleted_at + 30 dias automaticamente al enviar un documento a la papelera (deleted_at null -> valor). Lo limpia si se restaura (deleted_at valor -> null). Independiente de trg_documents_updated_at (0001): cada uno toca una columna distinta, no hay dependencia de orden entre ambos triggers BEFORE UPDATE.';

create trigger trg_documents_set_purge_after
  before update on documents
  for each row execute function set_document_purge_after();

-- ============================================================
-- RLS: separar el DELETE real (purga) del resto de la escritura
-- ============================================================
-- documents_write_admin_regional_station (0047/0048) era "for all" -- se
-- reemplaza por 3 policies puntuales (select/insert/update, MISMO alcance,
-- sin cambios de comportamiento para esas 3 operaciones) + una policy de
-- delete nueva, mas restrictiva.

drop policy if exists "documents_write_admin_regional_station" on documents;

-- select ya existia como policy propia (documents_select_scope, 0017/0019),
-- no se toca. Solo se reemplaza el bloque de escritura.

create policy "documents_insert_admin_regional_station" on documents
  for insert with check (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

create policy "documents_update_admin_regional_station" on documents
  for update using (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  )
  with check (
    is_informatica_r4()
    or (is_regional_role() and (
      (region_id is not null and region_id in (select my_region_ids()))
      or (subsede_id is not null and subsede_id in (select id from subsedes where region_id in (select my_region_ids())))
      or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
    ))
    or (station_id in (select my_station_ids()) and (
      has_role('usuario_carga_cuartel') or has_role('presidente_cuartel') or has_role('secretario_comision') or has_role('jefe_cuerpo_activo')
    ))
  );

comment on policy "documents_update_admin_regional_station" on documents is 'Mismo alcance que la vieja documents_write_admin_regional_station (0047/0048), pero ahora solo cubre UPDATE. Usado tanto para edicion normal del documento como para enviar a papelera / restaurar (ambos son UPDATE de deleted_at). El DELETE real (purga) esta en una policy separada, mas restrictiva -- ver documents_delete_informatica.';

-- Purga definitiva: solo informatica_r4/integrante_informatica pueden borrar
-- la fila de verdad, y solo si ya esta en la papelera (deleted_at not null)
-- -- ni siquiera informatica_r4 deberia poder saltarse el paso de papelera
-- por accidente con un DELETE directo sobre un documento activo. La purga
-- real (incluye borrar los archivos de Storage) la hace la Edge Function
-- purge-documents con service_role, que bypasea RLS -- esta policy es la
-- que protege contra un DELETE hecho desde el cliente directamente.
create policy "documents_delete_informatica" on documents
  for delete using (
    is_informatica_r4() and deleted_at is not null
  );

comment on policy "documents_delete_informatica" on documents is 'Purga definitiva: solo informatica_r4/integrante_informatica, y solo sobre documentos ya en la papelera (deleted_at not null) -- nunca un DELETE directo sobre un documento activo. La Edge Function purge-documents usa service_role (bypasea RLS) para el flujo automatico/manual real; esta policy es la barrera si alguien intenta un DELETE directo desde el cliente.';

-- document_versions no necesita cambios de RLS: su policy de insert
-- (document_versions_write_admin_regional_station, 0047) sigue igual, y no
-- tiene policy de update/delete para el cliente -- el borrado de versiones
-- al purgar lo hace la Edge Function con service_role.

-- ============================================================
-- Purga automatica diaria (pg_cron) via la Edge Function purge-documents
-- ============================================================
-- Mismo patron que send_weekly_reminder()/0036: una funcion de Postgres que
-- llama a la Edge Function por HTTP (net.http_post) con el secreto
-- compartido, programada con pg_cron. Requiere las MISMAS extensiones que
-- 0036 (pg_cron + pg_net) y la MISMA config de base
-- (siger4.project_url / siger4.cron_shared_secret) -- si el proyecto ya
-- corrio 0036, esta parte ya esta lista y esta migracion no pide nada nuevo
-- ahi. Si esta es la primera migracion de este proyecto que usa pg_cron/
-- pg_net, ver DEPLOYMENT.md seccion del recordatorio semanal para el paso a
-- paso completo de habilitacion + configuracion.
--
-- A diferencia de send_weekly_reminder(), esta funcion NO inserta nada en
-- notifications -- solo dispara la purga real en la Edge Function. Si
-- project_url/cron_shared_secret no estan configurados, no purga nada y
-- deja un WARNING (no falla en silencio, pero tampoco rompe el resto del
-- sistema si nadie configuro esto todavia).

create or replace function trigger_document_purge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_cron_secret text;
begin
  v_project_url := current_setting('siger4.project_url', true);
  v_cron_secret := current_setting('siger4.cron_shared_secret', true);

  if v_project_url is null or v_cron_secret is null then
    raise warning 'trigger_document_purge: faltan siger4.project_url / siger4.cron_shared_secret (ver DEPLOYMENT.md). No se purgo ningun documento en esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/purge-documents',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

comment on function trigger_document_purge() is 'Dispara la Edge Function purge-documents (sin documentId -> purga todos los documentos con purge_after vencido) via pg_net. Llamado por el job de pg_cron "siger4-document-purge". Requiere siger4.project_url/siger4.cron_shared_secret configurados (mismos que el recordatorio semanal de 0036) -- sin ellos, no hace nada y deja un WARNING en los logs.';

revoke all on function trigger_document_purge() from public;

select cron.schedule(
  'siger4-document-purge',
  '0 6 * * *', -- 6:00 UTC = 3:00 AM hora Argentina (fuera de horario habitual de uso)
  $$select trigger_document_purge()$$
);
