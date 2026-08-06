-- SIGER4 - No notificar documentos hasta que el archivo real esté confirmado
--
-- Bug real reportado: en mobile, sacar una foto (o elegir cualquier archivo)
-- disparaba una notificación push/interna de "Nuevo documento" AUNQUE la
-- subida a Storage fallara después y el usuario viera en pantalla "No se
-- pudo subir el archivo". Causa exacta: trg_notify_document_created (creado
-- en 0023_automatic_notifications.sql) corre "after insert on documents" sin
-- mirar storage_path — y createDocument() en el cliente SIEMPRE inserta la
-- fila con storage_path='pending' primero (la policy de Storage exige que la
-- fila ya exista antes de poder subir el archivo, ver 0019), recién
-- actualizando storage_path al path real después de que el upload termina
-- con éxito. La notificación salía en el insert inicial, antes de que se
-- supiera si el archivo se iba a terminar de subir o no.
--
-- No hay ningún flujo del cliente que inserte documents con un storage_path
-- real desde el insert (confirmado leyendo src/lib/api/documents.ts) — todo
-- pasa siempre por el placeholder 'pending' + un update posterior. Por eso
-- alcanza con mover el trigger de "after insert" a "after update", disparando
-- solo cuando storage_path deja de ser 'pending'. Se agrega ademas una
-- guarda "not (tg_op = 'insert' and new.storage_path = 'pending')" por si en
-- el futuro algun flujo (ej. un backfill administrativo) llega a insertar ya
-- con un storage_path real — ese caso tambien debe notificar, y con "after
-- insert or update" cubre ambos sin duplicar: en el camino normal el insert
-- inicial no notifica (queda en pending) y el update posterior si.

drop trigger if exists trg_notify_document_created on documents;

create or replace function notify_document_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nunca notificar mientras el documento sigue sin archivo real: ni en el
  -- insert inicial (siempre pending, ver arriba) ni en ningun update que
  -- deje storage_path en pending.
  if new.storage_path = 'pending' then
    return new;
  end if;
  -- En un update, notificar solo la vez que storage_path deja de ser
  -- 'pending' (la confirmacion real) -- no en cada edicion posterior del
  -- documento (titulo/categoria/alcance), que no es un documento "nuevo".
  if tg_op = 'update' and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;
  if tg_op = 'update' and old.storage_path <> 'pending' then
    -- Ya tenia un archivo real antes (ej. reemplazo de archivo en modo
    -- edicion) -- eso no es "documento nuevo", ya se notifico la primera vez.
    return new;
  end if;

  insert into notifications (profile_id, region_id, subsede_id, station_id, type, title, body)
  values (
    new.profile_id,
    case when new.profile_id is null then new.region_id else null end,
    case when new.profile_id is null then new.subsede_id else null end,
    case when new.profile_id is null then new.station_id else null end,
    'documento_actualizado',
    'Nuevo documento: ' || new.title,
    'Se cargó un nuevo documento (' || new.category || ') en tu alcance.'
  );
  return new;
end;
$$;

comment on function notify_document_created() is 'Crea una notificacion con el mismo alcance del documento (region/subsede/cuartel/usuario especifico) recien cuando storage_path deja de ser ''pending'' -- nunca en el insert inicial (siempre pending) ni si la carga del archivo real fallo. Corrige el bug de notificaciones falsas cuando la subida fallaba en mobile (ver DEPLOYMENT.md).';

create trigger trg_notify_document_created
  after insert or update on documents
  for each row execute function notify_document_created();
