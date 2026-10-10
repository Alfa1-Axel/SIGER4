-- SIGER4 - Refuerzo de seguridad de la base (v1.14.0)
--
-- Auditoría de 20 controles (DEPLOYMENT.md sección 70). Lo que esta migración
-- corrige, con la prueba que lo mostró:
--
--   1. get_system_setting(): cualquiera con la clave pública (anon) o con
--      cualquier cuenta podía llamarla por la API y leer los valores de
--      system_settings, entre ellos cron_shared_secret. La 0073 decía "sin
--      grant a authenticated", pero en Supabase una función nueva de public
--      queda con EXECUTE explícito para anon y authenticated, y "revoke ...
--      from public" no lo quita (la 0100 ya lo había explicado para otras
--      funciones). Se revoca a anon y authenticated; la siguen usando otras
--      funciones SECURITY DEFINER y service_role.
--      ► Si la 0116 recién se corre ahora, el secreto pudo haber sido leído por
--        cualquiera desde que existe esa función: hay que rotarlo (ver 70.9).
--
--   2. anon (sin sesión) no necesita nada del schema public: la app no hace
--      ninguna consulta ni RPC sin iniciar sesión. Se le quita todo (funciones,
--      tablas, vistas y secuencias) y se evita que los objetos futuros nazcan
--      con permisos para anon. La RLS ya devolvía cero filas; esto además hace
--      que ni se intente (cierre en profundidad).
--
--   3. Funciones de disparador: nadie las llama desde la API; se les quita
--      EXECUTE a public, anon y authenticated (un disparador no necesita que
--      el usuario tenga EXECUTE para dispararse).
--
--   4. Autoría: quien cargaba un documento, una carpeta, un punto del mapa,
--      una actividad de departamento, etc., podía firmar el registro a nombre de
--      otra persona (el cliente mandaba uploaded_by/created_by y la base lo
--      aceptaba). Un disparador fija ahora la autoría a la persona de la sesión
--      y no deja cambiarla a otra persona después.
--
--   5. Largos: varios textos libres solo tenían límite en la pantalla; una
--      llamada directa a la API podía guardar megabytes. Se agregan límites
--      generosos (NOT VALID: no tocan lo ya guardado, rigen para lo nuevo).
--
--   6. station-media: se quita image/svg+xml de los tipos admitidos. Un SVG
--      puede llevar scripts y, abierto directo desde su URL, los ejecuta.
--
-- Es idempotente. No modifica datos existentes.

-- ============================================================
-- 1. Secreto de configuración
-- ============================================================

revoke all on function get_system_setting(text) from public, anon, authenticated;

-- ============================================================
-- 2. anon: nada del schema public
-- ============================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Funciones: Postgres da EXECUTE a PUBLIC (y anon es parte de PUBLIC) a toda función
-- nueva, además del permiso explícito de Supabase para anon/authenticated. Hay que
-- quitar los dos. Las de una extensión (si alguna vive en public) y las que no son
-- del rol que corre la migración no se tocan. authenticated y service_role
-- conservan exactamente los permisos explícitos que ya tenían (no se les agrega
-- ninguno: varias funciones internas se les quitaron a propósito).
do $anon_functions$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proowner = (select oid from pg_roles where rolname = current_user)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end;
$anon_functions$;

-- Lo que se cree de acá en adelante (con el rol que corre las migraciones) tampoco
-- nace con permisos para anon ni para PUBLIC.
alter default privileges in schema public revoke all on functions from anon;
-- (sin IN SCHEMA: el EXECUTE para PUBLIC es el valor por defecto de Postgres y solo se quita así)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ============================================================
-- 3. Funciones de disparador
-- ============================================================

do $triggers$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$triggers$;

-- ============================================================
-- 4. Autoría protegida
-- ============================================================

-- Argumento del disparador: la columna con la persona autora.
--  - Al crear: queda la persona de la sesión (current_profile_id()), diga lo que
--    diga el cliente. Si no hay sesión de usuario (migraciones, Edge Functions con
--    service_role, mantenimiento), no se toca.
--  - Al modificar: no se puede pasar a otra persona. Sí puede quedar en null (la
--    persona se eliminó: on delete set null) y puede completarse si estaba vacía.
create or replace function protect_author_column()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_column text := tg_argv[0];
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new := jsonb_populate_record(new, jsonb_build_object(v_column, current_profile_id()));
    end if;
    return new;
  end if;
  -- Sin sesión de usuario (mantenimiento, Edge Functions con service_role) no se interviene.
  if auth.uid() is null then
    return new;
  end if;
  v_old := to_jsonb(old);
  if v_old->>v_column is not null
     and v_new->>v_column is not null
     and v_new->>v_column is distinct from v_old->>v_column then
    new := jsonb_populate_record(new, jsonb_build_object(v_column, v_old->>v_column));
  end if;
  return new;
end;
$$;

comment on function protect_author_column() is 'Disparador (0116): fija la autoría (columna indicada como argumento) a la persona de la sesión al crear y no deja pasarla a otra persona al modificar.';

revoke all on function protect_author_column() from public, anon, authenticated;

do $authors$
declare
  r record;
begin
  for r in
    select * from (values
      ('documents', 'uploaded_by_profile_id'),
      ('document_versions', 'uploaded_by_profile_id'),
      ('document_folders', 'created_by_profile_id'),
      ('inventory_items', 'created_by_profile_id'),
      ('inventory_loan_requests', 'requested_by_profile_id'),
      ('department_activity_reports', 'created_by_profile_id'),
      ('department_manual_members', 'created_by_profile_id'),
      ('departments', 'created_by_profile_id'),
      ('station_history_events', 'created_by_profile_id'),
      ('map_reference_points', 'created_by_profile_id')
    ) as v(tbl, col)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists trg_protect_author on %I', r.tbl);
      execute format(
        'create trigger trg_protect_author before insert or update on %I for each row execute function protect_author_column(%L)',
        r.tbl, r.col
      );
    end if;
  end loop;
end;
$authors$;

-- ============================================================
-- 5. Largos de texto en la base
-- ============================================================

do $limits$
declare
  r record;
  v_name text;
begin
  for r in
    select * from (values
      -- títulos y nombres
      ('calendar_events', 'title', 300), ('courses', 'title', 300), ('department_activity_reports', 'title', 300),
      ('department_reports', 'title', 300), ('documents', 'title', 300), ('documents', 'category', 100),
      ('school_avales_documents', 'title', 300), ('station_history_events', 'title', 300), ('document_folders', 'name', 200),
      ('departments', 'name', 200), ('inventory_items', 'name', 200), ('stations', 'name', 200), ('map_reference_points', 'name', 200),
      ('profiles', 'full_name', 200), ('vehicles', 'internal_code', 60), ('vehicles', 'vehicle_type', 100), ('vehicles', 'plate', 20),
      -- direcciones y contactos
      ('stations', 'address', 300), ('stations', 'email', 254), ('stations', 'phone', 60), ('stations', 'whatsapp_phone', 60),
      ('personnel', 'email', 254), ('personnel', 'phone', 60), ('profiles', 'email', 254), ('profiles', 'phone', 60),
      -- descripciones y observaciones
      ('calendar_events', 'description', 5000), ('department_activity_reports', 'description', 5000), ('documents', 'description', 5000),
      ('document_folders', 'description', 2000), ('departments', 'description', 5000), ('inventory_items', 'description', 5000),
      ('inventory_items', 'observations', 5000), ('station_history_events', 'description', 5000), ('stations', 'description', 5000),
      ('stations', 'map_notes', 2000), ('map_reference_points', 'description', 5000), ('intervention_summaries', 'observations', 2000),
      ('vehicles', 'observations', 2000), ('personnel', 'observations', 2000), ('inventory_loan_requests', 'request_reason', 2000),
      ('inventory_loan_requests', 'notes', 2000)
    ) as v(tbl, col, max_len)
  loop
    v_name := r.tbl || '_' || r.col || '_max_len';
    if to_regclass('public.' || r.tbl) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.col)
       and not exists (select 1 from pg_constraint where conname = v_name and conrelid = ('public.' || r.tbl)::regclass) then
      execute format('alter table %I add constraint %I check (char_length(%I) <= %s) not valid', r.tbl, v_name, r.col, r.max_len);
    end if;
  end loop;
end;
$limits$;

-- ============================================================
-- 6. Imágenes institucionales: sin SVG
-- ============================================================

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'station-media';
