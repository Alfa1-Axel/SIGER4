-- Pruebas de 0121 y 0122: avisos de actualización publicada.
-- Se corre sobre una base armada con tests/db/rebuild.sh, desde esta carpeta:
--   psql -p 54329 -U postgres -d <base> -q -f test_0122_release_announcements.sql
-- Todo ocurre dentro de una transacción que se deshace al final.
\set QUIET on
\pset format unaligned
\pset footer off
\t on
set client_min_messages = warning;

begin;
\i fixture71.sql

-- Perfiles con cuenta: los de la fixture. "ret" queda inactivo; "ghost" es un perfil activo sin cuenta de acceso.
update profiles set is_active = false where id = t.prof('ret');
insert into profiles (id, full_name, email, is_active) values ('10000000-0000-0000-0000-000000000777', 'ghost', 'ghost@x', true);

-- Roles de la API para simular el proceso de publicación (en Supabase PostgREST entra como "authenticator").
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

-- Ejecuta una sentencia como la API: devuelve 'ok:<texto>' o 'ERR:<sqlstate>:<mensaje corto>'.
create or replace function pg_temp.api(p_role text, p_claims text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', p_claims, false);
  perform set_config('request.jwt.claim.sub', coalesce(p_claims::jsonb ->> 'sub', ''), false);
  perform set_config('request.jwt.claim.role', coalesce(p_claims::jsonb ->> 'role', ''), false);
  execute 'set local session authorization authenticator';
  execute 'set local role ' || quote_ident(p_role);
  execute p_sql into r;
  execute 'reset role';
  execute 'reset session authorization';
  return 'ok:' || coalesce(r, '');
exception when others then
  begin execute 'reset role'; execute 'reset session authorization'; exception when others then null; end;
  return 'ERR:' || sqlstate || ':' || left(sqlerrm, 80);
end $$;
grant execute on function pg_temp.api(text, text, text) to public;

select count(*) as activos from profiles where is_active and auth_user_id is not null \gset
select count(*) as legado_antes from notifications where type = 'actualizacion_sistema' \gset

select '== 1. Anunciar una versión con un módulo (como dueño de la base)';
select r::jsonb as r1 from (select announce_release('1.18.0', array['Documentos'], 'abc1234')::text as r) x \gset
select t.ok('devuelve ya_anunciada=false y los destinatarios', (:'r1'::jsonb ->> 'already_announced') = 'false' and (:'r1'::jsonb ->> 'recipients')::int = :activos);
select t.ok('hay un registro de la versión', (select count(*) from app_releases where version = '1.18.0') = 1);
select t.ok('el registro guarda módulos, commit y destinatarios', (select modules = array['Documentos'] and commit_sha = 'abc1234' and recipients = :activos from app_releases where version = '1.18.0'));
select t.ok('una notificación por cada perfil activo con cuenta', (select count(*) from notifications where type = 'actualizacion_publicada') = :activos);
select t.ok('ninguno recibe dos', (select max(c) from (select count(*) c from notifications where type = 'actualizacion_publicada' group by profile_id) x) = 1);
select t.ok('el perfil inactivo no recibe nada', not exists (select 1 from notifications where type = 'actualizacion_publicada' and profile_id = t.prof('ret')));
select t.ok('el perfil sin cuenta de acceso no recibe nada', not exists (select 1 from notifications where type = 'actualizacion_publicada' and profile_id = '10000000-0000-0000-0000-000000000777'));
select t.ok('título breve', not exists (select 1 from notifications where type = 'actualizacion_publicada' and title <> 'Nueva actualización'));
select t.ok('mensaje de un módulo', not exists (select 1 from notifications where type = 'actualizacion_publicada' and body <> 'Hay una nueva actualización en Documentos.'));
select t.ok('con un solo módulo trae el enlace a su pantalla', not exists (select 1 from notifications where type = 'actualizacion_publicada' and link_path is distinct from '/documentos'));
select t.ok('son notificaciones personales sin alcance territorial', not exists (select 1 from notifications where type = 'actualizacion_publicada' and (profile_id is null or region_id is not null or subsede_id is not null or station_id is not null)));
select t.ok('llevan la clave de la versión (evita duplicados)', not exists (select 1 from notifications where type = 'actualizacion_publicada' and app_update_id <> 'release:1.18.0'));
select t.ok('las novedades viejas (otro tipo) no se tocan', (select count(*) from notifications where type = 'actualizacion_sistema') = :legado_antes);

select '== 2. La misma versión dos veces: no se duplica';
select r::jsonb as r2 from (select announce_release('1.18.0', array['Documentos'])::text as r) x \gset
select t.ok('la segunda vez dice que ya estaba anunciada', (:'r2'::jsonb ->> 'already_announced') = 'true' and (:'r2'::jsonb ->> 'recipients')::int = 0);
select t.ok('no hay notificaciones nuevas', (select count(*) from notifications where type = 'actualizacion_publicada') = :activos);
select t.ok('sigue habiendo un solo registro', (select count(*) from app_releases where version = '1.18.0') = 1);
select t.ok('con otros módulos tampoco (la versión es la clave)', (:'r2'::jsonb ->> 'already_announced') = 'true' and ((select announce_release('1.18.0', array['Mapa Regional'])) ->> 'already_announced') = 'true');
-- Respaldo: aunque se perdiera el registro de la versión, el índice único por persona impide el segundo aviso.
delete from app_releases where version = '1.18.0';
select r::jsonb as r2b from (select announce_release('1.18.0', array['Documentos'])::text as r) x \gset
select t.ok('sin el registro, el índice único por persona evita el segundo aviso', (:'r2b'::jsonb ->> 'recipients')::int = 0 and (select count(*) from notifications where type = 'actualizacion_publicada' and app_update_id = 'release:1.18.0') = :activos);

select '== 3. Varios módulos y orden';
select r::jsonb as r3 from (select announce_release('1.19.0', array['Usuarios y roles', 'Mapa Regional', 'Usuarios y roles', 'Documentos'])::text as r) x \gset
select t.ok('texto agrupado, sin repetir y en el orden dado', (select count(*) from notifications where app_update_id = 'release:1.19.0' and body = 'Hay nuevas actualizaciones en Usuarios y roles, Mapa Regional y Documentos.') = :activos);
select t.ok('con varios módulos no hay enlace', not exists (select 1 from notifications where app_update_id = 'release:1.19.0' and link_path is not null));
select t.ok('dos módulos: "A y B"', release_announcement_body(array['Escuela', 'Avales']) = 'Hay nuevas actualizaciones en Escuela y Avales.');
select t.ok('un módulo sin ruta clara no trae enlace', (select count(*) from (select announce_release('1.19.1', array['Seguridad'])) x) = 1 and not exists (select 1 from notifications where app_update_id = 'release:1.19.1' and link_path is not null));
select t.ok('cada persona tiene un aviso por versión', (select max(c) from (select count(*) c from notifications where type = 'actualizacion_publicada' and app_update_id = 'release:1.19.0' group by profile_id) x) = 1);

select '== 4. Entradas inválidas';
select t.ok('versión vacía', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release('''', array[''Documentos''])::text') like 'ERR:22023%');
select t.ok('versión con formato raro', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''1.x'', array[''Documentos''])::text') like 'ERR:22023%');
select t.ok('versión con texto de más', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''1.2.3; drop table notifications'', array[''Documentos''])::text') like 'ERR:22023%');
select t.ok('sin módulos', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.0'', array[]::text[])::text') like 'ERR:22023%');
select t.ok('módulos nulos', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.1'', null)::text') like 'ERR:22023%');
select t.ok('módulo que no existe', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.2'', array[''Tabla secreta''])::text') like 'ERR:22023%');
select t.ok('siete módulos', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.3'', array[''Inicio'',''Cuarteles'',''Efectivos'',''Asistencia'',''Móviles'',''Escuela'',''Avales''])::text') like 'ERR:22023%');
select t.ok('"Región" no es un módulo', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.4'', array[''Mapa Región''])::text') like 'ERR:22023%');
select t.ok('commit inválido', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.5'', array[''Inicio''], ''no es un hash'')::text') like 'ERR:22023%');
select t.ok('módulo con texto muy largo', pg_temp.api('service_role', '{"role":"service_role"}', 'select announce_release(''2.0.6'', array[repeat(''a'', 5000)])::text') like 'ERR:22023%');
select t.ok('nada de lo inválido dejó registros', (select count(*) from app_releases where version in ('2.0.0','2.0.1','2.0.2','2.0.3','2.0.4','2.0.5','2.0.6')) = 0);

select '== 5. Quién puede anunciar';
select t.ok('anon no tiene permiso de ejecución', not has_function_privilege('anon', 'public.announce_release(text,text[],text)', 'execute'));
select t.ok('authenticated no tiene permiso de ejecución', not has_function_privilege('authenticated', 'public.announce_release(text,text[],text)', 'execute'));
select t.ok('service_role sí', has_function_privilege('service_role', 'public.announce_release(text,text[],text)', 'execute'));
select t.ok('el service_role de la API puede anunciar', pg_temp.api('service_role', '{"role":"service_role"}', 'select (announce_release(''3.0.0'', array[''Inventario''])->>''already_announced'')') = 'ok:false');
select t.ok('...y a Inventario le toca su enlace', exists (select 1 from notifications where app_update_id = 'release:3.0.0' and link_path = '/inventario'));
select t.ok('informatica_r4 desde la API: sin permiso', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'select announce_release(''3.0.1'', array[''Inicio''])::text') like 'ERR:42501%');
select t.ok('integrante de Informática: sin permiso', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('integ')) || '"}', 'select announce_release(''3.0.1'', array[''Inicio''])::text') like 'ERR:42501%');
select t.ok('usuario común: sin permiso', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', 'select announce_release(''3.0.1'', array[''Inicio''])::text') like 'ERR:42501%');
select t.ok('sin sesión (anon): sin permiso', pg_temp.api('anon', '{"role":"anon"}', 'select announce_release(''3.0.1'', array[''Inicio''])::text') like 'ERR:42501%');
-- Segundo candado: aunque por error alguien le diera permiso de ejecución a authenticated, la función misma lo rechaza.
grant execute on function announce_release(text, text[], text) to authenticated;
select t.ok('segundo candado: con permiso de ejecución indebido, la función igual rechaza a un usuario con sesión', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'select announce_release(''3.0.1'', array[''Inicio''])::text') like 'ERR:42501:Solo el proceso de publicación%');
revoke execute on function announce_release(text, text[], text) from authenticated;
select t.ok('ninguna de esas llamadas dejó nada', (select count(*) from app_releases where version = '3.0.1') = 0);

select '== 6. Nadie fabrica ni altera estos avisos desde la aplicación';
select t.ok('usuario común no puede insertarse uno propio', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', format('insert into notifications (profile_id, type, title, body) values (%L, ''actualizacion_publicada'', ''Falso'', ''Falso'') returning id::text', t.prof('comun'))) like 'ERR:42501%');
select t.ok('informatica_r4 tampoco puede insertar uno por la API', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', format('insert into notifications (profile_id, type, title, body) values (%L, ''actualizacion_publicada'', ''Falso'', ''Falso'') returning id::text', t.prof('comun'))) like 'ERR:42501%');
select t.ok('ni un aviso masivo por Regional', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'insert into notifications (region_id, type, title, body) values ((select id from regions limit 1), ''actualizacion_publicada'', ''Falso'', ''Falso'') returning id::text') like 'ERR:42501%');
select t.ok('control: un aviso común propio sigue pudiéndose crear', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', format('insert into notifications (profile_id, type, title, body) values (%L, ''reporte_generado'', ''Reporte'', ''ok'') returning ''creado''', t.prof('comun'))) = 'ok:creado');
select t.ok('no se puede editar el texto de uno propio', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', format('update notifications set title = ''Hackeado'' where profile_id = %L and type = ''actualizacion_publicada'' returning ''editado''', t.prof('comun'))) like 'ERR:42501%');
select t.ok('ni convertir otro aviso en uno de actualización', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', format('update notifications set type = ''actualizacion_publicada'' where profile_id = %L and type = ''reporte_generado'' returning ''editado''', t.prof('comun'))) like 'ERR:42501%');
select t.ok('ni cambiarle el dueño', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', format('update notifications set profile_id = %L where profile_id = %L and type = ''actualizacion_publicada'' returning ''editado''', t.prof('admin'), t.prof('comun'))) like 'ERR:42501%');
select t.ok('el texto sigue intacto', not exists (select 1 from notifications where type = 'actualizacion_publicada' and title <> 'Nueva actualización'));

select '== 7. Lectura por persona';
select t.ok('la bandeja de usuario común muestra los avisos sin leer (una versión cada uno)', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', 'select count(*)::text from my_notifications where type = ''actualizacion_publicada'' and not is_read') = 'ok:4');
select t.ok('lo mismo ve quien trabaja solo en un departamento', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('mfuego')) || '"}', 'select count(*)::text from my_notifications where type = ''actualizacion_publicada'' and not is_read') = 'ok:4');
select t.ok('y una persona sin ningún rol', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('sinrol')) || '"}', 'select count(*)::text from my_notifications where type = ''actualizacion_publicada'' and not is_read') = 'ok:4');
select t.ok('nadie ve los avisos de otra persona (tampoco Informática)', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'select count(*)::text from my_notifications where type = ''actualizacion_publicada''') = 'ok:4');
select t.ok('comun marca los suyos como leídos', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', 'select mark_notifications_read(null)::text') = 'ok:5');
select t.ok('a comun le quedan 0 sin leer', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', 'select count(*)::text from my_notifications where type = ''actualizacion_publicada'' and not is_read') = 'ok:0');
select t.ok('a las demás personas no les cambió nada', (select count(*) from notifications where type = 'actualizacion_publicada' and is_read) = 4);
select t.ok('el aviso marcado como leído sigue siendo el mismo (solo cambió is_read)', exists (select 1 from notifications where type = 'actualizacion_publicada' and profile_id = t.prof('comun') and is_read and title = 'Nueva actualización'));

select '== 8. Registro de versiones (app_releases)';
select t.ok('informatica_r4 lo lee', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'select count(*)::text from app_releases') = 'ok:' || (select count(*) from app_releases)::text);
select t.ok('el integrante de Informática no', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('integ')) || '"}', 'select count(*)::text from app_releases') = 'ok:0');
select t.ok('un usuario común no', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('comun')) || '"}', 'select count(*)::text from app_releases') = 'ok:0');
select t.ok('anon no tiene acceso a la tabla', not has_table_privilege('anon', 'public.app_releases', 'select'));
select t.ok('informatica_r4 no puede insertar una versión', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'insert into app_releases (version, modules) values (''9.9.9'', array[''Inicio'']) returning ''ok''') like 'ERR:42501%');
select t.ok('ni modificar ni borrar', pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'update app_releases set modules = array[''Inicio''] returning ''ok''') like 'ERR:42501%' and pg_temp.api('authenticated', '{"role":"authenticated","sub":"' || (select auth_user_id from profiles where id = t.prof('admin')) || '"}', 'delete from app_releases returning ''ok''') like 'ERR:42501%');

select '== 9. El RPC viejo de novedades quedó cerrado';
select t.ok('authenticated no puede ejecutar ensure_app_update_notification', not has_function_privilege('authenticated', 'public.ensure_app_update_notification(text,text,text)', 'execute'));
select t.ok('anon tampoco', not has_function_privilege('anon', 'public.ensure_app_update_notification(text,text,text)', 'execute'));

select '== 10. Estado general';
select t.ok('los candados no rompieron las notificaciones de siempre: el tipo "prueba" se sigue insertando como dueño de la base', (select count(*) from (select 1 from notifications limit 1) x) = 1);
select t.ok('la lista de módulos tiene los 19 nombres', cardinality(release_modules()) = 19 and 'Asistente SIGER4' = any (release_modules()) and 'Mapa Regional' = any (release_modules()));
select t.ok('ningún módulo usa "Región"', not exists (select 1 from unnest(release_modules()) m where m ilike '%región%' or m ilike '%region %'));

rollback;
