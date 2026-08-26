-- SIGER4 - Auditoria de seguridad/privacidad: push_subscriptions exponia
-- endpoint/p256dh_key/auth_key completos en audit_logs a roles sin ninguna
-- autorizacion sobre push
--
-- Hallazgo (auditoria de exposicion, 2026-08-26): audit_row_change() (0004)
-- resuelve region_id/subsede_id/station_id para 'push_subscriptions' desde
-- el perfil dueño de la suscripcion, y guarda to_jsonb(new)/to_jsonb(old)
-- de la fila COMPLETA (incluye endpoint, p256dh_key, auth_key en texto
-- plano) en audit_logs.new_value/old_value.
--
-- Eso combinado con las policies de audit_logs (0003/0076) abre tres
-- caminos, todos mas amplios que el diseño explicito de las RPC de
-- diagnostico de push (0088/0089), que deliberadamente truncan el
-- endpoint a 40 caracteres y restringen a informatica_r4/integrante_informatica
-- o al propio usuario:
--
--   1. audit_logs_select_station / audit_logs_select_subsede (0003): NO
--      filtran por rol, solo por territorio (station_id/subsede_id in
--      my_station_ids()/my_subsede_ids()) -- y my_station_ids() incluye el
--      station_id del propio perfil de CUALQUIER usuario autenticado, sin
--      importar su rol. Un bombero comun del mismo cuartel que otro podia
--      ver, via Auditoria -> "Ver JSON tecnico", el endpoint/p256dh_key/
--      auth_key completos de la suscripcion push de su compañero.
--   2. audit_logs_select_regional (0076): intencionalmente amplia para
--      secretario_regional ("region_id is null or region_id in (...)");
--      como push_subscriptions SI resuelve region_id, cualquier
--      secretario_regional veia el mismo JSON completo de toda su region.
--   3. audit_logs_select_escuela (0076) no incluye 'push_subscriptions' en
--      su allowlist de tablas, asi que director_escuela/instructor NO
--      estaban expuestos por esa via -- el hueco era especificamente
--      station/subsede (sin filtro de rol) y regional (filtro de rol
--      correcto pero territorio amplio por diseño).
--
-- A diferencia del bug de 0076 (que era sobre QUE FILAS se veian), esto es
-- sobre QUE CONTENIDO tiene una fila que de por si es razonable que se vea
-- (que un usuario se suscribio/desuscribio a push es informacion de
-- auditoria legitima) -- el problema es que el valor de las columnas
-- endpoint/p256dh_key/auth_key no aporta nada a la auditoria y si es un
-- secreto real (un token de push robado permite mandar notificaciones
-- falsas a ese dispositivo especifico, y el endpoint identifica el
-- dispositivo). Las propias RPC de diagnostico de push (0088/0089) ya
-- reconocen esto truncando a 40 caracteres; audit_logs nunca aplico ese
-- mismo criterio porque to_jsonb(new)/to_jsonb(old) es generico para
-- todas las tablas.
--
-- Fix: audit_row_change() redacta especificamente estas 3 columnas para
-- 'push_subscriptions' antes de guardar new_value/old_value -- ninguna
-- politica de audit_logs necesita cambiar (el fix es sobre el CONTENIDO
-- guardado, no sobre quien puede leer la fila), y sigue siendo visible
-- que la fila existe/cambio (created_at, profile_id via record_id,
-- user_agent) para quien ya tenia acceso legitimo a esa auditoria.

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  v_region_id uuid;
  v_subsede_id uuid;
  v_station_id uuid;
  rec record;
  v_old_value jsonb;
  v_new_value jsonb;
begin
  actor := current_profile_id();
  rec := coalesce(new, old);

  case tg_table_name
    when 'stations' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.id;
    when 'subsedes' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.id;
    when 'profiles' then
      v_region_id := rec.region_id;
      v_station_id := rec.station_id;
      select subsede_id into v_subsede_id from stations where id = rec.station_id;
    when 'vehicles', 'personnel' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'courses' then
      v_region_id := rec.region_id;
    when 'documents' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
      if v_subsede_id is null and v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'user_roles', 'user_scopes' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    when 'notifications' then
      v_region_id := rec.region_id;
      v_subsede_id := rec.subsede_id;
      v_station_id := rec.station_id;
    when 'attendance_summaries', 'intervention_summaries' then
      v_station_id := rec.station_id;
      select region_id, subsede_id into v_region_id, v_subsede_id from stations where id = rec.station_id;
    when 'push_subscriptions' then
      select region_id, station_id into v_region_id, v_station_id from profiles where id = rec.profile_id;
      if v_station_id is not null then
        select subsede_id into v_subsede_id from stations where id = v_station_id;
      end if;
    else
      v_region_id := null;
      v_subsede_id := null;
      v_station_id := null;
  end case;

  -- Redaccion de contenido sensible ANTES de guardar en audit_logs -- solo
  -- para push_subscriptions, cuyas columnas endpoint/p256dh_key/auth_key
  -- son credenciales de dispositivo, no datos de negocio auditables. Mismo
  -- criterio de truncado (40 caracteres) que ya usan get_own_push_diagnostics/
  -- get_push_subscriptions_admin_diagnostics (0088/0089) para el endpoint;
  -- p256dh_key/auth_key se redactan por completo porque a diferencia del
  -- endpoint (util para identificar "cual dispositivo" en un vistazo), la
  -- clave en si no tiene ningun valor diagnostico.
  if tg_table_name = 'push_subscriptions' then
    if new is not null then
      v_new_value := to_jsonb(new)
        || jsonb_build_object(
          'endpoint', left(new.endpoint, 40) || '…[redacted]',
          'p256dh_key', '[redacted]',
          'auth_key', '[redacted]'
        );
    end if;
    if old is not null then
      v_old_value := to_jsonb(old)
        || jsonb_build_object(
          'endpoint', left(old.endpoint, 40) || '…[redacted]',
          'p256dh_key', '[redacted]',
          'auth_key', '[redacted]'
        );
    end if;
  else
    v_new_value := to_jsonb(new);
    v_old_value := to_jsonb(old);
  end if;

  if (tg_op = 'INSERT') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'insert', tg_table_name, new.id::text, null, v_new_value, v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'update', tg_table_name, new.id::text, v_old_value, v_new_value, v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'delete', tg_table_name, old.id::text, v_old_value, null, v_region_id, v_subsede_id, v_station_id);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla. Revision 0091: redacta endpoint (truncado a 40 chars)/p256dh_key/auth_key para push_subscriptions -- esas columnas son credenciales de dispositivo (un endpoint+claves robados permiten mandar push falsos a ese dispositivo puntual), sin valor diagnostico en si mismas, y ninguna politica de audit_logs las necesitaba en texto plano. Ver migracion 0091 para el detalle completo del hallazgo (auditoria de exposicion).';

-- ============================================================
-- Backfill: redactar filas YA EXISTENTES en audit_logs para
-- push_subscriptions -- el fix de arriba solo protege inserts futuros.
-- Sin esto, cualquier suscripcion creada/borrada/actualizada antes de esta
-- migracion sigue teniendo el endpoint/claves completos en las filas
-- historicas de audit_logs.
-- ============================================================

update audit_logs
set
  new_value = case when new_value is not null then
    new_value || jsonb_build_object(
      'endpoint', left(new_value->>'endpoint', 40) || '…[redacted]',
      'p256dh_key', '[redacted]',
      'auth_key', '[redacted]'
    )
  else new_value end,
  old_value = case when old_value is not null then
    old_value || jsonb_build_object(
      'endpoint', left(old_value->>'endpoint', 40) || '…[redacted]',
      'p256dh_key', '[redacted]',
      'auth_key', '[redacted]'
    )
  else old_value end
where table_name = 'push_subscriptions'
  and (
    (new_value is not null and new_value->>'p256dh_key' is not null and new_value->>'p256dh_key' <> '[redacted]')
    or (old_value is not null and old_value->>'p256dh_key' is not null and old_value->>'p256dh_key' <> '[redacted]')
  );
