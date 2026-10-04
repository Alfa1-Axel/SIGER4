-- SIGER4 - Funciones internas: sin ejecución para usuarios ni anónimos
--
-- Supabase da EXECUTE a anon y authenticated sobre toda función nueva del
-- schema public (default privileges). Las migraciones de los envíos
-- programados y avisos internos (0066-0085) hacían "revoke ... from public",
-- que no quita esos permisos explícitos. Resultado: cualquiera con la anon
-- key, incluso sin iniciar sesión, podía llamar por la API a funciones que
-- no validan a quien las llama:
--   - notify_informatica_staff(título, texto): avisos con texto arbitrario
--     a todo el personal de Informática (con push).
--   - send_weekly_admin_summary(), send_weekly_reminder(),
--     send_loan_return_reminders(), send_calendar_event_reminders():
--     reenviar cuando quisiera los avisos programados a todos los usuarios.
--   - trigger_document_purge(): disparar la purga de la papelera fuera de
--     horario.
-- Ninguna devuelve datos (send_weekly_admin_summary cuenta altas y bajas de
-- audit_logs, pero el resultado va solo a Informática), pero permitían
-- enviar avisos falsos o masivos.
--
-- Estas funciones las ejecutan pg_cron (como postgres), otras funciones
-- SECURITY DEFINER o las Edge Functions con service_role: ninguna necesita
-- EXECUTE para anon ni authenticated. Se revoca solo a esos dos roles.
--
-- notify_admin_delete_user() sí la llama la Edge Function admin-delete-user
-- con la sesión del administrador: se mantiene ejecutable por authenticated
-- y pasa a validar que quien la llama sea de Informática (solo Informática
-- elimina usuarios).

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'notify_informatica_staff(text,text)',
    'send_weekly_admin_summary()',
    'send_weekly_reminder()',
    'send_loan_return_reminders()',
    'send_calendar_event_reminders()',
    'trigger_document_purge()'
  ]
  loop
    if to_regprocedure(v_fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    else
      raise notice '0100: la función % no existe en esta base, se omite.', v_fn;
    end if;
  end loop;
end;
$$;

create or replace function notify_admin_delete_user(p_deleted_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_informatica_r4() then
    raise exception 'Solo Informática puede registrar la eliminación de un usuario.' using errcode = '42501';
  end if;
  perform notify_informatica_staff(
    'Usuario eliminado: ' || p_deleted_full_name,
    'Se eliminó definitivamente el usuario "' || p_deleted_full_name || '".'
  );
end;
$$;

comment on function notify_admin_delete_user(text) is 'Aviso a Informática de que se eliminó un usuario. La llama la Edge Function admin-delete-user con la sesión de quien elimina; solo responde si es de Informática (is_informatica_r4()).';

revoke execute on function notify_admin_delete_user(text) from public, anon;
grant execute on function notify_admin_delete_user(text) to authenticated;
