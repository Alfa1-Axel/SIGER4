-- SIGER4 - Consultas de verificación de seguridad (solo lectura)
--
-- Se pegan en Supabase → SQL Editor y se leen los resultados. No modifican nada.
-- Cada bloque dice qué resultado se espera. Después de correr las migraciones
-- 0111 a 0117 (DEPLOYMENT.md secciones 70 y 71) todos tienen que dar lo esperado.
-- Cualquier fila donde se esperaba "ninguna" es un hallazgo a tratar.
--
-- Repetir después de cada migración nueva que cree tablas o funciones.

-- 1. Tablas de public sin RLS.                                  ESPERADO: ninguna fila
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2. Tablas con RLS pero sin ninguna política.                  ESPERADO: ninguna fila
select c.relname as tabla_sin_politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;

-- 3. Políticas abiertas a todos (condición true).               ESPERADO: ninguna fila
select tablename || '.' || policyname as politica_abierta
from pg_policies
where schemaname = 'public' and (qual in ('true', '(true)') or with_check in ('true', '(true)'))
order by 1;

-- 4. Funciones de public que un usuario SIN SESIÓN (anon) puede ejecutar.
--    ESPERADO: ninguna fila (las que son de una extensión no cuentan).
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion_ejecutable_sin_sesion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 5. Tablas y vistas de public con algún permiso para anon.     ESPERADO: ninguna fila
select c.relname as objeto_con_permiso_para_anon
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
order by 1;

-- 6. El secreto de configuración: nadie por la API.
--    ESPERADO: anon = false, authenticated = false, service_role = true
select has_function_privilege('anon', 'public.get_system_setting(text)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.get_system_setting(text)', 'execute') as authenticated,
       has_function_privilege('service_role', 'public.get_system_setting(text)', 'execute') as service_role;

-- 7. Funciones SECURITY DEFINER sin search_path fijo.           ESPERADO: ninguna fila
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as definer_sin_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
order by 1;

-- 8. Funciones de disparador que la API puede llamar.           ESPERADO: ninguna fila
select p.proname as disparador_ejecutable_por_la_api
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
order by 1;

-- 9. Vistas: tienen que respetar la RLS de quien consulta.      ESPERADO: todas "true"
select c.relname as vista,
       coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'DEFINER (revisar)') as security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;

-- 10. Buckets de Storage.
--     ESPERADO: públicos solo avatars y station-media; station-media sin image/svg+xml;
--     map-point-files, documents, department-reports y school-avales privados.
select id as bucket, public as publico, file_size_limit as limite_bytes, allowed_mime_types as tipos
from storage.buckets
order by id;

-- 11. Autoría protegida (0116).                                 ESPERADO: 10 filas
select c.relname as tabla, t.tgname as disparador
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname = 'trg_protect_author' and not t.tgisinternal
order by 1;

-- 12. Migraciones 0111 a 0117 aplicadas.                        ESPERADO: siete filas "aplicada"
select nombre, case when aplicada then 'aplicada' else 'FALTA' end as estado
from (values
  ('0111 tipos del mapa: lugar relevante y abastecimiento', exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'map_reference_point_type' and e.enumlabel = 'abastecimiento')),
  ('0112 versión por registro',                            exists (select 1 from pg_proc where proname = 'enforce_row_version')),
  ('0113 borradores de formularios',                       to_regclass('public.form_drafts') is not null and exists (select 1 from pg_proc where proname = 'save_form_draft')),
  ('0114 fichas de lugares del mapa',                      to_regclass('public.map_point_sheets') is not null and exists (select 1 from pg_proc where proname = 'save_map_point_sheet')),
  ('0115 verificaciones de abastecimiento',                to_regclass('public.map_point_verifications') is not null and exists (select 1 from pg_proc where proname = 'get_map_pending_items')),
  ('0116 refuerzo de seguridad',                           exists (select 1 from pg_proc where proname = 'protect_author_column')),
  ('0117 Avales: permisos, renovación y auditoría por áreas', exists (select 1 from pg_proc where proname = 'renew_school_aval') and exists (select 1 from pg_indexes where indexname = 'idx_school_avales_vigente_unico'))
) as m(nombre, aplicada)
order by nombre;

-- 13. Avales (0117): nadie borra ni archiva por la API directa.
--     ESPERADO: delete_directo_authenticated = false, y la policy de delete no existe (ninguna fila).
select has_table_privilege('authenticated', 'public.school_avales_documents', 'delete') as delete_directo_authenticated;
select policyname as policy_de_delete_que_no_deberia_existir
from pg_policies where schemaname = 'public' and tablename = 'school_avales_documents' and cmd = 'DELETE';

-- 14. Avales (0117): funciones nuevas sin acceso para anon.     ESPERADO: ninguna fila
select p.proname as funcion_de_avales_ejecutable_por_anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like '%school_aval%' or p.proname like '%school_avales%')
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 15. Avales (0117): políticas de la tabla y de Storage.
--     ESPERADO: select_scoped, insert_scoped y update_manage en la tabla; select, insert y delete en Storage.
select tablename, policyname, cmd
from pg_policies
where (schemaname = 'public' and tablename = 'school_avales_documents')
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'school_avales_storage_%')
order by tablename, policyname;

-- 16. Avales (0117): auditoría sin la ruta interna del archivo. ESPERADO: 0
select count(*) as filas_con_ruta_interna
from audit_logs
where table_name = 'school_avales_documents'
  and (old_value ->> 'storage_path' is not null or new_value ->> 'storage_path' is not null);

-- 17. Avales (0117): archivos del bucket sin aval registrado ("sueltos").
--     ESPERADO: pocos y recientes (una carga en curso). Los viejos se pueden borrar desde Storage.
select o.name as ruta, o.created_at
from storage.objects o
where o.bucket_id = 'school-avales'
  and not exists (select 1 from school_avales_documents d where d.storage_path = o.name)
order by o.created_at;

-- 18. Avales (0117): un solo aval vigente por persona y departamento. ESPERADO: ninguna fila
select department_id, renewal_key, count(*) as vigentes
from school_avales_documents
where is_archived = false and renewal_key is not null
group by 1, 2 having count(*) > 1;
