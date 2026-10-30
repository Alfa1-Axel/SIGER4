-- SIGER4 - Borradores de formularios guardados en el servidor (v1.14.0)
--
-- Problema: quien escribe un informe largo y pierde la conexión, se le vence
-- la sesión o cierra la pestaña sin querer pierde todo. Hasta ahora solo había
-- un borrador en sessionStorage de la pestaña (sin servidor, sin otros
-- dispositivos, sin vencimiento claro).
--
-- Un borrador NO es un registro publicado: vive en esta tabla aparte, sin
-- avisos, sin estadísticas, sin búsqueda y sin que lo vea nadie más que su
-- dueño (ni siquiera Informática). Publicar es el guardado normal del
-- formulario, con todas sus validaciones y la RLS de siempre; el borrador se
-- borra solo después de que ese guardado se confirmó.
--
-- Qué guarda: solo los campos de texto del formulario (payload). Nunca
-- archivos, contraseñas, claves, tokens ni URL firmadas: el disparador rechaza
-- los nombres de campo sospechosos y el tamaño máximo es 120 KB. Los archivos
-- se vuelven a elegir al recuperar el borrador.
--
-- Cuánto dura: 30 días desde el último guardado. El job diario
-- siger4-purge-form-drafts borra los vencidos, y cada guardado también limpia
-- los vencidos de su dueño.
--
-- Es idempotente. No modifica datos existentes.

create table if not exists form_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- Qué formulario es ('informe-departamento', 'documento', ...). Lista cerrada en save_form_draft().
  form_key text not null,
  -- Qué carga dentro del formulario: 'nuevo:<contexto>' para un alta, 'edit:<id>' para cambios sobre un registro existente.
  context_key text not null default '',
  -- Registro que se edita (null = alta nueva) y su versión al empezar (0112).
  record_id uuid,
  base_version bigint,
  -- Identificador elegido de antemano para el alta, para que reintentar la publicación nunca duplique el registro.
  client_record_id uuid,
  payload jsonb not null,
  -- Sube con cada guardado: detecta que otra pestaña o dispositivo guardó un borrador más nuevo.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint form_drafts_unique_context unique (profile_id, form_key, context_key),
  constraint form_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint form_drafts_form_key_format check (form_key ~ '^[a-z0-9-]{3,40}$'),
  constraint form_drafts_context_key_length check (char_length(context_key) <= 120)
);

comment on table form_drafts is 'Borradores de formularios (0113): texto escrito y todavía no publicado. Cada persona ve solo los suyos. No son registros: no generan avisos ni aparecen en listados, estadísticas ni búsquedas. Vencen a los 30 días.';
comment on column form_drafts.payload is 'Campos de texto del formulario. Sin archivos, contraseñas, claves, tokens ni URL firmadas (lo verifica el disparador).';
comment on column form_drafts.client_record_id is 'Id elegido por la pantalla para el registro que va a crear: si la publicación se reintenta, el segundo intento choca con el primero en vez de duplicarlo.';
comment on column form_drafts.revision is 'Sube en cada guardado; save_form_draft() rechaza (P0409) un guardado hecho sobre una revisión vieja.';

create index if not exists idx_form_drafts_expires_at on form_drafts(expires_at);

-- ---------------- Disparador: lo que no decide el cliente ----------------

create or replace function form_drafts_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := current_profile_id();
begin
  if tg_op = 'INSERT' then
    -- Dueño = la persona de la sesión, diga lo que diga el cliente. Solo el
    -- dueño de la base (migraciones, mantenimiento) puede crear a nombre de otro.
    if auth.uid() is not null then
      new.profile_id := v_actor;
    end if;
    if new.profile_id is null then
      raise exception 'Necesitás iniciar sesión para guardar un borrador.' using errcode = '42501';
    end if;
    -- Lista cerrada de formularios que admiten borrador. Agregar uno es una
    -- decisión que se toma acá (y no en la pantalla). Contraseñas, roles,
    -- permisos y acciones administrativas sensibles NO están, a propósito.
    if new.form_key not in (
      'informe-departamento',
      'actividad-departamento',
      'documento',
      'aval-escuela',
      'ficha-punto',
      'verificacion-punto'
    ) then
      raise exception 'Ese formulario no admite borradores.' using errcode = '22023';
    end if;
    -- Tope por persona: acota el espacio que puede ocupar.
    if (select count(*) from form_drafts d where d.profile_id = new.profile_id) >= 50 then
      raise exception 'Tenés demasiados borradores guardados. Publicá o descartá alguno antes de empezar otro.' using errcode = '54000';
    end if;
    new.revision := 1;
    new.created_at := now();
  else
    new.profile_id := old.profile_id;
    new.form_key := old.form_key;
    new.context_key := old.context_key;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
  end if;

  if octet_length(new.payload::text) > 120000 then
    raise exception 'El borrador es demasiado grande (máximo 120 KB de texto). Acortá lo escrito o adjuntalo como archivo.' using errcode = '54000';
  end if;
  -- Nada de credenciales: si algún campo se llama como una, se rechaza.
  if new.payload::text ~* '"[a-z_ -]*(password|contrasena|contraseña|passwd|secret|token|api_?key|authorization|signed_?url|private_?key)[a-z_ -]*"\s*:' then
    raise exception 'Ese formulario no admite borradores con contraseñas, claves ni tokens.' using errcode = '22023';
  end if;

  new.updated_at := now();
  new.expires_at := now() + interval '30 days';
  return new;
end;
$$;

revoke all on function form_drafts_before_write() from public, anon, authenticated;

drop trigger if exists trg_form_drafts_before_write on form_drafts;
create trigger trg_form_drafts_before_write before insert or update on form_drafts
  for each row execute function form_drafts_before_write();

-- ---------------- RLS: cada persona ve y toca solo los suyos ----------------

-- Los vencidos siguen siendo legibles por su dueño hasta que se purgan (la regla
-- de SELECT también se aplica a DELETE: si los ocultara, ni el dueño ni
-- save_form_draft() podrían limpiarlos). La pantalla pide solo los vigentes.

alter table form_drafts enable row level security;

drop policy if exists "form_drafts_select_own" on form_drafts;
create policy "form_drafts_select_own" on form_drafts
  for select using (profile_id = current_profile_id());

drop policy if exists "form_drafts_insert_own" on form_drafts;
create policy "form_drafts_insert_own" on form_drafts
  for insert with check (profile_id = current_profile_id());

drop policy if exists "form_drafts_update_own" on form_drafts;
create policy "form_drafts_update_own" on form_drafts
  for update using (profile_id = current_profile_id()) with check (profile_id = current_profile_id());

drop policy if exists "form_drafts_delete_own" on form_drafts;
create policy "form_drafts_delete_own" on form_drafts
  for delete using (profile_id = current_profile_id());

revoke all on form_drafts from anon;

-- ---------------- Guardar un borrador ----------------

-- SECURITY INVOKER: corre con la RLS de quien llama, así que solo puede tocar
-- sus propios borradores. La lista de formularios admitidos la controla el
-- disparador de la tabla, que vale también para quien escriba directo en ella.
create or replace function save_form_draft(
  p_form_key text,
  p_context_key text,
  p_record_id uuid,
  p_client_record_id uuid,
  p_base_version bigint,
  p_payload jsonb,
  p_expected_revision integer
)
returns table (revision integer, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile uuid := current_profile_id();
  v_context text := coalesce(p_context_key, '');
  v_row form_drafts%rowtype;
begin
  if v_profile is null then
    raise exception 'Necesitás iniciar sesión para guardar un borrador.' using errcode = '42501';
  end if;

  -- Los vencidos de esta persona se limpian al pasar.
  delete from form_drafts d where d.profile_id = v_profile and d.expires_at <= now();

  select * into v_row
  from form_drafts d
  where d.profile_id = v_profile and d.form_key = p_form_key and d.context_key = v_context
  for update;

  if not found then
    -- Quien creía tener un borrador (revisión > 0) y ya no existe: se publicó o
    -- se descartó en otra pestaña. No se lo vuelve a crear en silencio.
    if coalesce(p_expected_revision, 0) > 0 then
      raise exception 'Este borrador ya se publicó o se descartó en otra pestaña o dispositivo.'
        using errcode = 'P0409', hint = 'gone';
    end if;
    insert into form_drafts (profile_id, form_key, context_key, record_id, base_version, client_record_id, payload)
    values (v_profile, p_form_key, v_context, p_record_id, p_base_version, p_client_record_id, p_payload)
    returning form_drafts.revision, form_drafts.updated_at into revision, updated_at;
    return next;
    return;
  end if;

  if coalesce(p_expected_revision, 0) <> v_row.revision then
    raise exception 'Hay un borrador más nuevo de esta misma carga, guardado desde otra pestaña o dispositivo.'
      using errcode = 'P0409', hint = 'newer';
  end if;

  update form_drafts d
     set payload = p_payload,
         record_id = p_record_id,
         base_version = p_base_version,
         client_record_id = coalesce(p_client_record_id, d.client_record_id)
   where d.id = v_row.id
  returning d.revision, d.updated_at into revision, updated_at;
  return next;
end;
$$;

comment on function save_form_draft(text, text, uuid, uuid, bigint, jsonb, integer) is 'Crea o actualiza el borrador de la persona para un formulario y una carga. Rechaza con P0409 si el borrador cambió desde otra pestaña o dispositivo (revisión distinta de la esperada) o si ya no existe.';

revoke all on function save_form_draft(text, text, uuid, uuid, bigint, jsonb, integer) from public, anon;
grant execute on function save_form_draft(text, text, uuid, uuid, bigint, jsonb, integer) to authenticated;

-- ---------------- Limpieza de vencidos ----------------

create or replace function purge_expired_form_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from form_drafts where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function purge_expired_form_drafts() is 'Borra los borradores vencidos (30 días sin guardarse). Lo llama el job diario siger4-purge-form-drafts.';

revoke all on function purge_expired_form_drafts() from public, anon, authenticated;

do $cron$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('siger4-purge-form-drafts', '15 3 * * *', 'select purge_expired_form_drafts()');
  end if;
end;
$cron$;
