-- SIGER4 - Suscripciones de notificaciones push (Web Push API)
--
-- Cada fila representa una suscripcion push de un navegador/dispositivo
-- concreto para un perfil. Un mismo perfil puede tener varias filas (varios
-- dispositivos/navegadores). endpoint es unico por definicion del navegador,
-- asi que se usa como clave de upsert para evitar duplicados si el usuario
-- vuelve a aceptar el permiso en el mismo dispositivo.
--
-- No se guarda nada sensible: endpoint/p256dh/auth son datos de enrutamiento
-- del navegador (necesarios para enviar el push), no contienen informacion
-- personal. La clave privada VAPID nunca se guarda aca ni en el frontend,
-- solo vive como secreto de la Edge Function send-push.

-- El frontend dispara el push inmediatamente despues de crear una
-- notificacion el mismo (formulario manual, auto-notificacion de reporte
-- generado), pero las notificaciones automaticas (curso nuevo, documento
-- nuevo, cambio de estado, asistencia/intervencion cargada) las crea un
-- trigger de Postgres sin que el frontend participe. Para esos casos, el
-- frontend escucha por Realtime los inserts en "notifications" (filtrados
-- por RLS: cada usuario solo recibe los que ya podria ver) y dispara el push
-- desde ahi. Hace falta agregar la tabla a la publicacion de Realtime.
alter publication supabase_realtime add table notifications;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table push_subscriptions is 'Suscripciones Web Push por perfil/dispositivo, usadas por la Edge Function send-push para enviar notificaciones push reales.';

create index idx_push_subscriptions_profile_id on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

-- Un usuario ve, crea y borra solo sus propias suscripciones (sus propios
-- dispositivos). informatica_r4 puede ver todas para diagnostico, pero no
-- hace falta que pueda crear/borrar suscripciones ajenas.
create policy "push_subscriptions_select_own_or_admin" on push_subscriptions
  for select using (profile_id = current_profile_id() or is_informatica_r4());

create policy "push_subscriptions_insert_own" on push_subscriptions
  for insert with check (profile_id = current_profile_id());

create policy "push_subscriptions_update_own" on push_subscriptions
  for update using (profile_id = current_profile_id());

create policy "push_subscriptions_delete_own" on push_subscriptions
  for delete using (profile_id = current_profile_id());

-- Se agrega una rama en audit_row_change() para resolver el contexto
-- territorial de push_subscriptions (via el perfil dueño de la suscripcion,
-- mismo patron que user_roles/user_scopes), y se crea el trigger de auditoria.
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

  if (tg_op = 'INSERT') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'insert', tg_table_name, new.id::text, null, to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new), v_region_id, v_subsede_id, v_station_id);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_logs (actor_profile_id, action, table_name, record_id, old_value, new_value, region_id, subsede_id, station_id)
    values (actor, 'delete', tg_table_name, old.id::text, to_jsonb(old), null, v_region_id, v_subsede_id, v_station_id);
    return old;
  end if;
  return null;
end;
$$;

comment on function audit_row_change() is 'Registra en audit_logs cada alta/baja/modificacion de las tablas auditadas, resolviendo tambien su contexto territorial (region/subsede/cuartel) segun la forma de cada tabla.';

create trigger trg_audit_push_subscriptions
  after insert or update or delete on push_subscriptions
  for each row execute function audit_row_change();
