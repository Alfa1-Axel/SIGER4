-- SIGER4 - Retirar el flujo de auto-registro (link_invited_profile)
--
-- Problema (ver auditoria de seguridad): el flujo anterior creaba un perfil
-- con auth_user_id null (RegistroPage + inviteProfile) y confiaba en que la
-- primera persona en hacer supabase.auth.signUp con ese email exacto era la
-- persona real invitada. link_invited_profile vinculaba automaticamente esa
-- cuenta al perfil, sin token ni verificacion previa. Un atacante que se
-- registrara primero con el email de un futuro invitado se quedaba con el
-- perfil (y sus roles/scope) apenas el admin lo creaba.
--
-- Decision (confirmada con el cliente): se elimina el auto-registro por
-- completo. Los usuarios ahora se crean directamente por el Dpto. de
-- Informatica y Estadistica R4 via la Edge Function admin-create-user
-- (service_role, auth.admin.createUser + insert de profiles en un solo paso,
-- auth_user_id siempre seteado desde el alta). Ver
-- supabase/functions/admin-create-user/index.ts.
--
-- Esta migracion:
--   1. Retira el trigger/funcion que hacia el auto-link.
--   2. Otorga EXECUTE en is_informatica_r4() a authenticated (la Edge
--      Function la llama via RPC bajo el JWT del admin que invoca).
--   3. Dejar documentado que perfiles viejos con auth_user_id null (invites
--      pendientes del flujo anterior, si los hubiera) deben resolverse a
--      mano: o se les crea la cuenta con admin-create-user y se fusiona el
--      perfil, o se borran si ya no corresponden. No se borran datos
--      automaticamente aca.

drop trigger if exists trg_link_invited_profile on auth.users;
drop function if exists link_invited_profile();

comment on column profiles.auth_user_id is 'Cuenta de Supabase Auth vinculada. Se crea SIEMPRE junto con el perfil via admin-create-user; ya no queda pendiente/null en altas nuevas. Perfiles con auth_user_id null son residuo del flujo de auto-registro retirado (migracion 0029) y requieren resolucion manual.';

revoke all on function is_informatica_r4() from public;
grant execute on function is_informatica_r4() to authenticated;
