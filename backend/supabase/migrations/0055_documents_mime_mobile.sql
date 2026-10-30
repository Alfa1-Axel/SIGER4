-- SIGER4 - Ampliar tipos MIME aceptados en el bucket "documents" para mobile
--
-- Contexto: reporte de que la carga de documentos "sigue sin funcionar" desde
-- celular. Investigacion de punta a punta encontro una causa real (no la
-- unica posible, pero si confirmada por lectura de codigo): el bucket
-- "documents" solo aceptaba server-side pdf/doc/docx/xls/xlsx/png/jpeg (ver
-- 0033_storage_hardening.sql). Fotos tomadas o elegidas desde la galeria de
-- un celular llegan habitualmente como:
--   - image/heic o image/heif (formato por defecto de camara en iPhone)
--   - image/webp (formato por defecto de capturas de pantalla en Android
--     moderno, y de algunas apps de galeria/edicion)
-- Ninguno de los dos estaba permitido: Supabase Storage rechaza el upload
-- server-side con un error de tipo MIME antes de que el archivo llegue a
-- guardarse, sin importar que el cliente ya lo haya validado distinto. El
-- error SI se propaga hoy hasta el catch de DocumentoFormPage (uploadDocumentFile
-- hace "if (error) throw error"), pero el mensaje crudo de Storage no es claro
-- para un usuario final — se mejora tambien el mensaje client-side en
-- src/lib/api/storage.ts en el mismo cambio que esta migracion acompaña.
--
-- No se agregan tipos "genericos" (image/*, */*): la whitelist explicita
-- sigue siendo la defensa real server-side, solo se suman los dos formatos
-- de foto mas comunes que faltaban para el caso de uso real de mobile.

update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif'
    ]
where id = 'documents';
