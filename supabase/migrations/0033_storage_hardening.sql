-- SIGER4 - Storage: limites de bucket + limpieza de documentos "pending"
--
-- Ver auditoria de seguridad, Prioridad 9. Complementa la sanitizacion de
-- nombres de archivo y validacion de MIME/tamaño ya hecha client-side en
-- src/lib/api/storage.ts (0033 la respalda server-side, que es lo que
-- realmente no se puede bypasear).
--
-- Contexto sobre "documentos pending eternos": createDocument() inserta la
-- fila en "documents" con storage_path='pending' ANTES de subir el archivo
-- (storage_path es NOT NULL y las policies de Storage de "documents"
-- necesitan que el document_id ya exista para poder validar el alcance, ver
-- 0019). Si el usuario cierra la pestaña entre el insert y el upload, o el
-- upload falla, queda un documento fantasma con storage_path='pending' para
-- siempre. Rediseñar el flujo (subir primero, insertar despues) es un cambio
-- mayor de arquitectura fuera de esta tanda de hardening; se resuelve con una
-- funcion de limpieza que informatica_r4 puede correr periodicamente (RPC,
-- no automatica: borrar filas sin que un admin lo pida explicitamente seria
-- una accion destructiva silenciosa).

-- ============================================================
-- 1. Limites de bucket server-side (MIME + tamaño)
-- ============================================================
-- Estos limites son la defensa real (client-side en storage.ts es solo UX);
-- Storage los aplica en el propio servidor de Supabase antes de aceptar el
-- upload, sin importar que cliente lo mande.

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
where id = 'station-media';

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg'
    ]
where id = 'documents';

-- ============================================================
-- 2. Limpieza de documentos "pending" viejos
-- ============================================================
-- RPC que informatica_r4 puede invocar (desde /documentos o desde el SQL
-- Editor) para borrar documentos que se quedaron en storage_path='pending'
-- por mas de 24hs (tiempo mas que suficiente para que un upload normal
-- termine; si sigue en pending pasado ese tiempo, el intento de carga se
-- abandono). Devuelve cuantos borro, para poder loguearlo/mostrarlo en la UI.
-- No toca documentos con archivo real cargado.

create or replace function cleanup_pending_documents(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if not is_informatica_r4() then
    raise exception 'No tenés permiso para ejecutar esta limpieza.';
  end if;

  delete from documents
  where storage_path = 'pending'
    and created_at < now() - make_interval(hours => p_older_than_hours);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function cleanup_pending_documents(integer) is 'Borra filas de documents que quedaron con storage_path=''pending'' (upload nunca completado) por mas de N horas (default 24). Solo informatica_r4 puede ejecutarla. No borra archivos de Storage porque un documento pending nunca llego a tener archivo subido.';

revoke all on function cleanup_pending_documents(integer) from public;
grant execute on function cleanup_pending_documents(integer) to authenticated;
