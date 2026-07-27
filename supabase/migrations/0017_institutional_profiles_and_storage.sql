-- SIGER4 - Perfil institucional del cuartel + perfil de usuario + Storage
--
-- Agrega campos de contacto/descripcion institucional a stations, y campos de
-- perfil personal a profiles. Prepara dos buckets de Supabase Storage (uno
-- para medios institucionales de cuarteles, otro para avatares de usuario)
-- con politicas RLS propias.
--
-- Decisiones de nombres para no chocar con columnas ya existentes:
--  - stations.cover_image_url ya existe (foto de portada); se agrega
--    logo_url como campo distinto (isologo/escudo institucional, si aplica).
--  - profiles.rank ya existe (jerarquia); se agrega "position" como cargo o
--    funcion (distinto de jerarquia: ej. jerarquia "Comandante", cargo
--    "Jefe de Cuerpo Activo"). profiles.avatar_url ya existe.
--  - "Departamento/s a los que pertenece" no se duplica aqui: ya se modela
--    via user_roles/user_scopes, que es la fuente de verdad.

alter table stations
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists social_media jsonb,
  add column if not exists description text,
  add column if not exists logo_url text;

comment on column stations.phone is 'Telefono de contacto del cuartel.';
comment on column stations.email is 'Email institucional del cuartel.';
comment on column stations.social_media is 'Redes sociales del cuartel, formato libre {"facebook": "...", "instagram": "..."}.';
comment on column stations.description is 'Descripcion institucional libre del cuartel.';
comment on column stations.logo_url is 'Logo/escudo institucional del cuartel (Supabase Storage). Distinto de cover_image_url (foto de portada).';

alter table profiles
  add column if not exists phone text,
  add column if not exists "position" text,
  add column if not exists seniority_start_date date;

comment on column profiles.phone is 'Telefono de contacto del usuario.';
comment on column profiles."position" is 'Cargo o funcion del usuario (distinto de rank, que es la jerarquia). Ej: "Jefe de Cuerpo Activo".';
comment on column profiles.seniority_start_date is 'Fecha de ingreso, usada para calcular antiguedad.';

-- ============================================================
-- BLOQUEAR AUTO-CAMBIO DE ALCANCE (station_id/region_id) EN PROFILES
-- ============================================================
-- profiles_update_self permite a cualquier usuario actualizar su propio
-- perfil, pero sin restriccion de columnas eso incluye station_id/region_id
-- (su alcance de cuartel/region). Un trigger BEFORE UPDATE es la forma
-- correcta de rechazar esos cambios especificos cuando quien actualiza no es
-- informatica_r4 (RLS "with check" no puede comparar contra el valor previo
-- de la fila, por eso se resuelve con un trigger, no con otra policy).

create or replace function prevent_self_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_informatica_r4() then
    return new;
  end if;

  if new.auth_user_id = auth.uid() then
    if new.station_id is distinct from old.station_id or new.region_id is distinct from old.region_id then
      raise exception 'No podés cambiar tu propio cuartel o región. Pedile a un administrador que lo haga.';
    end if;
  end if;

  return new;
end;
$$;

comment on function prevent_self_scope_change() is 'Impide que un usuario cambie su propio station_id/region_id al editar su perfil; solo informatica_r4 puede hacerlo.';

create trigger trg_prevent_self_scope_change
  before update on profiles
  for each row execute function prevent_self_scope_change();

-- ============================================================
-- SUPABASE STORAGE
-- ============================================================
-- Dos buckets: uno para medios institucionales de cuarteles (logos, fotos de
-- portada), otro para avatares de usuario. Ambos publicos de lectura (son
-- imagenes de perfil/institucionales, no informacion sensible) pero con
-- escritura restringida por politica.

insert into storage.buckets (id, name, public)
values ('station-media', 'station-media', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lectura publica (necesaria para poder mostrar las imagenes en la app sin
-- autenticacion adicional, igual que los logos estaticos ya servidos desde
-- /public).
create policy "station_media_public_read" on storage.objects
  for select using (bucket_id = 'station-media');

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Escritura de station-media: informatica_r4 o roles con permiso de edicion
-- de ese cuartel (mismo criterio que stations_update_admin_regional_or_own).
-- storage.objects no tiene station_id propio: se usa el primer segmento del
-- path como convencion (ej. "<station_id>/logo.png") para resolver el scope.
create policy "station_media_write_admin_regional_station" on storage.objects
  for insert with check (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or is_regional_role()
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

create policy "station_media_update_admin_regional_station" on storage.objects
  for update using (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or is_regional_role()
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

create policy "station_media_delete_admin_regional_station" on storage.objects
  for delete using (
    bucket_id = 'station-media'
    and (
      is_informatica_r4()
      or is_regional_role()
      or (
        (storage.foldername(name))[1]::uuid in (select my_station_ids())
        and (has_role('presidente_cuartel') or has_role('jefe_cuerpo_activo') or has_role('usuario_carga_cuartel'))
      )
    )
  );

-- Escritura de avatars: cada usuario solo puede escribir en su propia carpeta
-- (convencion "<profile_id>/avatar.png"), o informatica_r4 puede escribir en
-- cualquiera.
create policy "avatars_write_own_or_admin" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (is_informatica_r4() or (storage.foldername(name))[1]::uuid = current_profile_id())
  );

create policy "avatars_update_own_or_admin" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (is_informatica_r4() or (storage.foldername(name))[1]::uuid = current_profile_id())
  );

create policy "avatars_delete_own_or_admin" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (is_informatica_r4() or (storage.foldername(name))[1]::uuid = current_profile_id())
  );
