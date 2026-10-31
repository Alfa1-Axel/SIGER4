-- SIGER4 - Edición sin pisarse: versión por registro (v1.14.0)
--
-- Problema: dos personas abren el mismo registro (un informe, un cuartel, un
-- punto del mapa...), cada una cambia algo y la que guarda última borra en
-- silencio lo que guardó la primera. Hoy el sistema no tenía ninguna defensa
-- (ni versión ni comparación): el último que guarda gana.
--
-- Solución (control optimista, resuelto en la base y no en la pantalla):
--   - Cada registro de las tablas de abajo tiene row_version (arranca en 1) y
--     updated_by_profile_id (quién lo cambió por última vez).
--   - Al abrir el registro, la pantalla recuerda su row_version. Al guardar,
--     manda esa versión junto con los cambios. El disparador compara contra
--     la fila real DENTRO de la misma sentencia UPDATE, con la fila ya
--     bloqueada: si la versión mandada no es la vigente, rechaza con el
--     código P0409 y NO se escribe nada. No hay "leer y después escribir":
--     no existe una ventana entre la lectura y la escritura.
--   - El disparador es el único que escribe row_version y
--     updated_by_profile_id: lo que mande el cliente en esas columnas no se
--     usa. La versión sube en uno solo cuando cambia el contenido (los
--     contadores derivados y updated_at no cuentan); quien cambió es la
--     persona de la sesión, nunca un valor del cliente.
--
-- Qué NO hace (queda dicho en DEPLOYMENT.md sección 70): quien actualiza sin
-- mandar la versión (una pantalla vieja guardada en caché, una llamada
-- directa que la omite) sigue guardando como siempre, sin comprobación. Esta
-- migración protege a las pantallas del sistema, que siempre la mandan, y a
-- cualquier cliente que la declare; no convierte la versión en obligatoria
-- para todos para no romper las pantallas que todavía estén abiertas durante
-- el despliegue.
--
-- Es idempotente: se puede correr varias veces. Agrega columnas con valor por
-- defecto (los registros existentes quedan en versión 1) y no modifica datos.

-- ---------------- 1. La función del disparador ----------------

create or replace function enforce_row_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  -- Sin argumentos, tg_argv llega nulo (no vacío): sin esto la resta daría nulo y
  -- ningún cambio se detectaría.
  v_ignored text[] := coalesce(tg_argv, array[]::text[]);
begin
  if tg_op = 'INSERT' then
    -- Un alta siempre arranca en 1 y a nombre de la sesión, diga lo que diga
    -- el cliente.
    new.row_version := 1;
    new.updated_by_profile_id := current_profile_id();
    return new;
  end if;

  -- UPDATE. Quien declaró una versión distinta de la vigente editó una copia
  -- vieja: no se pisa nada.
  if new.row_version is distinct from old.row_version then
    raise exception 'El registro fue actualizado por otra persona mientras lo editabas.'
      using errcode = 'P0409',
            detail = 'row_version vigente: ' || old.row_version::text,
            hint = old.row_version::text;
  end if;

  -- Contenido = todo menos la versión, quién/cuándo y las columnas derivadas
  -- que se pasan como argumentos del disparador (contadores que otras tablas
  -- recalculan solas y no son una edición de la persona).
  v_old := to_jsonb(old) - 'row_version' - 'updated_at' - 'updated_by_profile_id' - v_ignored;
  v_new := to_jsonb(new) - 'row_version' - 'updated_at' - 'updated_by_profile_id' - v_ignored;
  if v_old is distinct from v_new then
    new.row_version := old.row_version + 1;
    new.updated_by_profile_id := current_profile_id();
  else
    new.updated_by_profile_id := old.updated_by_profile_id;
  end if;
  return new;
end;
$$;

comment on function enforce_row_version() is 'Disparador de control optimista (0112): rechaza con P0409 un UPDATE que declara una row_version distinta de la vigente, sube la versión cuando cambia el contenido y fija updated_by_profile_id a la persona de la sesión. Los argumentos del disparador son columnas derivadas que no cuentan como edición.';

-- Es una función de disparador: nadie la llama desde la API.
revoke all on function enforce_row_version() from public, anon, authenticated;

-- ---------------- 2. Las tablas ----------------

-- attendance_summaries e intervention_summaries no tenían updated_at: sin él
-- no se puede decir cuándo se cambió por última vez.
alter table attendance_summaries add column if not exists updated_at timestamptz not null default now();
alter table intervention_summaries add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_attendance_summaries_updated_at on attendance_summaries;
create trigger trg_attendance_summaries_updated_at before update on attendance_summaries
  for each row execute function set_updated_at();
drop trigger if exists trg_intervention_summaries_updated_at on intervention_summaries;
create trigger trg_intervention_summaries_updated_at before update on intervention_summaries
  for each row execute function set_updated_at();

do $versioning$
declare
  r record;
  v_args text;
begin
  for r in
    select * from (values
      -- Informes y actas
      ('department_reports', array[]::text[]),
      ('department_activity_reports', array[]::text[]),
      ('intervention_summaries', array[]::text[]),
      ('attendance_summaries', array[]::text[]),
      -- Datos institucionales (los contadores los recalculan solos los
      -- registros de personal y vehículos: no son una edición del cuartel)
      ('stations', array['personnel_count', 'vehicles_count']),
      ('departments', array[]::text[]),
      ('vehicles', array[]::text[]),
      ('inventory_items', array[]::text[]),
      ('personnel', array[]::text[]),
      ('courses', array[]::text[]),
      -- reminder_sent_at lo marca solo el recordatorio automático (pg_cron): no es una edición
      ('calendar_events', array['reminder_sent_at']),
      ('station_history_events', array[]::text[]),
      ('school_avales_documents', array[]::text[]),
      -- Documentos
      ('documents', array[]::text[]),
      ('document_folders', array[]::text[]),
      -- Mapa
      ('map_reference_points', array[]::text[])
    ) as v(tbl, ignored)
  loop
    execute format('alter table %I add column if not exists row_version bigint not null default 1', r.tbl);
    execute format('alter table %I add column if not exists updated_by_profile_id uuid references profiles(id) on delete set null', r.tbl);
    execute format('comment on column %I.row_version is %L', r.tbl, 'Versión del registro (0112). La sube solo el disparador cuando cambia el contenido; al guardar, la pantalla manda la que leyó y, si ya no es la vigente, la base rechaza el cambio (P0409).');
    execute format('comment on column %I.updated_by_profile_id is %L', r.tbl, 'Quién cambió el registro por última vez (0112). Lo fija el disparador a la persona de la sesión; el cliente no lo puede escribir.');
    select coalesce(string_agg(quote_literal(c), ', '), '') into v_args from unnest(r.ignored) as c;
    execute format('drop trigger if exists trg_zz_row_version on %I', r.tbl);
    -- trg_zz_...: corre al final de los disparadores BEFORE (orden alfabético),
    -- cuando los demás ya terminaron de ajustar la fila.
    execute format(
      'create trigger trg_zz_row_version before insert or update on %I for each row execute function enforce_row_version(%s)',
      r.tbl, v_args
    );
  end loop;
end;
$versioning$;
